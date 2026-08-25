/**
 * Tauri 构建前同步脚本
 * 将前端资源（index.html + assets/）复制到 dist/ 目录
 * 避免 Tauri 把 src-tauri/target、node_modules 等打包进去
 */
const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DIST = path.join(SRC, "dist");

// 需要复制的文件/目录（桌面端不需要 api/ 目录，桌面端用直连模式）
const ITEMS = ["index.html", "assets"];

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 清理并重建 dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 复制前端资源
for (const item of ITEMS) {
  const src = path.join(SRC, item);
  const dest = path.join(DIST, item);
  if (!fs.existsSync(src)) {
    console.warn(`[skip] 不存在: ${item}`);
    continue;
  }
  if (fs.statSync(src).isDirectory()) {
    copyDir(src, dest);
    console.log(`[ok] 目录: ${item}/`);
  } else {
    fs.copyFileSync(src, dest);
    console.log(`[ok] 文件: ${item}`);
  }
}

console.log(`\n✓ 前端资源已同步到 dist/ (${path.relative(SRC, DIST)})`);
