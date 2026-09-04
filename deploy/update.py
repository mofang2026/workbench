#!/usr/bin/env python3
"""
一键更新脚本 - 项目迭代后一键同步到所有交付目标
把以下三步收拢成一个命令，避免每次手动敲：

  1. 前端  -> 阿里云 ECS (/var/www/workbench.shuncheng.xin)
  2. AI 代理 -> 阿里云 ECS (/opt/workbench-api) 并重启 systemd 服务
  3. git commit + push -> GitHub main，触发 Vercel 自动部署

用法:
  python deploy/update.py                  # 全链路：阿里云前端+API + git push
  python deploy/update.py --no-api         # 跳过 API 部署（只前端 + git push）
  python deploy/update.py --no-git         # 只部署阿里云，不提交推 git
  python deploy/update.py --no-aliyun      # 只 git commit + push（触发 Vercel）
  python deploy/update.py -m "feat: xxx"   # 自定义 git 提交信息
  python deploy/update.py -f assets/js/xxx.js  # 只传单个前端文件（跳过 api/git）
前置: pip install paramiko；SSH 私钥 ~/.ssh/shuncheng_rsa；git 已在 workbench 工程根。
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

# workbench 工程根（deploy/ 的上一级）
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def git(*args):
    """在工程根执行 git 命令，返回 (stdout, returncode)。"""
    r = subprocess.run(["git", *args], cwd=str(PROJECT_ROOT),
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout.strip(), r.returncode


def require_clean_state():
    """git 无可提交改动则提示且退出（无事可做时不让流程空跑）。"""
    out, rc = git("status", "--porcelain")
    if rc != 0:
        print("!! 不是在 git 仓库中，或 git 不可用。已中止。")
        sys.exit(1)
    if not out:
        print("工作区干净，没有需要同步的改动，无需更新。")
        sys.exit(0)
    lines = [l for l in out.splitlines() if l.strip()]
    print(f"检测到 {len(lines)} 项改动：")
    for l in lines[:30]:
        print("  " + l)
    if len(lines) > 30:
        print(f"  ... 等共 {len(lines)} 项")
    return lines


def deploy_aliyun(which):
    """调用 deploy.py 部署前端或 API。"""
    sys.path.insert(0, str(PROJECT_ROOT / "deploy"))
    import deploy  # 复用 deploy.py 的模块级函数

    client = deploy.ssh_connect()
    print(f"\n已连接 {deploy.SERVER_IP}\n")
    try:
        if which == "frontend":
            deploy.deploy_frontend(client)
        else:
            deploy.deploy_api(client)
    finally:
        client.close()


def git_commit_push(message):
    print("\n===== git commit + push (触发 Vercel) =====")
    git("add", "-A")
    if message:
        msg = message
    else:
        # 默认提交信息：按改动文件做一个概括
        files, _ = git("diff", "--cached", "--name-only")
        changed = [f for f in files.splitlines() if f.strip()]
        if not changed:
            changed, _ = git("status", "--porcelain")
            changed = [l[3:] for l in changed.splitlines() if l.strip()]
        scope = "前端"
        if any(c.startswith("api") or c.startswith("server") for c in changed):
            scope = "前端+AI代理"
        count = len(changed)
        msg = f"chore: 更新同步（{scope}，{count} 项）— 阿里云 + Vercel"

    _, rc = git("commit", "-m", msg)
    if rc != 0:
        print("git commit 失败（可能无 stage 内容或提交信息问题）。已中止，不会 push。")
        sys.exit(1)
    print("commit 信息:", msg)

    out, rc = git("push", "origin", "HEAD")
    if rc != 0:
        print("push 失败 =>\n", out)
        sys.exit(1)
    print(out or "push 成功。")


def main():
    parser = argparse.ArgumentParser(
        description="一键同步：阿里云前端 + AI代理 + git push(触发 Vercel)")
    parser.add_argument("--no-api", action="store_true", help="跳过阿里云 API 部署")
    parser.add_argument("--no-git", action="store_true", help="只部署阿里云，不做 git 提交")
    parser.add_argument("--no-aliyun", action="store_true", help="只 git commit+push，不部署阿里云")
    parser.add_argument("-m", "--message", help="自定义 git 提交信息")
    parser.add_argument("-f", "--file", help="只传单个前端文件（此时跳过 API 与 git）")
    args = parser.parse_args()

    print("========== 全域自媒体工作台 · 一键更新 ==========")

    # 快捷：只传单个前端文件
    if args.file:
        if args.no_aliyun or args.no_git:
            print("!! -f 与 --no-* 冲突，-f 已视为仅单文件前端部署。")
        sys.path.insert(0, str(PROJECT_ROOT / "deploy"))
        import deploy
        client = deploy.ssh_connect()
        try:
            deploy.deploy_frontend(client, single_file=args.file)
        finally:
            client.close()
        sys.exit(0)

    # 有没有可提交的改动（只在需要 git 时检查）
    if not args.no_git:
        require_clean_state()

    # 1) 阿里云部署（默认前端 + API）
    if not args.no_aliyun:
        if not args.no_api:
            print("\n【1/2】部署 AI 代理到阿里云 ...")
            deploy_aliyun("api")
        print("\n【2/2】部署前端到阿里云 ...")
        deploy_aliyun("frontend")
    else:
        print("\n（已跳过阿里云部署，仅 git 同步）")

    # 2) git push
    if not args.no_git:
        git_commit_push(args.message)
    else:
        print("\n（已跳过 git 提交。若需推送，请去掉 --no-git 重新执行）")

    print("\n======== 全部完成 ✅ ========")
    print("- 阿里云: https://workbench.shuncheng.xin/")
    print("- Vercel: https://workbench-black-chi.vercel.app/（push 后自动部署）")


if __name__ == "__main__":
    main()