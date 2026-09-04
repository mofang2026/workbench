#!/usr/bin/env python3
"""
workbench 部署脚本 - 通过 SSH/SFTP 直传到阿里云 ECS 服务器（域名 workbench.shuncheng.xin）
用法:
    python deploy.py frontend            # 部署前端到 /var/www/workbench.shuncheng.xin
    python deploy.py frontend -f index.html  # 只传单个文件
    python deploy.py frontend --verify   # 验证前端
    python deploy.py api                 # 部署 AI 代理服务到 /opt/workbench-api 并重启
    python deploy.py api --verify        # 验证 API 服务
前置: 需 paramiko (pip install paramiko)；SSH 私钥 ~/.ssh/shuncheng_rsa
"""
import argparse
import os
import sys
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("缺少 paramiko，请先安装：pip install paramiko")
    sys.exit(1)

# ===== 服务器配置（与灵序同一台 ECS） =====
SERVER_IP = "39.97.226.47"
SSH_PORT = 22
SSH_USER = "root"
SSH_KEY_PATH = os.path.expanduser("~/.ssh/shuncheng_rsa")

# ===== 部署目标配置 =====
PROJECT_ROOT = Path(__file__).resolve().parent.parent   # workbench 工程根（deploy/ 的上一级）
FRONTEND_REMOTE = "/var/www/workbench.shuncheng.xin"
API_REMOTE = "/opt/workbench-api"
API_UNIT = "workbench-api.service"
API_HEALTHCHECK = "curl -s http://127.0.0.1:3790/healthz"

# 前端需同步的文件（仅 index.html + assets/**，其余一律排除）
FRONTEND_FILES = ["index.html"]
FRONTEND_ASSETS_DIR = "assets"

# API 需同步的文件（零依赖，不需要 node_modules / npm install）
API_FILES = ["server.js"]


def ssh_connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SERVER_IP, port=SSH_PORT, username=SSH_USER,
                   key_filename=SSH_KEY_PATH, timeout=15)
    return client


def remote_exec(client, cmd, timeout=120):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    rc = stdout.channel.recv_exit_status()
    return out, err, rc


def upload_file(sftp, local_path, remote_path):
    # SFTP 远程路径必须用正斜杠：Windows 下 os.path.join 可能产出反斜杠导致上传到错误目标
    remote_path = remote_path.replace("\\", "/")
    remote_dir = os.path.dirname(remote_path)
    parts = remote_dir.strip("/").split("/")
    current = ""
    for part in parts:
        current += "/" + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)
    sftp.put(local_path, remote_path)


def upload_many(client, base_local, base_remote, rel_files):
    sftp = client.open_sftp()
    try:
        for rel in rel_files:
            local_path = os.path.join(base_local, rel)
            remote_path = os.path.join(base_remote, rel)
            upload_file(sftp, local_path, remote_path)
            print(f"  ↑ {rel}")
    finally:
        sftp.close()


def collect_frontend_files():
    """index.html + assets/** 全部文件（扁平列出相对路径）"""
    files = list(FRONTEND_FILES)
    assets = PROJECT_ROOT / FRONTEND_ASSETS_DIR
    if assets.is_dir():
        files += [str(p.relative_to(PROJECT_ROOT)).replace("\\", "/")
                  for p in assets.rglob("*") if p.is_file()]
    return files


def collect_api_files():
    """server.js + api/**/*.js（相对路径），并带 systemd 单元"""
    files = list(API_FILES)
    api_dir = PROJECT_ROOT / "api"
    if api_dir.is_dir():
        files += [str(p.relative_to(PROJECT_ROOT)).replace("\\", "/")
                  for p in api_dir.rglob("*.js") if p.is_file()]
    # 附带 systemd 单元与 nginx 配置（相对 deploy/），存为 deploy/xxx 便于上传
    files += ["deploy/workbench-api.service"]
    return files


def deploy_frontend(client, single_file=None):
    print(f"===== 部署前端 -> workbench.shuncheng.xin ({FRONTEND_REMOTE}) =====")
    rel_files = collect_frontend_files()
    if single_file:
        rel_files = [single_file]
    upload_many(client, str(PROJECT_ROOT), FRONTEND_REMOTE, rel_files)

    out, err, rc = remote_exec(client, "nginx -t 2>&1 && systemctl reload nginx 2>&1")
    if rc != 0:
        print("!! Nginx 校验失败，未重载 =>", err)
        sys.exit(1)
    print(out)
    print("前端部署完成")
    verify_frontend(client)


def verify_frontend(client):
    print("===== 验证前端 =====")
    out, err, rc = remote_exec(client,
        f"curl -sk -o /dev/null -w '%{{http_code}} %{{size_download}}' "
        f"'https://localhost/' -H 'Host: workbench.shuncheng.xin' && echo && "
        f"ls -la {FRONTEND_REMOTE}")
    print(out or err)


def deploy_api(client):
    print(f"===== 部署 AI 代理服务 -> {API_REMOTE} =====")
    rel_files = collect_api_files()
    upload_many(client, str(PROJECT_ROOT), API_REMOTE, rel_files)

    # .env 首次缺失则不覆盖，提示用户手工配置
    out, _, _ = remote_exec(client, f"test -f {API_REMOTE}/.env && echo exists || echo missing")
    if "exists" not in out:
        print("!! 未发现 /opt/workbench-api/.env，请先参考 deploy/.env.ecs.example 手动上传，"
              "再重跑 deploy.py api")
        sys.exit(1)

    # 安装 systemd 单元
    out, err, rc = remote_exec(client,
        f"cp {API_REMOTE}/deploy/{API_UNIT} /etc/systemd/system/{API_UNIT} && "
        f"systemctl daemon-reload && systemctl enable {API_UNIT} && "
        f"systemctl restart {API_UNIT} && sleep 2")
    if rc != 0:
        print("!! systemd 配置/重启失败 =>", err)
        sys.exit(1)

    # 健康检查
    time.sleep(2)
    out, err, rc = remote_exec(client, API_HEALTHCHECK)
    if rc == 0 and '"ok":true' in out:
        print("健康检查通过：", out)
    else:
        print("!! 健康检查失败 =>", out or err)
        journal, _, _ = remote_exec(client, f"journalctl -u {API_UNIT} -n 15 --no-pager")
        print(journal)
        sys.exit(1)
    verify_api(client)


def verify_api(client):
    print("===== 验证 API =====")
    out, _, rc = remote_exec(client, f"ls -la {API_REMOTE} && systemctl is-active {API_UNIT}")
    print(out)


def main():
    parser = argparse.ArgumentParser(description="workbench 阿里云 ECS 部署脚本")
    parser.add_argument("target", choices=["frontend", "api"])
    parser.add_argument("-f", "--file", help="只部署单个文件（相对工程根路径）")
    parser.add_argument("--verify", action="store_true", help="仅验证不部署")
    args = parser.parse_args()

    client = ssh_connect()
    print(f"已连接 {SERVER_IP}")

    if args.verify:
        if args.target == "frontend":
            verify_frontend(client)
        else:
            verify_api(client)
    elif args.target == "frontend":
        deploy_frontend(client, single_file=args.file)
    else:
        deploy_api(client)

    client.close()
    print("完成。")


if __name__ == "__main__":
    main()