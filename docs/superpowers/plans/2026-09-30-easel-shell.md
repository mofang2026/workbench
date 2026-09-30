# 全站 Easel 式 Shell 改版 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作台从「吸顶横向导航 + 整页滚动」改成 Easel 式「常驻左栏 + 右侧工作区」，并让 Agent（助手页）在线上版与桌面版同时可用，不新增后端。

**Architecture:** 纯 CSS/HTML 改动 —— 已实测确认没有任何 JS 读**视口或自身之外**的几何：`grep -rE "innerWidth|clientWidth|getBoundingClientRect|ResizeObserver|addEventListener\(.resize." assets/js/` 命中 **0**（2026-09-30 复跑），所以换壳不需要重排 JS。**必须同时登记的例外**：`scrollTop`/`scrollHeight` 各有 5 处命中（`chat.js:370/423/433/493` 与 `ai-gateway.js:350`），全部是 `el.scrollTop = el.scrollHeight` 这种「写自己那个滚动容器」的自动滚到底，不做视口判断。它们的成立前提是那个容器仍然有界且可滚——换壳后 `.chat-wrap` 的高度改由 `--ws-pad-t/--ws-pad-b` 决定，所以 RESULT7（chat 高度 = 工作区可用高度，Task 3 起是算术恒等式 + 不出视口）就是替这 5 处把守的门禁，不是可以省的断言。侧栏用 `position:sticky + height:100vh`，工作区用 `container-type: inline-size`，让现存 15 条响应式断点继续按「自己那一栏的内容宽度」生效（阈值需平移 −64，推导见 Task 3 Step 1）。

**Tech Stack:** 原生 JS（`WB.define` 手写 DI，无框架无打包器）+ 单文件 `assets/css/styles.css`（深色主题 token 在 6-55 行）+ Tauri(WebView2) + Vercel/nginx 两种部署。

**Spec:** `C:\Users\Msi\Desktop\agent-workspace-and-shell-redesign.md`（存档方案）。本计划是对它的**执行版**，其中 5 处已按现状修正，见「与存档方案的差异」。

---

## Global Constraints

- 不引入任何新依赖、新构建步骤、新后端（存档方案目标 1 原文：「零新后端」）。
- 目标运行环境：Tauri WebView2，窗口 `1280×800`，**`minWidth: 1024`**（`src-tauri/tauri.conf.json` → `app.windows[0]`，已实测读出）；线上为公开 HTTPS 站点，桌面为本地包。
- 主题只有深色一套，所有颜色必须走 `styles.css:6-55` 的现有 token，不新增硬编码色值。
- 文案一律中文，风格对齐现有页面（短句、无感叹号）。
- 页面清单固定 12 个：`dashboard chat hot-radar content calendar assets metrics templates card-design video-script rules settings`；导航与懒加载分别是 `app.js:371`（`initNav` 绑 `.nav-link, [data-page]`）与 `app.js:391-403`（`PAGE_MODULES`）。**这两处不得改**：侧栏继续复用 `.nav-link` 类名与 `data-page` 属性，换壳才能零 JS 改动。
- 平台相关的新 UI 一律走 `assets/js/platforms.js` 注册表（`Platforms.options/labels/keyOf`），不得再自带平台名表。
- 每个任务以一次 commit 结束（信息风格对齐 `git log`：`feat(scope): 中文描述`）。**只 commit，不 push**；push 需用户单独批准。
- 验收标准沿用用户既有纪律：**每条断言都要用变异证明它会红**，只打印「PASS」不算证据。

---

## 与存档方案的差异（先读，否则计划看起来缺步骤）

存档方案写于「未动代码」时。实测现状：Agent 那一半**已经建完并通过端到端验证**，所以本计划只保留 shell，外加 4 处对原方案的修正。

| # | 存档方案的说法 | 实测现状（证据） | 对计划的影响 |
|---|---|---|---|
| A | 第 1 步「Agent 工作区先行」未开始 | `assets/js/agent.js` 220 行、`assets/js/chat.js` 548 行已存在，导航已有 `data-page="chat"`「助手」（`index.html:70`）；`.verify-agent/drive.py` 复跑（2026-09-30）打印 `RESULT-STREAM` + `RESULT1…RESULT11` 共 **12 行全 PASS**，末行 `RESULT: PASS`，exit 0 | 不再计划 Agent 骨架，只做 shell |
| B | 第 3 步「按页面逐个搬入 shell，旧页面保留对照」 | 12 个 `.page` 全在同一个 `<main class="app-shell">`（`index.html:89-227`）里，`.page` 在 CSS 中**零条规则**（实测 `grep -c '^\.page\b'` = 0），显隐只靠全局 `.hidden`（`styles.css:468`） | **不可能逐页搬**：壳是共享的，翻转是一次性的。改为「一次翻转 + 逐页修宽度」，见 Task 2/3 |
| C | 「确认 generate/stream 代理对 tools 的透传」待办 | `grep -rn "tools" api/` 命中 **0**；`api/ai/generate.js:140-158` 与 `stream.js:124-180` 只拼 `{prompt, system}` 单轮、只回 `delta.content`；`ai-gateway.js:466-470` 的 `requireDirect()` 在代理模式直接抛「Agent 需要「直连模式」」 | 透传问题已被「拒绝 + 一键切直连」消解，不需要补代理（Task 5 只补文案与验证） |
| D | 目标 1「线上 Vercel + 桌面版同时可用」 | 实测三家 provider 的浏览器 preflight（`OPTIONS` + `Origin: https://workbench.shuncheng.xin` + `Access-Control-Request-Headers: authorization,content-type`）：<br>· `api.deepseek.com` 200，`allow-origin` 回显来源，`allow-methods: POST`，`allow-headers: authorization,content-type`<br>· `open.bigmodel.cn` 200，同上 + `Max-Age: 3600`<br>· `api.moonshot.cn` 204，同上 | **线上跑 Agent 不需要新后端**，直连即可（Task 5 落成一页可复跑的检查脚本） |
| E | 左侧栏「可勾选工具」+ 6 个工具（含 generate_card/generate_script） | `chat.js:253-270` 的 `renderTools()` 是只读面板（实测面板内按钮数 = 0，说明文字为「共 4 个工具，全部只读」）；`agent.js:10` 与 `chat.js:252` 都写明「不暴露写库给模型」；模型可调用的是 `db_list/db_get/db_stats/skill_topic_schedule_gap` 4 个，不是方案里的 6 个 | 勾选与生成类工具与既有安全设计冲突，**移出本计划**，见附录 B 待用户决策 |

另外两条实测缺陷，属于本计划顺手要修的：

- `dist/` 已陈旧：`comm` 比对显示 `dist/assets/js` 缺 `agent.js`、`chat.js`、`platforms.js`，`dist/index.html` 只有 22 个 `<script src>`（源站 25 个）。`npm run tauri:build` 会自动 sync（`package.json` scripts），但**手动跑 `tauri build` 会打出没有助手页的桌面包** → Task 5 收口。
- `.editor-layout` 在模态里挤成两列（既有 bug，与壳无关）：`.modal` 是 `width:100%; max-width:640px`（`styles.css:620-622`），而它内部的 `.editor-layout`（`:659`）靠 `@media (max-width: 980px)` 才降单列（`:664`）——尺子是视口，可它量的是 640px 的模态。Playwright 实测 1440 与 1024 两档视口下模态内 `gridTemplateColumns` 都是 **2 条轨**（`RESULT8` 的 detail：`{'parent': 'BODY', 'maskW': 1440, 'maskH': 900, 'display': 'grid', 'tracks': 2, ...}`）。顺带把 RESULT8 的空跑面堵掉：非 grid 元素上 Blink 把 `gridTemplateColumns` 序列化成 `none`，`split(/\s+/).length` 数出来恰好是 1，所以旧口径的「编辑器单列」对任何**没声明轨道的非 grid** 都恒真 —— 实测把 `.editor-layout` 改成 `display: block` 并摘掉它的 `grid-template-columns`，旧口径打 `RESULT8: PASS`（`'display': 'block', 'tracks': 1`），新口径必须同时要求 `display == "grid"` 与 `tracks == 1` 才红。Task 3 换容器查询后自动修正，并已写成断言锁住。
- 顺带把容器化的一条真实风险量掉了：`container-type` 会让该元素成为其 **fixed 后代的包含块**（本来 fixed 是相对视口定位的）。实测全项目 `position: fixed` 只有 4 处：`body::before`（`styles.css:80-82`，body 的伪元素）、`.auth-mask`（`:419-420`，对应 `index.html:18` 的 `#authMask`）、`.modal-mask`（`:609-611`，由 `showModal()` 挂到 `document.body`，实测 `parent === "BODY"`）、以及 `#toast` 的内联样式（`index.html:230`）。**四者都是 body 级节点，没有一个 `.workspace` 或 `.modal` 的后代是 fixed 定位**，所以给这两处加 `container-type` 不会把任何遮罩/Toast 钉错位置。RESULT8 就是这条的守门断言（它同时校验 `parent === "BODY"` 与遮罩铺满整视口，`maskW==vw && maskH==vh`）。

---

## 文件结构

| 路径 | 动作 | 职责 |
|---|---|---|
| `F:\Qoder\自媒体\.verify-shell\shell_check.py` | 新建（仓库外，避免被 `sync-dist.js` 打进桌面包） | shell 几何回归：**10 条**编号 RESULT 断言 + 1 条 `RESULT-OFFLINE`（外部请求尝试/拦截/漏网三计数），全程离线。第 10 条（窄屏 chat 竖向装进视口）是 Task 4 fix round 1 加的，它不是「多测一页」，是把降级段那条实测常量从「靠人眼」抬成「会红」 |
| `F:\Qoder\自媒体\.verify-shell\shell_mutate.py` | 新建 | 把 shell_check 的每条断言逐个改红（**13** 个变异，Task 4 fix round 1 补了 `nav_h_gone` 与 `chat_rail_tall` 两条，都指向 `RESULT10`），证明非空跑；带「变异前基线红项」预检 + 离线预检（`RESULT-OFFLINE` 红则整轮作废）、完整 FAIL 行证据与 `COLLATERAL` 共现点名，按字节读写还原；锚点命中按**逻辑 EOL** 计数（≠1 处即拒绝写盘）；子进程空跑/挂死一票否决（`CHECK_TIMEOUT = 120s`，没有 RESULT 行/没有末行汇总/退出码非 0-1/超时 = 整轮作废） |
| `F:\Qoder\自媒体\.verify-shell\cors_check.py` | 新建（Task 5） | 三家 provider 的浏览器 preflight 复检，线上直连可行性的可复跑证据；无需 Key |
| `workbench/index.html` | 改 `62-88`（顶部导航 → 侧栏 + 工作区开标签）、`227`（`.app-shell` 闭标签前补 `</main>` 闭合） | DOM 骨架 |
| `workbench/assets/css/styles.css` | 删 `100-111`、`147-151`、`223-224`；改 `154-158`；`:root` 增 3 个 token；新增 `.sidebar/.workspace` 段；15 条 `@media` → `@container` | 布局本体，唯一的行为变更面 |
| `workbench/assets/js/*.js` | **只有 Task 5 改 `settings.js` 的一处说明文案**（模板字符串里加一句，不动逻辑） | 零**布局 JS** 改动是本计划的验收线之一：`app.js:371` 的 `initNav` 与 `:391-403` 的 `PAGE_MODULES` 必须一字不变 |

`.page` 一律不加 CSS：显隐继续走 `app.js:382-384` 的 `.hidden` 切换。

---

## Task 0: 先把未提交的现状落库（需要用户点头才能执行）

**为什么这是第 0 步而不是附注**：改壳会重写 `index.html:62-88` 和 `styles.css:100-158`，而这些区域里**已经压着未提交的 Agent 功能与平台注册表改动**。没有基线 commit，Task 2 一旦改坏就无法用 `git diff` 区分「壳的锅」和「上一轮没提交的锅」，也无法回滚。

**行号口径**：本计划里所有 `index.html` / `styles.css` 行号都取自**当前工作树**（含未提交的 204 行 chat 样式块与 `data-page="chat"` 导航项），Task 0 落库之前它们不对应 `HEAD`。`.chat-wrap`（`styles.css:1986-1991`）尤其如此——它只存在于工作树，`git checkout HEAD -- assets/css/styles.css` 会让 Task 3 Step 3 失去目标。

- [ ] **Step 1: 确认未提交面（本计划撰写时实测，数字会变，以当场输出为准）**

Run:
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && git status --short | grep -c '^ M' && git status --short | grep '^??' && git diff --numstat | awk '{s+=$1;d+=$2} END{print "+"s" -"d}'
```
实测（2026-09-30）：20 个已修改文件 + 5 个未跟踪（`assets/js/agent.js`、`assets/js/chat.js`、`assets/js/platforms.js`、`docs/`、`supabase/migration_bridge_links.sql`），合计 `+481 -147`；其中 `assets/js/ai-gateway.js` 为 `+129 -0`（Agent 的 `sendMessages/streamMessages/requireDirect/agentBody`）。
Expected: 与上面同量级。**若出现本会话未涉及的第三个改动源，先停下问用户，不要一起 commit。**

- [ ] **Step 2: 拆成三个可独立回滚的 commit**

`index.html` 与 `assets/css/styles.css` **都横跨两类改动**，必须用 `git add -p` 拆；其余按文件分组即可。实测 `styles.css` 只有两个 hunk：
- `@@ -1346,4 +1346,8 @@`：新增 `.alert-shipinhao/.alert-kuaishou/.alert-weibo/.alert-toutiao` 四行 → 属于注册表那一版；
- `@@ -1976,2 +1980,206 @@`：从 `/* 助手对话页（Chat · Agent）*/` 起的 204 行 → 属于 Agent 那一版。
（`git diff --numstat -- assets/css/styles.css` = `208 insertions(+)`、`0 deletions`，即这两块之和。）

```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
# (a) 平台单一注册表（上一轮的第 3、4 项）
git add assets/js/platforms.js assets/js/utils.js assets/js/topics.js assets/js/keywords.js \
        assets/js/hot-radar.js assets/js/metrics.js assets/js/content.js assets/js/calendar.js \
        assets/js/assets.js assets/js/rules.js assets/js/templates.js assets/js/settings.js \
        assets/js/app.js assets/js/video-script.js
git add -p assets/css/styles.css   # 只挑 .alert-* 那 4 行（第一个 hunk）
git add -p index.html              # 只挑平台下拉/表格里涉及平台名的 hunk
git diff --cached --stat           # 看清楚再 commit
git commit -m "refactor(platforms): 平台名收敛为单一注册表，修复数据复盘 CSV 只认 4 个平台"
# (b) supabase DDL
git add supabase/schema.sql supabase/migration_compliance.sql supabase/migration_keywords.sql \
        supabase/migration_video_scripts.sql supabase/migration_bridge_links.sql
git commit -m "chore(supabase): 折叠缺失 DDL 并收紧 bridge_links 归属校验"
# (c) Agent + 助手页（两个文件剩下的 hunk 全落这里）
git add assets/js/agent.js assets/js/chat.js assets/js/ai-gateway.js
git add assets/css/styles.css index.html
git commit -m "feat(agent): 助手页双栏工作区 + 只读工具循环"
git status --short                 # 应只剩 ?? docs/
```

若某个 hunk 归属判断不了（同一处上下文里既改了导航又改了平台标签），停下来问用户，不要凭猜分配——commit 拆错的代价是回滚时连带废掉另一半工作。

- [ ] **Step 3: 提交后回归（证明 commit 没漏文件）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
Expected: 末行 `RESULT: FAIL(4/9)`，且红的正好是 `RESULT1/RESULT2/RESULT5/RESULT8` —— 与 Task 1 Step 2 的基线**逐字一致**。这一步的意义是：换壳前的工作树 = 已提交内容，`git status --short` 应为空（`?? docs/` 除外，计划文档可最后一起提）。
> 「逐字一致」约束的是**断言编号、红项集合、末行汇总与退出码**，不含每条后面的实测证据串：Task 3 把 RESULT7 的判定从固定带改成算术恒等式，其证据串随之变成现量值（`chatBottom=820 期望 chatTop=28 + (vh=900 - padT=28 - padB=80) = 820 ±1，且 <= vh+1=901`）。所以拿今天的输出比对当年记录时，只有红项集合对不上才算漂移，RESULT7 那行的细节不同属预期。（本步是有序闸门，只在 Task 0/2 当时的状态下成立，不要在 Task 3 之后回跑并期望同样的红项。）

**只 commit，绝不 push。** push 需要用户单独批准（本环境 GCM 无界面，HTTPS push 本就必然失败，见全局约束）。

---

## Task 1: 布局回归 harness（先立靶子，允许全红）

**Files:**
- Create: `F:\Qoder\自媒体\.verify-shell\shell_check.py`
- Create: `F:\Qoder\自媒体\.verify-shell\shell_mutate.py`

**Interfaces:**
- Consumes: `window.switchPage(name)`（`app.js:417` 导出，实测 `typeof === "function"`）、`window.showModal/closeModal`（utils 镜像到全局，实测均为 function）
- Produces: `shell_check.py` 退出码（0 = 全绿，且要求 `RESULT-OFFLINE` 也绿）与 stdout 上的 `RESULT1..RESULT9: PASS/FAIL` 行（按编号顺序打印）+ 一条非编号的 `RESULT-OFFLINE: PASS/FAIL`；Task 2/3/4 的每一步都跑它

- [x] **Step 1: 写 harness**

`F:\Qoder\自媒体\.verify-shell\shell_check.py`：

```python
"""工作台 shell 几何回归：逐页量布局，全程离线（外部请求一律 abort，并把离线本身量成一条断言）。"""
import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

WORKBENCH = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench")
PORT = 4174
URL = f"http://127.0.0.1:{PORT}/index.html"
# 主机名精确比对的口径。不能用 `"127.0.0.1" in url`：那会放行 http://127.0.0.1.attacked.invalid/
LOCAL_HOST = "127.0.0.1"
SIDEBAR_W = 264
# 桌面巡检宽度可用第一个参数覆盖：1024 是 Tauri minWidth，改壳的真实代价要在这一档量
DESK_W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
PAGES = ["dashboard", "chat", "hot-radar", "content", "calendar", "assets", "metrics",
         "templates", "card-design", "video-script", "rules", "settings"]

# 只打桩数据源：不发真实请求，页面渲染走空数据分支（沿用 .verify-agent/drive.py 的思路，
# 但用 get-then-patch 而不是整块替换 registry.instance，避免抹掉别的方法）
FAKE_DB = """() => {
  const db = WB.get("Db");
  db.list = async () => [];
  db.listByIds = async () => [];
  db.get = async () => null;
  db.create = async () => null;
  db.update = async () => null;
  db.remove = async () => null;
  db.createMany = async () => [];
  db.updateMany = async () => [];
  db.getAlerts = async () => [];
  db.getDashboardStats = async () => ({ accounts: [], monthPublishedByPlatform: {},
    totalFans: 0, monthPublished: 0, avgEngagement: "0%", viralCount: 0, todayPending: 0 });
  WB.get("WorkbenchConfig").getSupabase = () => null;
}"""

# 外部请求被 abort，CDN 上的 supabase 全局也就没了；用 init script 补一个哑客户端，
# 让 WorkbenchConfig 的初始化不抛 pageerror（否则 R3 量到的是 harness 自己的问题）
STUB_SUPABASE = """
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === "then" ? undefined : chain()),
  apply: () => Promise.resolve({ data: null, error: null }),
});
window.supabase = {
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve(),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      refreshSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      signUp: () => Promise.resolve({ data: null, error: null }),
    },
    from: chain,
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
};
"""

PROBE = """() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
    return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; };
  const cs = (e, p) => e ? getComputedStyle(e)[p] : null;
  const sb = document.querySelector(".sidebar"), ws = document.querySelector(".workspace");
  const vis = [...document.querySelectorAll(".page")].filter((p) => !p.classList.contains("hidden"));
  return {
    display: cs(document.querySelector(".app-shell"), "display"),
    sidebar: r(sb), sidebarPos: cs(sb, "position"),
    workspace: r(ws), wsContainer: cs(ws, "containerName"),
    navInSidebar: document.querySelectorAll(".sidebar .nav-link").length,
    active: [...document.querySelectorAll(".nav-link.active")].map((e) => e.dataset.page),
    pageKids: vis.length === 1 ? vis[0].children.length : -1,
    chatWrap: (function () { const c = document.querySelector(".chat-wrap");
      if (!c) return null; const ws = document.querySelector(".workspace");
      if (!ws) return null; const b = c.getBoundingClientRect(), s = getComputedStyle(ws);
      return {top: b.top, bottom: b.bottom,
              padT: parseFloat(s.paddingTop), padB: parseFloat(s.paddingBottom)}; })(),
    overflowX: document.documentElement.scrollWidth - Math.round(window.innerWidth),
    vw: window.innerWidth, vh: window.innerHeight,
  };
}"""

# display 必须一起量：非 grid 元素上 Blink 把 gridTemplateColumns 序列化成 "none"，
# 只数 tracks 的话「编辑器单列」对任何非 grid 都恒真（none 切成 1 段）——空跑断言。
MODAL = """() => {
  showModal('<div class="editor-layout"><div style="height:40px">a</div><div>b</div></div>');
  const mask = document.querySelector(".modal-mask"), el = document.querySelector(".editor-layout");
  const b = mask.getBoundingClientRect();
  const out = { parent: mask.parentElement.tagName,
    maskW: Math.round(b.width), maskH: Math.round(b.height),
    display: getComputedStyle(el).display,
    tracks: getComputedStyle(el).gridTemplateColumns.trim().split(/\\s+/).length,
    vw: window.innerWidth, vh: window.innerHeight };
  closeModal();
  return out;
}"""

NARROW_CHAT = """() => {
  const sb = document.querySelector(".sidebar");
  const ws = document.querySelector(".workspace");
  const cw = document.querySelector(".chat-wrap");
  if (!ws || !cw) return null;
  const b = sb ? sb.getBoundingClientRect() : null;
  const s = getComputedStyle(ws), c = cw.getBoundingClientRect();
  return {sidebarH: b ? Math.round(b.height) : null, padB: parseFloat(s.paddingBottom),
          top: c.top, bottom: c.bottom, h: c.height,
          vh: innerHeight, scrollH: document.documentElement.scrollHeight};
}"""

# 离线约束的三个计数：真有过外部请求（否则 abort 规则是在空跑）、全部由本 harness abort 掉
# （规则确实经手了这些请求）、零个拿到响应（漏网）。删掉 ctx.route 那行现在会改输出、改 exit。
ext_tried, ext_blocked, ext_leaked = [], [], []


def is_external(url):
    """http(s) 且主机名 != 127.0.0.1；data:/blob: 不是网络请求，不算外部。"""
    if not url.startswith(("http://", "https://")):
        return False
    try:
        return urlparse(url).hostname != LOCAL_HOST
    except ValueError:
        return True


def route_local_first(req):
    if is_external(req.request.url):
        ext_blocked.append(req.request.url)
        req.abort()
    else:
        req.continue_()


RESULTS = []
# 测量顺序天然是 1,2,5,3,4,6,7,8,9（侧栏/工作区/计数在桌面首测，3/4/6 要逛完 12 页），
# 打印必须按编号 1..9，否则计划里的表与实跑输出对不上。
LINES = {}


def check(name, ok, detail=""):
    n = int(name.split()[0])
    LINES[n] = f"RESULT{n}: {'PASS' if ok else 'FAIL'}  {name}  {detail}"
    RESULTS.append(bool(ok))


def emit():
    for n in sorted(LINES):
        print(LINES[n])


def offline_check():
    ok = bool(ext_tried) and not ext_leaked and len(ext_blocked) == len(ext_tried)
    if ok:
        print(f"RESULT-OFFLINE: PASS  {len(ext_blocked)} 次外部请求被拦截，成功 {len(ext_leaked)}")
    else:
        hosts = sorted({str(urlparse(u).hostname) for u in ext_tried})
        print(f"RESULT-OFFLINE: FAIL  尝试 {len(ext_tried)} 拦截 {len(ext_blocked)} "
              f"拿到响应 {len(ext_leaked)} 主机={hosts} 泄漏={ext_leaked[:2]}")
    return ok


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(WORKBENCH))
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    print(f"# 桌面巡检宽度 = {DESK_W}")
    srv = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(STUB_SUPABASE)
            ctx.route("**/*", route_local_first)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("request", lambda q: ext_tried.append(q.url) if is_external(q.url) else None)
            pg.on("response", lambda s: ext_leaked.append(f"{s.url}({s.status})") if is_external(s.url) else None)

            def browse(w, h):
                errs.clear()
                pg.set_viewport_size({"width": w, "height": h})
                pg.goto(URL, wait_until="load")
                pg.evaluate(FAKE_DB)

            # ---- 桌面 ----
            browse(DESK_W, 900)
            pg.evaluate("() => window.switchPage('dashboard')")
            d = pg.evaluate(PROBE)
            check("1 侧栏 264 且吸顶", bool(d["sidebar"]) and d["sidebar"]["w"] == SIDEBAR_W
                  and d["sidebar"]["x"] == 0 and d["sidebarPos"] == "sticky", str(d["sidebar"]))
            check("2 工作区在侧栏右侧且是 ws 容器", bool(d["workspace"])
                  and d["workspace"]["x"] == SIDEBAR_W and d["wsContainer"] == "ws",
                  f"{d['workspace']} containerName={d['wsContainer']}")
            check("5 侧栏含 12 个导航项", d["navInSidebar"] == len(PAGES), f"实际 {d['navInSidebar']}")

            bad_render, bad_overflow, bad_active = [], [], []
            for name in PAGES:
                pg.evaluate("n => window.switchPage(n)", name)
                s = pg.evaluate(PROBE)
                if s["pageKids"] < 1:
                    bad_render.append(f"{name}({s['pageKids']})")
                if s["overflowX"] > 0:
                    bad_overflow.append(f"{name}(+{s['overflowX']}px)")
                if s["active"] != [name]:
                    # Task 2 手写侧栏时漏一个 data-page 就会这里是 undefined，join 直接 TypeError
                    # 并把后面 4 条 RESULT 一起截断
                    bad_active.append(f"{name}({','.join([str(x) for x in s['active']]) or '无'})")
            check("3 12 页均有内容且无未捕获异常", not bad_render and not errs,
                  f"空页={bad_render} JS错误={errs[:2]}")
            check("4 12 页均无横向溢出", not bad_overflow, str(bad_overflow))
            check("6 单高亮且随页切换", not bad_active, str(bad_active))

            pg.evaluate("() => window.switchPage('chat')")
            c = pg.evaluate(PROBE)
            # RESULT7 是算术恒等式，不是判定带。旧带 `vh-80-6 <= chatBottom <= vh+1`
            # （vh=900 时放行 [814, 901]）会被硬常量骗过去：height: calc(100vh - 114px) 也在带内，
            # 而 Task 2 拆掉的那个 168px 恰恰就是这类常量。恒等式 =
            #   chatBottom == chatTop + (vh - padT - padB)
            # 右边四项全部现量（rect.top / rect.bottom / .workspace 的 computed padding / innerHeight），
            # 于是「页面自身那点顶部偏移」自己进了等式，不再是要硬凑的 +5。
            # 容差取 ±1px 并说清理由：chatTop 与 chatBottom 是两次独立的浮点读数（非整数 DPR 或
            # 页面缩放下各带小数），相减最坏漂 1px；实测两档 vh=900 下等式两边都是整数 820，误差 0。
            # 变异 chat_vh_old（把高度换回 calc(100vh - 168px)）实测 760 vs 820 → 红，旧带反而放行过。
            # 但恒等式对「chat 自己往下挪」是瞎的：若 chat 页里往上插了 100px，则 top=128、bottom=920，
            # 等式两边一起涨到 920 仍成立，而 .chat-wrap 已经掉出视口（输入框要滚动才够得着）。
            # 补一条绝对上限把竖位置也管住：bottom <= vh + 1。取 vh 而不是 vh-padB 是因为今天实测
            # bottom=820 = vh(900) - padB(80)，chat 底边正好压在 padB 那条线上，写成 vh-padB+1
            # 等于要求 chatTop 与 padT 逐像素对齐，页内任何一处 1px 边距就判红，逼着人再引入
            # 「允许页内偏移」这种硬常量 —— 正是本任务要拆掉的东西。前提说清：这条靠 height 随 vh
            # 一起缩才成立。两个不同的下限别混，且都已实测（把 browse(DESK_W, 900) 的高度改成参数跑）：
            # vh < 628（= 520 + padT 28 + padB 80）时 min-height: 520px 起跳，恒等式自己先红
            # （vh=600 实测 bottom=548 vs 期望 520）；vh < 548（= padT 28 + 520）时这条上限也红
            # （vh=540 实测 bottom=548 > 541；vh=560 上限仍放行 548 <= 561，只有恒等式红）。
            # harness 把 vh 钉在 900，两条都够不着；改 harness 视口的人要连 min-height 一起看。
            g = c["chatWrap"]
            want = g["top"] + (c["vh"] - g["padT"] - g["padB"]) if g else None
            check("7 chat 高度 = 工作区可用高度（算术恒等式）", bool(g)
                  and abs(g["bottom"] - want) <= 1 and g["bottom"] <= c["vh"] + 1,
                  (f"chatBottom={g['bottom']:.0f} 期望 chatTop={g['top']:.0f} + "
                   f"(vh={c['vh']} - padT={g['padT']:.0f} - padB={g['padB']:.0f}) = {want:.0f} ±1"
                   f"，且 <= vh+1={c['vh'] + 1}"
                   if g else "chatBottom=量不到 .chat-wrap 或 .workspace"))

            m = pg.evaluate(MODAL)
            check("8 模态覆盖整视口 + 编辑器是单列 grid", m["parent"] == "BODY"
                  and m["maskW"] == m["vw"] and m["maskH"] == m["vh"]
                  and m["display"] == "grid" and m["tracks"] == 1, str(m))

            # ---- 窄屏 390 ----
            browse(390, 780)
            pg.evaluate("() => window.switchPage('dashboard')")
            n = pg.evaluate(PROBE)
            check("9 窄屏无横向溢出（侧栏降级）", n["display"] == "block" and n["overflowX"] <= 0
                  and n["pageKids"] >= 1 and not errs,
                  f"display={n['display']} overflowX={n['overflowX']} 错误={errs[:2]}")

            # ---- 窄屏 chat 竖向装得下（RESULT9 只量 dashboard 的横向，这条补竖向）----
            # 改壳前 chat 的高度算式是 100vh 减一个 168px 常量，那个常量把顶栏高度折在里面；
            # 换成 token 之后折叠丢了，降级段把侧栏叠到工作区上方却没有一项减掉它，2026-10-01
            # 实测 390×780 溢出 83px（= 顶栏 111 - 桌面 padT 28），chat 输入框落到折叠线以下、
            # 要滚动才够得着。判据两半全部现量、除 ±1 容差不含任何常量：文档不再竖向滚动，
            # 且 chat 底边 + 工作区下内补必须压得进视口。两半不是对称的，别把它们读成重复：
            # 后半管「chat 的高度算式确实减掉了顶栏」，后半红必然带着前半红（chat 溢出就是文档溢出）；
            # 前半管「连别的元素一起装得下」，前半红却可以只有前半红。两条变异各证到一处（2026-10-01 实测）：
            # nav_h_gone 两半同红（chatBottom=831 overflowY=111），chat_rail_tall 只红前半
            # （chatBottom=720 仍绿、scrollH=1031 —— 把 .chat-rail 撑到 900px，它越出定高的
            # .chat-wrap 却不改 .chat-wrap 自己的 rect）。
            # 只钉 390×780 这一档：vh < 711（= min-height 520 + 顶栏 111 + padT 20 + padB 60）时
            # 520 的地板起跳、必然溢出，那是与改壳前同类的既成取舍（改壳前 390×640：
            # 640-168=472 < 520 → 也是 520、也溢出），已写进计划 Task 6 Step 5 的人眼清单。
            # 探针必须对「侧栏这个类没了」保持哑（sidebar_class_gone 那条变异会把 <aside class="sidebar">
            # 改成 <aside>）：RESULT10 真正要量的是 chat 装不装得进视口，sidebarH 只是证据串里的解释量，
            # 拿 .sidebar 直接 getBoundingClientRect() 会在变异轮里抛 TypeError、把整个子进程打挂，
            # 驱动随即按「没走完 main()」中止 —— 2026-10-01 就是这么抓到第一版探针的（那条变异的目标是
            # RESULT5，它不该顺带把后面几条断言一起灭掉，更不该让整轮一条都没量到）。
            pg.evaluate("() => window.switchPage('chat')")
            nc = pg.evaluate(NARROW_CHAT)
            check("10 窄屏 chat 页竖向装进视口（降级段减掉顶部导航高度）",
                  bool(nc) and nc["scrollH"] - nc["vh"] <= 0
                  and nc["bottom"] + nc["padB"] <= nc["vh"] + 1,
                  (f"sidebarH={nc['sidebarH']} chatH={nc['h']:.0f} "
                   f"chatBottom={nc['bottom']:.0f} + padB={nc['padB']:.0f} <= vh+1={nc['vh'] + 1}"
                   f" scrollH={nc['scrollH']} overflowY={nc['scrollH'] - nc['vh']}"
                   if nc else "chatBottom=量不到 .chat-wrap 或 .workspace"))

            browser.close()
    finally:
        emit()
        srv.shutdown()
    offline_ok = offline_check()
    ok = all(RESULTS) and offline_ok
    print("\nRESULT: " + ("PASS" if ok else f"FAIL({RESULTS.count(False)}/{len(RESULTS)})"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [x] **Step 2: 跑一遍，确认它现在会红（已实测，输出如下逐字为准）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
实测（2026-09-30，改壳前的现状，exit=1）：

```
# 桌面巡检宽度 = 1440
RESULT1: FAIL  1 侧栏 264 且吸顶  None
RESULT2: FAIL  2 工作区在侧栏右侧且是 ws 容器  None containerName=None
RESULT3: PASS  3 12 页均有内容且无未捕获异常  空页=[] JS错误=[]
RESULT4: PASS  4 12 页均无横向溢出  []
RESULT5: FAIL  5 侧栏含 12 个导航项  实际 0
RESULT6: PASS  6 单高亮且随页切换  []
RESULT7: PASS  7 chat 工作区填满可用高度  chatBottom=825 期望≥814 vh=900
RESULT8: FAIL  8 模态覆盖整视口 + 编辑器是单列 grid  {'parent': 'BODY', 'maskW': 1440, 'maskH': 900, 'display': 'grid', 'tracks': 2, 'vw': 1440, 'vh': 900}
RESULT9: PASS  9 窄屏无横向溢出（侧栏降级）  display=block overflowX=0 错误=[]
RESULT-OFFLINE: PASS  8 次外部请求被拦截，成功 0

RESULT: FAIL(4/9)
```

红：`RESULT1/2/5`（还没有侧栏与工作区；`RESULT2` 现在还多量一条 `.workspace` 的 `container-name: ws`，detail 里的 `containerName=None` 就是它）、`RESULT8`（`tracks: 2` 就是那条与壳无关的既有 bug：640px 模态里的 `.editor-layout` 被 980px 视口断点判成两列；detail 里现在同时给 `display` 与 `tracks`）。
`shell_check.py 1024`（Tauri `minWidth` 那一档）同跑实测：红绿集合与 exit 码与 1440 完全一致，只是 `RESULT8` 的 `maskW/vw` 由 1440 变 1024（`display: 'grid'`、`tracks: 2` 照旧），末行仍是 `RESULT: FAIL(4/9)`。
绿：`RESULT3/4/6`（守恒断言，改壳后必须仍绿）、`RESULT7`（`chatBottom=825` 来自今天 `100vh - 168px` 这个恰好还凑合的常量）、`RESULT9`（今天 `.app-shell` 无 `display` 声明 → 窄屏本来就是 block）。
离线断言（非编号行，实跑两档都是这一句）：`RESULT-OFFLINE: PASS  8 次外部请求被拦截，成功 0` —— 两档各 2 次页面加载共 8 个外部请求（`cdn.jsdelivr.net` 的 supabase、`fonts.googleapis.com`/`fonts.gstatic.com` 的字体），全部被本 harness abort、零个拿到响应。它要求「确有外部请求被尝试」且「拦截数 == 尝试数」且「成功数 == 0」，所以把 `ctx.route` 那行摘掉（实测：尝试 43 拦截 0 拿到响应 38）或让请求漏网，这一行立刻变红、exit 非 0，`shell_mutate.py` 也会在基线就中止整轮。

两条踩过的坑，重跑时别踩：
- **必须留 `STUB_SUPABASE` 这段 init script**。`ctx.route` 掐外部请求会连 Supabase 的 CDN 全局一起掐掉，`WorkbenchConfig` 初始化就抛 `createClient is not a function`，随后是 `auth.getUser is not a function` —— 那时 RESULT3 量到的是 harness 自己的问题，不是页面的。缺哪个 auth 方法就照报错补哪个 stub。
- **必须用 `get-then-patch` 打桩**（`WB.get("Db").list = async () => []`），不要整块替换 `WB._registry["Db"].instance`：后者会抹掉别的方法，实测会让 dashboard 渲染走进异常分支。
- playwright 只装在 Easel venv，系统 `python` 会 `ModuleNotFoundError`（已实测）；`python3` 在本机静默失败（exit 49），用 `python`。

- [x] **Step 3: 写变异驱动脚本**

`F:\Qoder\自媒体\.verify-shell\shell_mutate.py`：

```python
"""改坏一处 → 跑 shell_check → 期望指定 RESULT 变红 → 按字节还原。证明断言非空跑。"""
import re
import subprocess
import sys
import time
from pathlib import Path

CSS = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench\assets\css\styles.css")
HTML = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench\index.html")
PY = r"F:\Qoder\自媒体\Easel\.venv\Scripts\python.exe"
# 单次 harness 运行的超时上限（秒）。实测这台机器跑满 9 条 + 离线那条只要 ~1.5s（三次计时
# 1.4/1.4/1.5s，登记在 .superpowers/sdd/2026-09-30-easel-shell/task-1-report.md 的 Fix round 2），
# 但这一轮是 Task 4/6 唯一的布局证明，取值要的是「容纳被别的东西压满的机器」，不是贴着实测：
# 120s ≈ 实测的 80 倍。真正的目的在 run()：挂死与空跑一律当硬失败，绝不当成「基线全绿」。
CHECK_TIMEOUT = 120
EXCERPT = 600  # 中止消息里 stderr/stdout 摘录的字符上限（够看完一段 traceback）

# 名字 -> (目标文件, 原文, 替换, 期望变红的 RESULT 编号)
# 锚点必须全文件唯一：`min-width: 0;` 在 styles.css 里已有 4 处（1171/1638/1725/1800），
# 单独拿它当锚点会命中 `.rec-body` 而不是 `.workspace`，变异就白做了。
# 锚点按 LF 写；落盘文件是 CRLF 时由 locate() 换算，见那里。
MUT = {
    "sidebar_w_zero": (CSS, "--sidebar-w: 264px;", "--sidebar-w: 0px;", "RESULT1"),
    "no_sticky": (CSS, "position: sticky;", "position: static;", "RESULT1"),
    "grid_one_col": (CSS, "grid-template-columns: var(--sidebar-w) minmax(0, 1fr);",
                     "grid-template-columns: 1fr;", "RESULT2"),
    # Task 2 的 `.workspace` 容器声明：Task 3 那 15 条 @container 全靠 container-name: ws，
    # 摘掉它 RESULT2 的 containerName 半边就要红（锚点带上 `.workspace {` 才与 .modal 那块区分开）
    "ws_container_gone": (CSS, ".workspace {\n  container-type: inline-size;\n  container-name: ws;",
                          ".workspace {", "RESULT2"),
    "page_id_gone": (HTML, '<section id="page-rules"', '<section id="pagex-rules"', "RESULT3"),
    "ws_min_width": (CSS, "box-sizing: border-box;\n  min-width: 0;",
                     "box-sizing: border-box;\n  min-width: 1200px;", "RESULT4"),
    "sidebar_class_gone": (HTML, '<aside class="sidebar">', "<aside>", "RESULT5"),
    # 复制一份 chat 导航项：switchPage 会把两个都标 active → RESULT6 红（这条今天就能证明）。
    # Task 2 之后锚点落进 .sidebar 内，同一处变异会连带把 navInSidebar 推到 13 → RESULT5 也红，
    # 驱动会在它下面打 COLLATERAL（那是预期的共现，不是缺陷）；今天导航还在顶栏（.sidebar 之外），
    # RESULT5 量到的是 0，与这条无关。
    "nav_dup": (HTML, '<a class="nav-link" data-page="chat">助手</a>',
                '<a class="nav-link" data-page="chat">助手</a>\n          '
                '<a class="nav-link" data-page="chat">助手（重复）</a>', "RESULT6"),
    # 锚点跟着 styles.css 的 .chat-wrap 高度算式走（那一式现在多减一个 --nav-h）；变异的含义没变，
    # 仍是「把高度换回那个 168px 硬常量」。它现在同时会打红 RESULT10（降级段也吃这条基础规则），
    # 那是预期的共现，见计划 Task 6 Step 2 的白名单。
    "chat_vh_old": (CSS, "height: calc(100vh - var(--nav-h) - var(--ws-pad-t) - var(--ws-pad-b));",
                    "height: calc(100vh - 168px);", "RESULT7"),
    "modal_container": (CSS, ".modal {\n  container-type: inline-size;\n  container-name: ws;\n}",
                        "/* 模态容器被移除 */", "RESULT8"),
    "narrow_no_degrade": (CSS, ".app-shell { display: block; }",
                          ".app-shell { display: grid; }", "RESULT9"),
    # 降级段忘掉顶部导航高度（回到 Task 4 修复前的状态）：chat 高度算式少减 111 → 390×780 下
    # chatH 从 589 涨到 700、overflowY 从 0 涨到 111 → RESULT10 红。这条是 RESULT10 的非空跑证明，
    # 也是 --nav-h 这个实测常量漂了之后唯一会响的警报。
    "nav_h_gone": (CSS, "--nav-h: 111px;", "--nav-h: 0px;", "RESULT10"),
    # RESULT10 的判据有两半（文档不竖向滚动 / chat 底边 + 下内补压得进视口）。nav_h_gone 同时打红
    # 两半，所以它证不了前半是活的。这条把 .chat-rail 撑到 900px：它是 .chat-wrap（窄屏定高 589）里
    # 的 flex item，越界但不改变 .chat-wrap 自己的 rect —— chatBottom 仍 720（后半照绿），只有
    # scrollHeight 涨 → 只有前半红。「别的元素也别溢出」这一半存在的意义就在这，此前无人证过。
    "chat_rail_tall": (CSS, ".chat-rail {\n  flex: 0 0 190px;",
                       ".chat-rail {\n  flex: 0 0 190px;\n  min-height: 900px;", "RESULT10"),
}


def locate(text, old, new):
    """按「逻辑锚点」匹配，返回 (替换后的文本, 逻辑命中次数)；不能动手时返回 (None, 命中次数)。

    表里的锚点写 `\\n`，而 styles.css/index.html 目前是 CRLF：整串按 bytes 读写（见 main）
    才能真「按字节还原」，代价就是多行锚点必须先对齐文件的 EOL。两种风格都试，
    将来被只会写 LF 的工具改过的那一段也能命中。

    计数口径是**逻辑**的：同一处锚点写成 CRLF 或写成 LF 都算同一个锚点，所以混用 EOL 的文件里
    真出现两处（一处 CRLF 形状的、一处 LF 形状的）就如实报 2。改前只报「第一个匹配到的变体」的
    count，于是报 1、ANCHOR 警告静默；而它替换的正是那个被数过的 CRLF 变体的第一处，另一处
    （LF 形状的）原地不动——结果规则只删了一半，判定却看起来像数到几处就改了几处。
    现在数到几处就只能改那一处：hits != 1 一律不动手，0 处由 main 报 SKIP，多于 1 处报 ANCHOR
    并拒绝写盘。单行锚点的两种拼法是同一个串，只数一遍，不会翻倍。
    """
    tried = []  # [(锚点的这种拼法, 该拼法用的换行符)]，CRLF 优先，与改前一致
    for nl in ("\r\n", "\n"):
        v = old.replace("\n", nl)
        if all(v != t[0] for t in tried):
            tried.append((v, nl))
    counts = [text.count(v) for v, _ in tried]
    hits = sum(counts)
    if hits != 1:
        return None, hits
    v, nl = tried[counts.index(1)]
    return text.replace(v, new.replace("\n", nl), 1), hits


def abort(why, r=None, el=None):
    """把「这一轮不可信」说成一句能诊断的话：原因 + 退出码 + 耗时 + 有界的 stderr/stdout 摘录。"""
    lines = [f"{why} —— 变异驱动中止。这一轮一条都没量到，绝不能当成基线，"
             f"否则 Task 4 Step 3 会读到「变异前基线红项：全绿」那种假绿证据"]
    if el is not None:
        lines.append(f"        耗时 {el:.1f}s（超时上限 {CHECK_TIMEOUT}s）")
    if r is not None:
        lines.append(f"        returncode={r.returncode}")
        for tag, s in (("stderr", r.stderr), ("stdout", r.stdout)):
            t = (s or "").strip()
            lines.append(f"        {tag} 摘录（末 {EXCERPT} 字符）：{t[-EXCERPT:] or '（空）'}")
    return "\n".join(lines)


def run():
    """跑一次 harness，返回 {RESULT 编号: 完整 FAIL 行（含判定值）}。

    只认 RESULT<数字>：末行汇总 "RESULT: FAIL(4/9)" 不是断言，混进来会污染基线红项。
    RESULT-OFFLINE 红 = 页面漏到了公网，此后任何「变红」都可能是网络抖动，证据作废 → 立刻收摊。
    子进程必须「把话说完」才可信：stdout 里一条 RESULT 都没有、或没有末行汇总，就是它中途死了
    （例如在 shell_check.py 的 try 之外才跑的 offline_check() 之前抛异常），
    退出码不是 0/1 也同样是死。改前这三条一律看不见 —— 空 stdout 会被解析成「零红项」，
    于是打印 `变异前基线红项：全绿`。超时（挂死）与这三条同等对待：一票否决整轮。
    """
    t0 = time.monotonic()
    try:
        r = subprocess.run([PY, "shell_check.py"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace",
                           cwd=str(Path(__file__).parent), timeout=CHECK_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise SystemExit(f"shell_check.py 超过 {CHECK_TIMEOUT}s 没退出（已等 "
                         f"{time.monotonic() - t0:.1f}s）—— 挂死不是「全绿」，这一轮的证明全部作废，"
                         f"先查 harness/浏览器卡在哪个 evaluate 上")
    except OSError as e:
        raise SystemExit(abort(f"shell_check.py 根本没跑起来：{e!r}（PY={PY}）", el=time.monotonic() - t0))
    out = r.stdout or ""
    if re.search(r"^RESULT-OFFLINE: FAIL", out, re.M):
        print(out.strip())
        raise SystemExit("RESULT-OFFLINE 红：abort 规则没生效，这一轮的证明全部作废，先修 shell_check.py")
    if not re.search(r"^RESULT\d+: ", out, re.M):
        raise SystemExit(abort("子进程一条 RESULT 判定都没打（stdout 无可解析输出）", r,
                               time.monotonic() - t0))
    if not re.search(r"^RESULT: (?:PASS|FAIL\(\d+/\d+\))\s*$", out, re.M):
        raise SystemExit(abort("子进程没打末行汇总 `RESULT: PASS/FAIL(n/m)`——它没走完 "
                               "main() 的最后一段，红项集合不可信", r, time.monotonic() - t0))
    if r.returncode not in (0, 1):
        raise SystemExit(abort("子进程退出码不是 0/1（shell_check.py 只会返回这两个），"
                               "即便打了汇总也不可信", r, time.monotonic() - t0))
    return {m.group(1): m.group(0).strip()
            for m in re.finditer(r"^(RESULT\d+): FAIL.*$", out, re.M)}


def main():
    names = sys.argv[1:] or list(MUT)
    # 快照按 bytes：read_text/write_text 会把 CRLF 读成 LF、写回时按 os.linesep 落地，
    # 今天恰好两个目标全是 CRLF 才没露馅；Task 2-4 用会写 LF 的工具改文件后，文本模式就会串改字节。
    snap = {p: p.read_bytes() for p in (CSS, HTML)}
    txt = {p: snap[p].decode("utf-8") for p in snap}
    base = run()
    print(f"变异前基线红项：{list(base) or '全绿'}")
    bad = 0
    for name in names:
        path, old, new, want = MUT[name]
        original, text = snap[path], txt[path]
        mutated, hits = locate(text, old, new)
        if hits == 0:
            print(f"{name}: SKIP —— 锚点不在 {path.name} 中（前置任务没做到位，先修那个再继续）")
            bad += 1
            continue
        if want in base:
            # 断言在变异前就已经是红的，这次变异证明不了任何东西
            print(f"{name}: INVALID —— {want} 变异前就红，先把基线跑绿再谈证明")
            bad += 1
            continue
        if mutated is None:
            # 逻辑锚点命中不止一处：改前它只数「第一个匹配到的拼法」，两处会报成 1、警告静默，
            # 而替换只落到那一处，另一处原地不动 → 规则只删一半，证明却看起来是完整的。
            # 现在 hits != 1 一票否决，不写盘（改前只警告一声就照改）。
            print(f"{name}: ANCHOR 锚点在 {path.name} 里逻辑命中 {hits} 处"
                  f"（CRLF 与 LF 两种拼法分开数再相加，混用换行的文件也算）"
                  f" → 拒绝写盘，把锚点收窄到唯一一处再来")
            bad += 1
            continue
        path.write_bytes(mutated.encode("utf-8"))
        try:
            reds = run()
        finally:
            path.write_bytes(original)
            assert path.read_bytes() == original, f"{name} 还原失败（字节级）"
        got = list(reds)
        hit = want in reds
        print(f"{name}: {'OK 变红' if hit else 'BAD 没变红'}  期望 {want} 红，实际 {got or '全绿'}")
        if hit:
            # 打全行：标签 + 判定值。check("3 …")/check("9 …") 是合取断言，
            # 只有看到红的原因，才知道红的是这次变异而不是别的东西。
            print(f"        证据 {reds[want]}")
        extra = sorted(set(reds) - set(base))
        if extra != [want]:
            print(f"        COLLATERAL 相对基线新红 {extra or '无'}，目标只有 {want}"
                  f"（共现的红说明断言承重，但它不是这次要证的那条）")
        if not hit:
            bad += 1
    if bad:
        raise SystemExit(f"{bad} 项未被证明")
    print("全部断言已被证明会变红")


if __name__ == "__main__":
    main()
```

- [x] **Step 4: 现在就跑一次全量变异（有 2 条当场能被证明，其余 9 条必须被拒绝）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py`
实测（改壳前，11 个变异，exit=1）：

```
变异前基线红项：['RESULT1', 'RESULT2', 'RESULT5', 'RESULT8']
sidebar_w_zero: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
no_sticky: INVALID —— RESULT1 变异前就红，先把基线跑绿再谈证明
grid_one_col: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
ws_container_gone: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
page_id_gone: OK 变红  期望 RESULT3 红，实际 ['RESULT1', 'RESULT2', 'RESULT3', 'RESULT5', 'RESULT8']
        证据 RESULT3: FAIL  3 12 页均有内容且无未捕获异常  空页=['rules(-1)'] JS错误=[]
ws_min_width: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
sidebar_class_gone: SKIP —— 锚点不在 index.html 中（前置任务没做到位，先修那个再继续）
nav_dup: OK 变红  期望 RESULT6 红，实际 ['RESULT1', 'RESULT2', 'RESULT5', 'RESULT6', 'RESULT8']
        证据 RESULT6: FAIL  6 单高亮且随页切换  ['chat(chat,chat)']
chat_vh_old: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
modal_container: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
narrow_no_degrade: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
9 项未被证明
```

（上块的末行 `9 项未被证明` 是 `SystemExit(str)` 打到 **stderr** 的，exit=1；只重定向 stdout 会看不到这一行。计数口径：`未被证明 = SKIP + INVALID + ANCHOR + BAD 没变红`，共现的 `COLLATERAL` 不计入——它是证据不是失败。另有两类是**直接中止整轮**（`SystemExit`，不写盘、也进不了计数）：`RESULT-OFFLINE` 红；以及子进程没把话说完（stdout 无 RESULT 判定行 / 无末行 `RESULT:` 汇总 / 退出码非 0-1 / 超过 `CHECK_TIMEOUT = 120s` 没返回），中止消息带 returncode 与 stderr/stdout 末 600 字符。）

`page_id_gone` / `nav_dup` 这两条**改壳前就能证明**，因为它们量的是今天已存在的东西（页面 section 的 id、导航项唯一性）。这一步就是它们的责任：先证明 RESULT3/RESULT6 不是空跑，后面换壳时才有资格说「它俩仍绿」。

五种输出的含义，都不许当成通过：
- **OK 变红**：断言非空跑。下一行的缩进 `证据` 是那条 RESULT 的**完整 FAIL 行**（标签 + 判定值），红的原因必须能在里面读出来——`check("3 …")`/`check("9 …")` 都是合取断言，光看标签会分不清红的是这次变异还是别的东西。再下一行若有 `COLLATERAL`，说明相对基线新红的集合 ≠ 只红目标那一条（`set(reds) - set(base) != {want}`）：共现本身是断言承重的证据，但它不是这次要证的那条，必须逐字读一遍再判断变异串有没有撞到别处（见下面的唯一性）。锚点命中多于 1 处的情形走不到这一行——它会被下面的 `ANCHOR` 在写盘之前拦掉。（`实际` 列现在按编号排序：`shell_check.py` 把 RESULT1..9 攒到测量结束再按 1..9 打印，不再是改前的 1,2,5,3,4,6,7,8,9；输出顺序与本页表格的编号顺序对齐了。）
- **SKIP**：锚点串还没进文件（Task 2/3/4 没做到位）。这条同时是「计划里的 CSS 片段是否真被写进文件」的探针——漏写 `.modal` 容器块、漏写 `--sidebar-w`、Task 4 那段没落地，都会在这里以 SKIP 现形。
- **BAD 没变红**： 锚点在、目标断言基线也是绿的，改完它却没红 —— 要么这条断言仍在空跑，要么变异串打到了别的对象。实测口径（在 `/f/tmp` 的驱动副本里把 `page_id_gone` 的 `want` 故意写成 RESULT4）：`page_id_gone: BAD 没变红  期望 RESULT4 红，实际 ['RESULT1', 'RESULT2', 'RESULT3', 'RESULT5', 'RESULT8']`，下面紧跟 `COLLATERAL 相对基线新红 ['RESULT3']，目标只有 RESULT4` —— 红是红了，红的不是要证的那条；这条同样计入「未被证明」。
- **INVALID**：断言在变异**之前**就已经是红的，这次变异证明不了任何东西。这条预检是我第一版漏掉的，当时 `no_sticky` 打印了 `OK 变红` 而 RESULT1 其实一直红着——假证明比没有证明更糟。注意判定顺序：锚点检查在前，所以 `sidebar_w_zero`（目标 RESULT1 也红）报的是 SKIP 而不是 INVALID。
- **ANCHOR**：锚点在目标文件里**逻辑命中** 多于 1 处。计数口径是逻辑锚点：同一处写成 CRLF 或写成 LF 都算同一条，两种拼法分开数再相加（单行锚点两种拼法是同一个串，只数一遍，不会翻倍）。改前只报「第一个匹配到的拼法」的 `count`，于是混用换行的文件里两处会报成 1、警告静默，而替换只落到**被数过的那个拼法的第一处**，另一处（另一种拼法）原地不动——规则只删了一半，`hits` 看起来却自洽。现在多于 1 处**拒绝写盘**（改前只是警告一声照改），并计入「未被证明」，要做的把锚点收窄到唯一一处。实测（合成 fixture：同一三行锚点出现两处，一处 CRLF 形状一处 LF 形状）：改前驱动报 `hits=1`、真的写了盘、末行 `全部断言已被证明会变红` 且 **exit 0**（假通过的完整形态）；改后报 `hits=2` → `ANCHOR … 拒绝写盘` → `1 项未被证明` exit 1，fixture 字节原样、且 `hits == 1` 的正对照照旧 `OK 变红`。今天 11 条锚点的逻辑命中数是 0 或 1（`no_sticky`/`page_id_gone`/`nav_dup` 各 1，其余 0），所以这一条今天不触发，11 条判定与改前逐字相同。

**每条断言都要有对应的变异**（第一版计划漏了 RESULT3/6/9 三条，等于默许它们空跑）：

| RESULT | 断言 | 证明它的变异 | 何时可跑 |
|---|---|---|---|
| 1 | 侧栏 264 且 sticky | `sidebar_w_zero`、`no_sticky` | Task 2 后 |
| 2 | 工作区 x=264 且 `container-name: ws` | `grid_one_col`、`ws_container_gone` | Task 2 后 |
| 3 | 12 页均有内容、无 pageerror | `page_id_gone` | **改壳前即可（已证）** |
| 4 | 12 页无横向溢出 | `ws_min_width` | Task 2 后 |
| 5 | 侧栏内 12 个导航项 | `sidebar_class_gone` | Task 2 后 |
| 6 | 单高亮且随页切换 | `nav_dup` | **改壳前即可（已证）** |
| 7 | chat 高度 = 工作区可用高度（算术恒等式）且不出视口 | `chat_vh_old`（恒等式那半）；**上限那半没有变异表条目**，由控制器的 100px 注入证明，配方见 Task 3 Step 4 收口段 | Task 3 后 |
| 8 | 模态覆盖视口 + 编辑器是单列 **grid**（`display == "grid"` 且 `tracks == 1`） | `modal_container` | Task 3 后 |
| 9 | 窄屏降级无溢出 | `narrow_no_degrade` | Task 4 后（此前 RESULT9 是红的，会报 INVALID） |

`nav_dup` 尤其有用，但**功劳要记对断言，且要说清是哪一档**（实测口径，不是推测）。`RESULT5` 数 `.sidebar .nav-link`（`shell_check.py` 的 PROBE `navInSidebar`），`RESULT6` 数全站 `.nav-link.active`（`switchPage` 按 `app.js:391-403` 切），两条的口径差就落在「复制出来的那份导航在 `.sidebar` 里还是外面」：
  - **今天（改壳前：导航在顶栏，`index.html:70`）**——复制出的那份在 `.sidebar` **之外**，`navInSidebar` 一个都不数（今天实测 0），所以这条变异只打红 **RESULT6**；上面 Step 4 的 `实际 ['RESULT1', 'RESULT2', 'RESULT5', 'RESULT6', 'RESULT8']` 里 RESULT5 是基线本来就红的那条，不是这次变异的红。同一档下「Task 2 忘删旧顶栏、留两份导航」真正当场咬住的也是 **RESULT6**（双高亮），RESULT5 仍绿。`shell_mutate.py` 表里 `nav_dup` 那句注释写的「同一处变异会连带把 navInSidebar 推到 13 → RESULT5 也红」讲的是**下一档**，不是今天。
  - **Task 2 之后（导航搬进 `.sidebar`）**——`nav_dup` 的锚点本身就在 `.sidebar` 内，复制一份把 `navInSidebar` 从 12 推到 **13** → RESULT5 **与** RESULT6 同时红，驱动在 `nav_dup` 下面打 `COLLATERAL 相对基线新红 ['RESULT5', 'RESULT6']，目标只有 RESULT6`。**这是预期的共现，不是缺陷**：RESULT5 的证明人仍是 `sidebar_class_gone`，`nav_dup` 只是顺带第二次压上它的计数半边。而「忘删旧顶栏」在这档会让锚点命中 2 处 → 驱动按 `ANCHOR` 拒绝写盘（见下面的唯一性段），那时该修的是 Task 2 的删除，不是变异表。
所以 RESULT5 防的是「侧栏内导航项数目不对」，RESULT6 防的是「任何地方多出高亮」。`app.js:371/391-403` 是本计划的冻结面，不能改代码来迁就这句话，是这句话原本记错了账。

锚点唯一性实测（决定变异是否只改到你想改的那处）：`position: sticky;` 在 `styles.css` 里当前**只有 1 处**（`:101`，`.topbar`），Task 2 删掉它后由 `.sidebar` 接手，仍唯一；`box-sizing: border-box;` 当前 1 处但是 `* { ... }` 单行写法（`:58`），所以 `ws_min_width` 用「`box-sizing` 换行 + `min-width: 0;`」两行组合当锚点——单用 `min-width: 0;` 会命中已有的 4 处（`:1171/:1638/:1725/:1800`）而改错对象；`display: block` 单独有 5 处，所以 `narrow_no_degrade` 用整行 `.app-shell { display: block; }`（当前 0 处，Task 4 落地后唯一）。新增的 `ws_container_gone` 锚点是 `.workspace {` + `container-type: inline-size;` + `container-name: ws;` 三行组合，**必须带上 `.workspace {` 这半截**：`.modal` 那块（Task 2 Step 4 末尾）有相同的两行容器声明，只锚那两行会命中 2 处。实测它在 Task 2 的 shell CSS 片段里恰好 1 处、在今天的 `styles.css` 里 0 处（所以今天报 SKIP）。另外两条今天就要记住的：`nav_dup` 的锚点 `<a class="nav-link" data-page="chat">助手</a>` 今天 1 处，Task 2 删顶栏、写侧栏后仍应 1 处——若顶栏没删干净它会变 2 处，此时驱动打 `ANCHOR` 并**拒绝写盘**（锚点重新唯一之前，这条变异不产生任何证明）。`ws_min_width` 与 `ws_container_gone` 的锚点在 `.workspace` 块里相邻但不重叠，各自唯一。换行口径：表里的锚点按 LF 写，驱动会按目标文件自身的换行风格匹配（CRLF 优先，再试 LF），**而命中计数是逻辑的：同一处锚点的两种拼法分开数再相加**，所以混用换行的文件不会把两处误报成一处（单行锚点两种拼法是同一个串，只数一遍）；整串按 **bytes** 读写，所以还原是字节级的（`assert path.read_bytes() == original`）——改前用 `read_text`/`write_text` 时，CRLF→LF 的往返只是靠两个目标今天 100% CRLF 才没露馅，而 Task 2-4 会用发 LF 的工具改文件。每次跑完实测还原后 `pagex-rules`/`助手（重复）`/`min-width: 1200px` 残留计数均为 **0**，`git status --short` 空、`git hash-object` 两文件与开工前逐字节相同（`index.html 3553446776…`、`styles.css 97ededd4ac…`）。

harness 在仓库外，无需 commit；第一个参数可覆盖桌面巡检宽度（`shell_check.py 1024` 即 Tauri `minWidth` 那一档）。


---

## Task 2: 一次性翻转 shell（DOM + CSS）

**Files:**
- Modify: `workbench/index.html:62-89`（`<!-- ========== 顶部导航 ========== -->` 到 `<main class="app-shell">`，顶栏 → 侧栏 + 工作区开标签）
- Modify: `workbench/index.html:227`（`</main>` 处补 `.app-shell` 闭合）
- Modify: `workbench/assets/css/styles.css:100-111`（删 `.topbar`）、`147-151`（删 `.topbar-right`）、`154-158`（`.app-shell` 改 grid）、`:root`（加 token）

**Interfaces:**
- Consumes: 现有类名 `.brand/.brand-logo/.nav/.nav-link/.hidden`（`styles.css:113-145, 468`）与 id `userBadge/btnLogout/mainNav`
- Produces: `.app-shell`（grid 容器）、`.sidebar`、`.workspace`（`container-name: ws`）、token `--sidebar-w/--ws-pad-t/--ws-pad-b` —— Task 3/4 与 `shell_check.py` 都按这些名字量

- [x] **Step 1: 确认基线（与 Task 1 Step 2 逐字一致才算）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
Expected: 红的正好是 `RESULT1/RESULT2/RESULT5/RESULT8`，末行 `RESULT: FAIL(4/9)`。多出或少掉任何一条，都说明工作树被别的改动动过——先回查（`git status --short`、Task 0 是否已落库），不要开始改 markup。（「逐字一致」的口径见 Task 0 Step 3 的注：只认断言编号、红项集合、末行汇总与退出码，不认每条后面的实测证据串。）
**实测（Task 2 执行前，2026-09-30，HEAD `136ecc8`）**：逐字复现 —— `RESULT: FAIL(4/9)`，红项 `RESULT1/RESULT2/RESULT5/RESULT8`，`RESULT-OFFLINE: PASS  8 次外部请求被拦截，成功 0`。开工前两文件 100% CRLF（`index.html` 12280B/259 行、`styles.css` 61933B/2185 行，bare-LF 均为 0）。

- [x] **Step 2: 改 markup**

把 `index.html:62-89`（`<!-- ========== 顶部导航 ========== -->` 起，到 `<main class="app-shell">` 止）整段替换为：

```html
    <!-- ========== 常驻外壳：左栏 + 右工作区 ========== -->
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo">W</div>
          <span>全域自媒体工作台</span>
        </div>
        <nav class="nav" id="mainNav">
          <a class="nav-link active" data-page="dashboard">仪表盘</a>
          <a class="nav-link" data-page="chat">助手</a>
          <a class="nav-link" data-page="hot-radar">热点雷达</a>
          <a class="nav-link" data-page="content">内容创作</a>
          <a class="nav-link" data-page="video-script">视频脚本</a>
          <a class="nav-link" data-page="card-design">卡片设计</a>
          <a class="nav-link" data-page="calendar">内容日历</a>
          <a class="nav-link" data-page="assets">素材资源库</a>
          <a class="nav-link" data-page="metrics">数据复盘</a>
          <a class="nav-link" data-page="templates">模板中心</a>
          <a class="nav-link" data-page="rules">规则库</a>
          <a class="nav-link" data-page="settings">账号与设置</a>
        </nav>
        <div class="sidebar-foot">
          <span id="userBadge" class="tag brand hidden"></span>
          <button id="btnLogout" class="btn btn-ghost btn-sm hidden">退出</button>
        </div>
      </aside>

      <main class="workspace">
```

再在 `index.html` 原 `</main>`（第 227 行，`#page-settings` 之后）后补一层闭合，使结构为「`.workspace` 先关、`.app-shell` 后关」：

```html
      </main>
    </div>
```

约束核对（不要顺手改）：12 个 `<section id="page-*" class="page">` 的 id、class、顺序全部原样；`#authMask`（:18）与 `#toast`（:230）保持 body 级兄弟节点，不能被挪进 `.workspace`（`shell_check.py` 的 RESULT8 就是量这件事）。
**实测（Task 2）**：两段都按上面的块逐字落地。`grep -o 'id="page-[a-z-]*" class="page'` 得 12 条、顺序与改前一致（dashboard/chat/hot-radar/content/calendar/assets/card-design/video-script/metrics/templates/rules/settings）；`#authMask`（现 `:18`）与 `#toast`（现 `:231`）仍在 `.app-shell`（`:63-228`）之外，awk 区间内 `authMask|id="toast"` 命中 0。零 JS 改动（`git diff HEAD --name-only` 只有 `index.html`、`assets/css/styles.css`）。`</main>` 闭合按本步给的块保持 6 空格缩进，`.workspace` 内 12 个 section 的缩进未动（不改缩进是为了让 diff 只装结构变化）。

- [x] **Step 3: 删掉两条会一起搬错的死 CSS**

Run（确认这两个选择器只被 CSS 自用，没有任何 JS 引用）：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && grep -rn "topbar" assets/js/ | wc -l
```
Expected: `0`
实测（2026-09-30）：`grep -rn "topbar" assets/js/ | wc -l` = **0**；顺带把另外三个可能被结构牵连的名字数了 —— `mainNav` = 0、`app-shell` = 0，`userBadge` = 3、`btnLogout` = 3，而这 6 处全是按 id 直接取元素（`app.js:51/56/57/129/130/131`），没有任何一处依赖它们在 `.topbar` 里。所以把这两个节点搬进 `.sidebar-foot` 是安全的，`.topbar` 类则可以整条删掉。
然后删除 `styles.css:99-111`（第 99 行是 `/* ── 顶部导航 ── */` 注释，留着它就成了指向不存在类的孤儿注释；`100-111` 是 `.topbar {…}`，实测它自己就带那唯一的 `position: sticky`）、`147-151`（`.topbar-right {…}`），以及 `styles.css:223-224` 两行（`:223` `.app-shell { padding: 20px 16px 60px; }` 的内边距改由 `.workspace` 承担、`:224` `.topbar { padding: 12px 16px; gap: 12px; }` 删了类就没了；这两行所在的 `@media (max-width: 640px)`（`:221-225`）在 Task 3 转成容器查询）。
CSS 侧的 `topbar` 引用实测**总共只有这 3 处**（`grep -n "topbar" assets/css/styles.css` → `:100`、`:147`、`:224`），`mainNav` 在 CSS 里 0 处、`.brand`/`.brand-logo` 各 1 条（`:113`、`:120`，都不含 `.topbar` 前缀，搬进侧栏不用改）。删完再数一次，必须是 0：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && grep -c "topbar" assets/css/styles.css
```
Expected: `0`（改前是 3）。非 0 就是漏了 `:224` 那条媒体块里的覆盖。
**实测（Task 2）**：`grep -rn "topbar" assets/js/ | wc -l` = **0**；`grep -c "topbar" assets/css/styles.css` 由 **3 → 0**。删的是 `.topbar`（连同它上面那条 `/* ── 顶部导航 ── */` 孤儿注释，它带的正是全文件唯一的 `position: sticky;`）、`.topbar-right`、以及 `@media (max-width: 640px)` 里的 `.app-shell{padding}` 与 `.topbar{padding}` 两行。删后该媒体块只剩 `.grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }` 一条（Task 3 Step 1 把它转成 `@container ws (max-width: 576px)`）。`userBadge`/`btnLogout` 的 6 处引用仍全部按 id 取元素（`app.js:51/56/57/129/130/131`），搬进 `.sidebar-foot` 未牵连 JS。

- [x] **Step 4: 写 shell CSS**

在 `styles.css:6` 起的 `:root` 块内，`--radius-*` 那组之前插入：

```css
  /* shell 尺寸：侧栏宽度沿用 Easel 实测值 */
  --sidebar-w: 264px;
  --ws-pad-t: 28px;
  --ws-pad-b: 80px;
```

把 `styles.css:154-158` 的 `.app-shell` 整块替换为：

```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px 16px;
  background: var(--surface-strong);
  border-right: 1px solid var(--line);
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 60;
}
.sidebar .nav {
  flex: 0 0 auto;
  flex-direction: column;
  gap: 2px;
  overflow: visible;
}
.sidebar .nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  white-space: normal;
}
.sidebar .nav-link.active::before {
  content: "";
  flex: 0 0 auto;
  width: 3px;
  height: 16px;
  margin-left: -12px;
  border-radius: 0 3px 3px 0;
  background: var(--brand);
}
.sidebar-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.workspace {
  container-type: inline-size;
  container-name: ws;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: var(--ws-pad-t) 32px var(--ws-pad-b);
}
.modal {
  container-type: inline-size;
  container-name: ws;
}
```

四条设计理由，改动时必须知道：
- 第二列用 `minmax(0, 1fr)` 而不是 `1fr`：`1fr` 的默认最小尺寸是 `auto`，会被不可折行的内容撑破整列。实测本站唯一的固定宽度大户 `.cd-preview { width: 360px }`（`styles.css:1559`）**已经带 `max-width: 100%`**（`:1560`），全文件 `width: 300px+` 的硬宽度只有它一处（其余全是 `max-width`），所以这条护栏防的是「长串不可断行 + `.card-design-layout` 的 `220px 1fr 280px` 固定轨」（`:1478-1481`）这类合成效应，不是某个已知越界点。RESULT4 量的是这件事，别把它当装饰。
- `.modal` 也声明成同名容器：`showModal()` 把 `.modal-mask` 挂到 `document.body`（`utils.js:80-86`，实测 `parent === "BODY"`），它在 `.workspace` 之外，容器查询对它是瞎的。给它同一个 `container-name: ws`，Task 3 翻转的那 15 条断点才会继续作用于模态内部，顺带修掉「编辑器在 640px 模态里挤两列」的既有 bug。
- **与 Easel 有意不同的一处**：Easel 关掉文档滚动、每页自己滚（`web/frontend/src/styles/index.css:55-60` 的 `html,body{height:100%;overflow:hidden}`、`:83` `.app-layout{display:flex;height:100%}`、`:85-93` `.sidebar{width/min-width:var(--sidebar-width) 264px;height:100%;overflow:hidden}`、`:210` `.main-content{flex:1;height:100%;overflow:hidden}`）。这里选 **sticky 侧栏 + 文档滚动**，因为本计划的验收线之一是零 JS 改动：12 个 `.page` 今天全在文档流里、没有一个是自己的滚动容器，照抄 Easel 的高度锁死模型就得逐页补高度链与 `overflow-y:auto`（12 处牵连 + `chat.js` 那 5 处 `scrollTop` 写入的落点会变）。代价说清楚：侧栏 `height:100vh` 且自己 `overflow-y:auto`，右栏随文档滚，宽屏上会出现两条滚动线；`.sidebar{z-index:60}` 保证滚动的内容从侧栏下方穿过时不盖住它。
- 常驻侧栏的真实代价，不掩盖：`.workspace` 保留 `max-width: 1320px`，整个壳最宽 1584。在 1440 视口下工作区只有 `1440-264 = 1176`、内容 `1112`，比今天的 `1256` 窄 **144px**。要 264 侧栏和 1256 内容同时成立需要 1584 以上视口，物理上不可兼得。这一条直接决定了 Task 3 Step 1 里 `.chat-tools` 阈值的特例。
**实测（Task 2）**：token 三条落在 `styles.css:46-49`（`:root` 内、`--radius-*` 组之前）；shell 块落在 `:138-204`（`/* ── 主体容器 ── */` 起，含 `.app-shell` grid `:139` / `.sidebar` sticky `:146` / `.sidebar-foot` `:182` / `.workspace` `container-name: ws` `:191` / `.modal` 同名容器 `:201`）。Step 4 的每一段都真进了文件——用 `shell_mutate.py` 的锚点命中数当探针复核（按 `locate()` 的「逻辑锚点」口径，CRLF 与 LF 两种拼法分开数再相加）：`--sidebar-w: 264px;`、`position: sticky;`、`grid-template-columns: var(--sidebar-w) minmax(0, 1fr);`、`.workspace {`+两行容器声明、`box-sizing: border-box;`+`min-width: 0;`、`<aside class="sidebar">`、`<a class="nav-link" data-page="chat">助手</a>`、`.modal` 三行块 **各 1 处**（`position: sticky;` 全文件从 `.topbar` 的 1 处换手为 `.sidebar` 的 1 处，仍唯一，`no_sticky` 才有得可证）。落盘后两文件仍 100% CRLF、bare-LF 0。另量了一条本步没有断言覆盖的风险：`.modal` 上加 `container-type: inline-size` 会带来 inline-size containment（自身宽度不得依赖内容），实测 `showModal()` 出的 `.modal` 在 1440/1024 两档都是 **640px**（`max-width: 640px` 生效、没被压塌成 0），`.modal-lg` **920px**，`maskW` 仍等于视口宽，模态内 `scrollWidth 638 ≤ 640`，JS 错误 0。

- [x] **Step 5: 跑 harness**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
Expected（本任务结束时应有 **3 红 6 绿**：`RESULT7/8/9`，每条红都指向后面哪个任务修它）：
- 转 PASS：`RESULT1`、`RESULT2`（现在还含 `.workspace` 的 `container-name: ws`，就是 Step 4 那段）、`RESULT5`
- **转 FAIL（新红，预期内）**：`RESULT7`。`168px` 这个常量是给「顶栏 60 + `.app-shell` 上下内边距 28+80」凑的；顶栏一撤、`.workspace` 改用 `--ws-pad-t: 28`，`.chat-wrap` 顶边就从实测的 `93` 抬到约 `33`，`chatBottom` 由 `825` 掉到约 `765`，落在判定带 `[814, 901]` 之外。**765 是算术推的，不是实测**：跑完把 harness 打印的真实值记进本步的勾选备注里，Task 3 Step 3 用 `calc(100vh - var(--ws-pad-t) - var(--ws-pad-b))` 修。
  **实测（Task 2 跑完后）= `chatBottom=760`**（1440 与 1024 两档同值，判定带只看 vh=900），比算术推的 765 低 5px，仍落在 `[814, 901]` 之外 → 红的是这条断言该红的方向。`shell_check.py` 一个字节没改，判定带留给 Task 3 用实测值收紧。
- **转 FAIL（新红，由断言构造决定）**：`RESULT9`。Task 2 给 `.app-shell` 写的是**无条件** `display: grid`，而 RESULT9 断言 390 视口下 `display == "block"`；侧栏此时还占着 264px。Task 4 的 `@media (max-width: 760px)` 降级段修它。
- 仍 FAIL：`RESULT8`（`tracks: 2`，Task 3 修）
- 必须仍 PASS：`RESULT3`、`RESULT4`、`RESULT6` —— 其中 `RESULT4` 一旦红，就是 `minmax(0, 1fr)` 或 `min-width: 0` 漏了，立刻回查，不要留给后面的任务
**实测（Task 2，逐字输出见 `task-2-report.md`）**：默认档（1440）**3 红 6 绿**，红项正是 `RESULT7/RESULT8/RESULT9`，`RESULT1/2/5` 转 PASS，`RESULT3/4/6` 仍 PASS，`RESULT-OFFLINE: PASS`，exit 1 —— 与本步预期逐字一致。
**额外证据步（controller ruling，本任务的 Step 5 附加项）**：跑「Task 2 之后锚点才存在」的那 8 个变异，证明这批断言不是空跑 —— `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py sidebar_w_zero no_sticky grid_one_col ws_container_gone page_id_gone ws_min_width sidebar_class_gone nav_dup`。实测首行 `变异前基线红项：['RESULT7', 'RESULT8', 'RESULT9']`（与本轮 3 红一致），8 行全部 `OK 变红`，末行 `全部断言已被证明会变红`，exit 0；**0 SKIP**（= Step 4 的每一段都真在文件里）、**0 INVALID**（8 个目标断言都不在预期红集 {7,8,9} 内）、**0 ANCHOR**（锚点各唯一）、无 `还原失败（字节级）`；跑完两文件与变异前 `cmp` 字节相同、`git status --short` 只剩这两个 M。共现红项：`sidebar_w_zero` 带 `COLLATERAL ['RESULT1','RESULT2']`、`nav_dup` 带 `COLLATERAL ['RESULT5','RESULT6']`（后一条是计划 :651 预告的 Task 2 之后设计如此，不是缺陷）；`grid_one_col`、`sidebar_class_gone` 也各带一条 `COLLATERAL`（把 grid 改成单列会连带打红 RESULT1、去掉 `.sidebar` 类会连带打红 RESULT1 —— 都是断言承重的表现，目标项各自已变红）。
**额外一档（`shell_check.py 1024`，本步未要求，是 Task 3 Step 4/5 要跑的口径）**：`RESULT4` 在这档 **FAIL `card-design(+186px)`**，其余与 1440 档同（7/8/9 红）。按本步「RESULT4 一旦红就回查」当场回查过：`minmax(0, 1fr)` 与 `min-width: 0` 两段都在文件里（Step 4 的锚点命中数各 1），**不是漏写护栏**；真实成因是 `.card-design-layout` 的 `@media (max-width: 900px) → 1fr`（`styles.css:1531-1532`）按视口判定 —— 1024 视口下它不触发，而容器只有 696（`1024-264-64`），三列 `180px 1fr 260px`（`:1528-1529` 那条 1100px 档）的中列被 `.cd-editor` 的 min-content 顶到 442px，`.workspace` `scrollWidth 946 > clientWidth 760`。这条正是 Task 3 Step 1 换算表里 `max-width: 900px → @container ws (max-width: 836px)` 要收的：容器 696 ≤ 836 会把它降成单列。改壳前同档同页 `RESULT4` 是 PASS（1024 视口下内容 960，三列装得下），所以这是改壳的**已知几何代价**、不是新 bug，且 Task 2 未动任何 `.card-design-*` 规则。

- [x] **Step 6a: 主窗口宽度的自动化几何复核（代 `npx serve`，1440/1024 两档）**

Run: `cd "/f/Qoder/自媒体/自媒体工作台/workbench" && npx serve . -l 4173` → 浏览器开 `http://127.0.0.1:4173`，把窗口拖到 1024（Tauri `minWidth` 下限）。
Expected: 侧栏 264 固定，右栏 760 起，无横向滚动条。
注意：本计划的自动化只跑 Chromium（Playwright），WebView2 里若出现差异需人工反馈，自动化不声称覆盖它。
**实测（Task 2，按 controller ruling 换了执行方式）**：`npx serve` **没有跑** —— 它会阻塞并且与 harness 的 4174 单实例端口抢资源；改用一次性 Playwright 脚本 `/f/tmp/task2/shot.py`（自带 4175 静态服务、外部请求全 abort、按 `.verify-shell` 的口径打桩 Db/Supabase，并把未登录时盖住整壳的 `#authMask` 手动 `.add("hidden")`）在 1024x768 与 1440x900 各截图一张并量几何：
- 1440x900：`sidebarW=264 sidebarX=0 sidebarPos=sticky wsX=264 wsW=1176 scrollWidth=1440 overflowX=0 hasScrollbarH=False display=grid`
- 1024x768：`sidebarW=264 sidebarX=0 sidebarPos=sticky wsX=264 wsW=760 scrollWidth=1024 overflowX=0 hasScrollbarH=False display=grid`
即「侧栏 264 固定、右栏 760 起、dashboard 无横向滚动条」在两档都成立。**但这不是人眼验收**：截图只证明了几何，`card-design` 页在 1024 档确有 186px 横向溢出（见 Step 5 那条），`dist/` 未同步（Task 5），**WebView2 / Tauri 没有任何自动化覆盖**，本步的人工看一眼仍挂着 —— 需要人在真窗口里过一遍（Task 6 Step 5 是它的正式档）。

- [ ] **Step 6b: 人眼在真窗口验收（1024 下限 + WebView2/Tauri）**

这一步**自动化一条都代替不了**，勾上它必须有人的签字：在真 Tauri/WebView2 窗口里把宽度压到 `minWidth: 1024`，看侧栏是否 264 固定、右栏是否 760 起、`card-design` 页是否有横向滚动条（Task 2 结束时它**会**有 186px 溢出，由 Task 3 的容器查询修掉，所以这一眼要在 Task 3 之后再看）。正式档期是 Task 6 Step 5；Task 2 的几何复核不能替它打勾，因为 Chromium 与 WebView2 的滚动条宽度、字体度量与合成器都不同，本计划的自动化从不声称覆盖后者。

- [x] **Step 7: Agent 全链路没被改坏**

Run: `cd /f/Qoder/自媒体/.verify-agent && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" drive.py`
Expected: `RESULT-STREAM` + `RESULT1…RESULT11` 共 12 行全 PASS，exit 0（改壳前基线已复跑确认，见差异表 A）。尤其 `RESULT7 面板工具`（左栏工具面板渲染）与 `RESULT11`（两步确认删除 + 清空会话）：chat 页 DOM 位置变了，这两条最容易受牵连。
**实测（Task 2 改壳后）**：全绿 —— `RESULT-STREAM: PASS` + `RESULT1…RESULT11: PASS`（12 行）+ 末行 `RESULT: PASS`，**exit 0**。点名那两条：`RESULT7` 打的是 `面板工具: ['db_list','db_get','db_stats','skill_topic_schedule_gap'] | 技能标记: 1`、`面板可读表` 6 张、`RESULT11` 的两步确认（`确认删/取消`）与二次清空（`确认清空？→ 清空本会话`）都按预期走。stdout 里 `JS 错误(全程): (无)`；stderr 有一段 `ConnectionAbortedError: [WinError 10053]` 的 traceback，来自 `mock_provider.py:86` 在 RESULT5「停止生成」那一轮被客户端掐断 —— 那是驱动自己的既有噪声，与 shell 无关，该轮 `RESULT5: PASS`、末行仍是 `RESULT: PASS`。

- [x] **Step 8: Commit**

```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
git add index.html assets/css/styles.css
git commit -m "feat(shell): 顶部横向导航改为常驻左栏 + 右工作区"
```

**实测（Task 2）**：已按上头两条命令落库 —— `ad34f3d feat(shell): 顶部横向导航改为常驻左栏 + 右工作区`，`2 files changed, 94 insertions(+), 49 deletions(-)`（只 `index.html` + `assets/css/styles.css`，未 `git add -A`、未动 `dist/`、未 `--amend`、未 `--no-verify`、未 push）。本计划文档的复选框与实测量按 controller ruling 单独一个 `docs(plan)` commit，不与代码混在一起。

---

## Task 3: 15 条断点改容器查询 + chat 高度去常量

**Files:**
- Modify: `workbench/assets/css/styles.css` 的 15 处 `@media`（行号见下表，均为改壳前原始行号）
- Modify: `workbench/assets/css/styles.css:1986-1991`（`.chat-wrap` 高度）

**Interfaces:**
- Consumes: Task 2 的 `container-name: ws`、`--ws-pad-t/--ws-pad-b`
- Produces: 所有工作区/模态内布局按「自己那一栏的宽度」响应；`shell_check.py` 的 RESULT8 转绿

- [x] **Step 1: 按「查询值」整批替换，不是按行号**

先纠正我第一版的两个错，别照着错的手改：

1. **数字要减 64**。旧断点量的是视口宽，而当时的内容宽 = `视口 - 64`（`.app-shell` 左右各 32 padding，`border-box` 下 `max-width: 1320` 只在视口超过 1320 时才把内容钉住）。改成容器查询后量的是 `.workspace` 的内容盒，要「在同一内容宽度上触发」就必须把阈值平移 `-(2×32) = -64`。**照抄原数字**会让所有版式在比今天宽 64px 的地方就塌：例如 `.grid-3/.grid-4 → 2 列` 今天是视口 ≤ 980（内容 916）才发生，照抄 `980` 之后变成内容 ≤ 980 就发生，对应视口 1308。Tauri 的 `minWidth: 1024` 尤其吃这一刀：1024 下内容 = `1024-264-64 = 696`，照抄 980 的容器规则直接命中，今天却不命中。
2. **行号在 Task 2 之后全部作废**。Task 2 删了 `.topbar`(12 行) + `.topbar-right`(5 行) 并给 `.app-shell` 加了 ~40 行，下表的「原行号」只是定位证据用的**改壳前**行号，执行时先用 `grep -n '@media' assets/css/styles.css` 重新数。按值替换正好绕开这个问题：同一查询值总是映射到同一新阈值。

实测值分布（`grep -oE "@media \(max-width: [0-9]+px\)" | sort | uniq -c`，改壳前）：`640×4`、`900×3`、`980×2`、`560×2`、`768×1`、`720×1`、`1180×1`、`1100×1` = 15 条，全在 `styles.css`（`index.html` 里 `@media` = 0，`assets/css/` 只有这一个文件，已实测）。

| 原查询值 | 出现次数 | 改成 | 命中的规则（行号为改壳前实测） |
|---|---|---|---|
| `max-width: 980px` | 2 | `@container ws (max-width: 916px)` | `:218` `.grid-3,.grid-4 → repeat(2,1fr)`；`:664` `.editor-layout → 1fr`（模态内那条就是既有 bug，容器名挂在 `.modal` 上才会生效） |
| `max-width: 640px` | 4 | `@container ws (max-width: 576px)` | `:221` `.grid-2/3/4 → 1fr`（**同块内 `:223/:224` 两行删掉**：`.app-shell` 内边距改由 `.workspace` 承担，`.topbar` 已在 Task 2 删除）；`:1066` `.platform-compliance-grid → 1fr`；`:1300` `.chart-wrap → height:200px`；`:1798` `.hr-topic-* → flex-direction:column` |
| `max-width: 900px` | 3 | `@container ws (max-width: 836px)` | `:1266` `.metrics-dashboard → repeat(3,1fr)`；`:1359` `.cal-stats → repeat(4,1fr)`；`:1487` `.card-design-layout → 1fr` + `.cd-sidebar{order:1;max-height:300px}` |
| `max-width: 560px` | 2 | `@container ws (max-width: 496px)` | `:1269` `.metrics-dashboard → repeat(2,1fr)`；`:1360` `.cal-stats → repeat(2,1fr)` |
| `max-width: 720px` | 1 | `@container ws (max-width: 656px)` | `:778` `.calendar-grid → repeat(7,minmax(60px,1fr))` |
| `max-width: 768px` | 1 | `@container ws (max-width: 704px)` | `:1429` `.cal-week-grid/.cal-week-body → 44px repeat(7,1fr)` |
| `max-width: 1100px` | 1 | `@container ws (max-width: 1036px)` | `:1484` `.card-design-layout → 180px 1fr 260px` |
| `max-width: 1180px` | 1 | `@container ws (max-width: 800px)` **唯一不 -64** | `:2068` `.chat-tools → display:none`，理由见下 |

`:2068` 这条为什么单独定：它是全站唯一「内容宽度硬约束」型断点（三栏并排），而 -64 平移会让它在 `1440` 视口命中（内容 `1112 ≤ 1116`），于是助手页在开发机常用的 1440 上丢掉工具栏——今天是显示的。实测三栏的硬底：`.chat-rail flex:0 0 190px`（`:1993`）+ `.chat-tools flex:0 0 232px`（`:2051`）+ `.chat-wrap gap:14px`×2 = **450px**，剩下给 `.chat-main flex:1`（`:2028`）。`.chat-main` 里最硬的约束是 `.chat-skill width:210px` + 输入框 + 按钮那一行，留 350px 才不难看。取 `450 + 350 = 800`。1440 下内容 1112 → 三栏、`.chat-main` 得 662（与今天 1181 视口下的 667 同量级）；1024 下内容 696 ≤ 800 → 退两栏，正是该有的行为。

```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
for p in "980 916" "640 576" "900 836" "560 496" "720 656" "768 704" "1100 1036"; do
  set -- $p
  sed -i "s/@media (max-width: $1px)/@container ws (max-width: $2px)/g" assets/css/styles.css
done
sed -i "s/@media (max-width: 1180px)/@container ws (max-width: 800px)/" assets/css/styles.css
```

**实测（Task 3）**：动手前 `grep -n "@media" assets/css/styles.css` 数到 15 条，落在 `264/267/708/822/1110/1310/1313/1344/1403/1404/1473/1528/1531/1842/2112`；按值分布 `640×4`、`900×3`、`980×2`、`560×2`、`720×1`、`768×1`、`1100×1`、`1180×1` = 15，与本表逐条一致（`index.html` 里 `@media` = 0）。上头那段 `sed` 循环原样跑完。

- 表里 `:223/:224` 那两行（`.app-shell { padding: 20px 16px 60px; }` 与 `.topbar { padding: 12px 16px; gap: 12px; }`）**Task 2 已经删掉了**，本步无需再删：实测 `git show ad34f3d~1:assets/css/styles.css` 的 640 块里它们还在，当前文件 `grep -c topbar` = **0**，那个块现在只剩 `.grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }` 一行。
- **`sed -i` 把整文件的 CRLF 换成了 LF**（`bytes 62826 → 60701`、`crlf 2229 → 0`、`bare_lf 0 → 2229`）。本仓库 100% CRLF，整文件换 EOL 是缺陷不是观感问题，当场用 bytes 级 `LF → CRLF` 还原成 `62930B / crlf 2229 / bare_lf 0 / 行数仍 2229`（`62826 + 104 = 62930`：14 条各 +7 字符、`1180→800` 那条 +6）。**给 Task 4/5 的口信：在这个仓库里 `sed -i` 之后必须查 EOL，或直接用会保 CRLF 的编辑器。**
- 新增两处理由注释，都落在块**外**（`.modal {` 上方、`.chat-tools` 那条阈值上方），四个承重锚点一个没动。**踩到的坑记下来**：注释正文里不要出现字面量 `@media` / `@container`，否则本步 `grep -c "@media"` = 0 与 `@container` 总数 15 这两道门会被注释自己撞红（第一版就撞了，改成「原视口断点 1180px」「同一批『容器 ws』查询」后归零）。

- [x] **Step 2: 检查替换数量（按值数，不按行数）**

Run:
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
grep -oE "@container ws \(max-width: [0-9]+px\)" assets/css/styles.css | sort | uniq -c
grep -c "@media" assets/css/styles.css
```
Expected: `576×4`、`836×3`、`916×2`、`496×2`、`656×1`、`704×1`、`800×1`、`1036×1`（合计 15），`@media` 计数 = **0**（Task 4 才把窄屏那条加回来，它是刻意保留的视口查询）。数字对不上就是漏换或重换。此时 `@container` 总数应为 15；若你顺手数出 17，多半是把 `.modal`/`.workspace` 的 `container-type` 两行也误当查询计进去了。

**实测（Task 3，逐字输出）**：

```
      1 @container ws (max-width: 1036px)
      2 @container ws (max-width: 496px)
      4 @container ws (max-width: 576px)
      1 @container ws (max-width: 656px)
      1 @container ws (max-width: 704px)
      1 @container ws (max-width: 800px)
      3 @container ws (max-width: 836px)
      2 @container ws (max-width: 916px)
```

`grep -c "@media"` = **0**（grep 无匹配时 exit 1，是正常红）、`grep -c "@container"` = **15**（不是 16/17：`.workspace`/`.modal` 那两处的 `container-type` / `container-name` 行里不含 `@container` 字面量，但**注释里可能有** —— 见 Step 1 那条口信）。合计 15 条，与预期分布逐条对齐，无漏换无重换。
落盘审计（Step 1-3 与两处注释全部落地后）：`63912B / crlf 2237 / bare_lf 0 / 结尾 CRLF / 行数 2237`；`grep -c "168px"` = 0、`grep -c topbar` = 0。


- [x] **Step 3: chat 高度去常量**

`styles.css:1986-1991` 现在是：

```css
.chat-wrap {
  display: flex;
  gap: 14px;
  height: calc(100vh - 168px);
  min-height: 520px;
}
```

`168px` 是「顶栏 60 + `.app-shell` 上下内边距 28+80」的经验值，顶栏一没就错了。整块替换为：

```css
.chat-wrap {
  display: flex;
  gap: 14px;
  height: calc(100vh - var(--ws-pad-t) - var(--ws-pad-b));
  min-height: 520px;
}
```

**实测（Task 3）**：落盘就是上面那 6 行，高度那一行的字面量是 `  height: calc(100vh - var(--ws-pad-t) - var(--ws-pad-b));`（一行、带分号），`grep -c "height: calc(100vh - var(--ws-pad-t) - var(--ws-pad-b));"` = **1** → `chat_vh_old` 的锚点唯一；`grep -c "168px"` = **0**。
**锚点唯一性用驱动自己的 `locate()` 复核**（纯函数、不写盘；`importlib` 载入 `shell_mutate.py` 后逐个问 hits）：10 个变异里 9 个 `hits=1`，`narrow_no_degrade` `hits=0`（它的宿主 `.app-shell { display: block; }` 是 Task 4 要新增的那条视口降级，本步按 brief 故意不跑它）。四个承重锚点 `ws_min_width` / `chat_vh_old` / `modal_container` / `ws_container_gone` 全 `hits=1`，两种 EOL 拼法分开数也是「CRLF 形状 1 处 + LF 形状 0 处」。
`.workspace` 的 `box-sizing: border-box;` **保留**（上一轮 review 提过它与 `* { box-sizing: border-box }` reset 重复）：它是 `ws_min_width` 锚点串的前半，删了那条变异就退化成 `SKIP`，`RESULT4` 的 `min-width: 0` 护栏就没人证了 —— 留它的理由是证据链，不是样式需要。


- [x] **Step 4: 跑 harness（两档宽度都要跑）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py 1024`
Expected: 两档都只剩 `RESULT9` 红（Task 4 的窄屏降级还没写），末行 `RESULT: FAIL(1/9)`。`RESULT8` 转 PASS 就是 `display: 'grid'` 且 `tracks: 1`，即那条 640px 模态挤两列的既有 bug 被容器查询顺手修掉了；`RESULT7` 的 `chatBottom` 应回到 **825**——这是算术推的：`height: calc(100vh - 28 - 80)` 在 vh=900 得 792，`.workspace` 顶部内边距 28 + 页面自身那 5px 得顶边 33，`33 + 792 = 825`，与改壳前实测的 825 相同。跑出来不是 825 就以实数为准并记在这里，别硬凑。

**实测（Task 3，两档都是 `FAIL(1/9)`、只剩 `RESULT9` 红、`RESULT-OFFLINE: PASS`、exit 1）**：`RESULT8` 按预期转 PASS —— 1440 档 `{'parent': 'BODY', 'maskW': 1440, 'maskH': 900, 'display': 'grid', 'tracks': 1, 'vw': 1440, 'vh': 900}`，1024 档同形只是 `maskW/vw` 变 1024；`.modal` 内容盒实测 **590** ≤ 916，所以 `.editor-layout` 那条单列规则在模态里第一次真的生效了，`tracks` 从 2 变 1。

> **更正（Task 3 收口时量的）**：implementer 报告与本文原先都写 `592（640 - 2×24）`，那是算术不是实测 —— 漏了 `.modal` 的 `border: 1px`，而 `* { box-sizing: border-box }`（`styles.css:63`）让 640 含边框与内补，真值 `640 - 2×1 - 2×24 = 590`。直接量法：在 `.modal` 里插一个 `width:100cqw` 的探针，`getBoundingClientRect().width` = **590**（同一探针另报 `offsetWidth 640 / clientWidth 638 / boxSizing border-box`）。差 2px 不改变任何结论（590 与 592 都 ≤ 916、都 > 576），但 `styles.css` 里那条注释、Task 6 的清单和 `task-3-report.md` 都已按 590 更正。

`chatBottom` **实测量 = 820，不是算术推的 825**：差的正是那句「页面自身那 5px」—— `grep -c "page" assets/css/styles.css` = **0**，`.page` 这些 `<section>` 在本仓库没有任何 CSS 规则（显隐只靠 `.hidden { display: none !important; }`），所以 `.chat-wrap` 的顶边就等于 `.workspace` 的 `padding-top` = 28，`28 + 792 = 820`。以实数为准记在这里。

**额外一步（controller ruling，本任务授权改 harness 的唯一一处）：`RESULT7` 的判定由「带」改成「算术恒等式」。**
旧带 `vh-80-6 <= chatBottom <= vh+1` 在 vh=900 放行 `[814, 901]` 这 88px 宽的一个区间 —— 它能放行 `calc(100vh - 114px)` 这类**另一个硬常量**，而 Task 2 刚拆掉的 `168px` 就是同一族东西，所以那条带子对「去常量」这件事没有鉴别力。新判定：

```
chatBottom == chatTop + (vh - padT - padB)
```

`chatTop`/`chatBottom` 取 `.chat-wrap` 的 `getBoundingClientRect()`（浮点原值，不预先取整），`padT`/`padB` 取 `.workspace` 的 `getComputedStyle` 内补，`vh` 取 `innerHeight` —— 四项全部现量，于是页面那点顶部偏移自己进了等式，不再是需要硬凑的 `+5`。容差 **±1px**（理由写在 harness 注释里）：`chatTop` 与 `chatBottom` 是两次独立的浮点读数，非整数 DPR 或页面缩放下各带小数，相减最坏漂 1px；实测两档 vh=900 下等式两边都是整数 820、误差 0。9 条编号断言与 `FAIL(n/9)` 分母没动，判定行照旧把操作数打全：`RESULT7: PASS  7 chat 高度 = 工作区可用高度（算术恒等式）  chatBottom=820 期望 chatTop=28 + (vh=900 - padT=28 - padB=80) = 820 ±1，且 <= vh+1=901`。
改完 `python -m py_compile shell_check.py` 通过，且 `shell_check.py`（13979B / 269 行 / 100% CRLF）与本文档 :133 那个围栏块 **raw 逐字节相同**（两文件都是 CRLF，所以不需要先做 LF 归一）。`chat_vh_old` 在新判定下实测打红（见 Step 6 的证据行）：`chatBottom=760 期望 ... = 820 ±1`。

**Task 3 收口补的一条：恒等式对「chat 自己往下挪」是瞎的，必须再加一条绝对上限。** 评审给出的反例成立：若 chat 页里往上插了 100px，`.chat-wrap` 高度不变而 `top=128`、`bottom=920`，等式两边一起涨到 920 仍然成立 → 绿，而输入框已经掉出视口。旧带 `chatBottom <= vh+1` 那半边本来就是绝对上限，被我换成恒等式时一起丢了。补回来的写法是 `and g["bottom"] <= c["vh"] + 1`（不是评审建议的 `vh - padB + 1`：今天实测 `bottom=820 = vh(900) - padB(80)`，chat 底边正好压在 padB 线上，写成 `vh-padB+1=821` 等于要求 `chatTop` 与 `padT` 逐像素对齐，页内任何 1px 边距就判红，逼着人再引入「允许页内偏移」这种硬常量）。判定行同时把这条上限打出来（上面那句 `，且 <= vh+1=901`）。
这条不是空转，两个方向都实测过：(1) 临时往 `styles.css` 末尾追加 `#page-chat { padding-top: 100px; }` 再跑，`RESULT7: FAIL … chatBottom=920 期望 chatTop=128 + (vh=900 - padT=28 - padB=80) = 920 ±1，且 <= vh+1=901` —— 恒等式**成立**（920=920，误差 0）而判定红，正是反例那一半；跑完按字节还原，`git hash-object assets/css/styles.css` 前后同为 `3daadfe9494b14f154a3e1df329d475862721d14`、`git status --short` 空。(2) `chat_vh_old` 仍 `OK 变红`（`chatBottom=760 期望 … = 820`），恒等式那半没被新子句吃掉。
两个前提下限也实测过（把 `browse(DESK_W, 900)` 的高度改成参数跑，不动仓库里的 harness）：`vh < 628`（= 520 + padT 28 + padB 80）时 `min-height: 520px` 起跳，恒等式自己先红（vh=600 实测 `bottom=548` vs 期望 520）；`vh < 548`（= padT 28 + 520）时新上限也红（vh=540 实测 `bottom=548 > 541`；vh=560 上限仍放行 `548 <= 561`，只有恒等式红）。harness 把 vh 钉在 900，两条都够不着，但改视口的人要连 `min-height` 一起看。


- [x] **Step 5: 量最窄桌面宽度下的溢出（这是改壳的真实代价，必须量不是猜）**

`shell_check.py` 的第一个参数就是巡检宽度，不用改代码：`shell_check.py 1024`（Tauri `minWidth`）。
改壳前实测（2026-09-30）：`RESULT4: PASS 12 页均无横向溢出 []` —— 今天 1024 下 12 页都不溢出，所以改壳后也必须如此，这条不是奢望。
Expected: 1024 档 `RESULT4` PASS。若 `card-design` 溢出，注意 `.cd-preview` 今天已带 `max-width:100%`（实测 `styles.css:1560`），所以别再加一遍同一条；真正要看的是 `.card-design-layout` 的 `220px 1fr 280px`（`:1480`）在容器 696 下有没有被 `.cd-editor`/`.cd-main` 里的不可断行内容撑破——按 Step 1 的换算，1024 视口下容器 = `1024-328 = 696 ≤ 836`，`:1487` 那条应已把它降成 `1fr` 单列；若仍是三列，说明阈值平移算错了，回 Step 1 复核而不是加 `overflow:hidden` 糊过去。若 `chat` 页在 1024 下三栏挤（内容 696 ≤ 800），`.chat-tools` 应自动隐藏而 `RESULT4` 仍 PASS——这正是 Step 1 里那条特例的验证点。

**实测（Task 3）**：1024 档 `RESULT4: PASS  4 12 页均无横向溢出  []`，1440 档同 PASS。Task 2 记下的 `card-design(+186px)` 是容器查询自己收掉的，**没有加 `overflow: hidden`，也没有再补一条 `.cd-preview{max-width:100%}`**（它本来就在）。
`1180 → 800` 那条特例按「量不是猜」的要求用一次性 Playwright 脚本量过（自带静态服务 + 外部请求全 abort + 按 `.verify-shell` 口径打桩 `Db`/`Supabase` + 把未登录遮罩 `#authMask` 手动 `.add("hidden")`；脚本在 `/f/tmp/task3/`，不入库）：

| 视口宽 | `.workspace` 容器内容宽 | `.chat-tools` computed `display` | `.chat-tools` 实测宽 | `.chat-main` 宽 | `.chat-wrap` 高（top/bottom） | `.card-design-layout` 的 `gridTemplateColumns` |
|---|---|---|---|---|---|---|
| 1440 | 1112 | `block`（**工具栏在**） | 232 | 662 | `792px`（28 / 820） | `220px 580px 280px`（3 轨） |
| 1024 | 696 | `none`（**退两栏**） | 0 | 492 | `792px`（28 / 820） | `696px`（1 轨） |

三个阈值算术全部当场对上：`696 ≤ 800` 隐藏、`1112 > 800` 保留（照抄 `-64` 会得到 1116，`1112 ≤ 1116` 就在 1440 上误隐藏）；`1036` 那条让 1440 留三列、`836` 那条让 1024 退一列（`696 ≤ 836`），于是 `RESULT4` 的 186px 归零；`.chat-main` 在 1440 得 662，与 Step 1 那段 `450 + 350 = 800` 的预测同值。两档 `overflowX` 都是 0、JS 错误 0、外部请求 8 次全拦截。
本轮动手前（HEAD `e266da9`，Step 1 还没跑）用**同一把尺子**量过一遍做对照：1440 档 `chatWrap = {top: 28, height: 732, bottom: 760}`、`chatToolsDisplay: 'block'`、`modal tracks: 2`；1024 档 `chatWrap` 同 732/760、`wsContentW: 696`、`CARD overflowX: 186`、`modal tracks: 2`。对照本轮同位置的 `792/820`、`tracks: 1`、`overflowX: 0` —— 三条变化各自对应 Step 1/3 的一处改动，`186` 是 Task 2 Step 5 记下的那条已知代价、不是本轮新引入的。（那是量测脚本，只打几何与 computed style，不含 `@container` 命中率的直接观测。）


- [x] **Step 6: 证明断言会变红**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py sidebar_w_zero no_sticky grid_one_col ws_container_gone page_id_gone ws_min_width sidebar_class_gone nav_dup chat_vh_old modal_container`
Expected: 10 行全部 `OK 变红`，exit 0。**故意不带 `narrow_no_degrade`**：此刻 RESULT9 还是红的（Task 4 没做），它会以 `INVALID` 报出来——那不是失败，是时序。
任一行 `BAD 没变红`、`SKIP` 或 `ANCHOR` 就是计划本身有问题（`ANCHOR` 有两种成因，别一律当成「该删的没删干净」：`nav_dup` 那类是旧顶栏没删净留下两份导航，`no_sticky` 那类是 Task 2 该**接手**的 `position: sticky;` 被写了第二处而旧处没删——两种都要回到 Task 2 的删除/新增那一步去收窄锚点），停下报告，不要继续。
（`SKIP` 的意思是锚点串在文件里找不到 —— 例如把 `.modal` 那条容器块漏写了，此时断言根本没东西可测，继续下去就是自欺。逐行核对缩进的 `证据` 与 `COLLATERAL`：目标那条的判定值要肉眼可读（`grid_one_col` 之后 RESULT2 应显示 `containerName` 仍然对得上、`x` 不等于 264；`ws_container_gone` 之后应显示 `containerName=none`），除目标外多出的红项要在 `COLLATERAL` 里点得名，说不清就怀疑变异串撞到了别处。到这一步 `nav_dup` 的锚点已经在 `.sidebar` 内，它会连带把 RESULT5 打红（`navInSidebar` 12→13），所以它下面那行 `COLLATERAL 相对基线新红 ['RESULT5', 'RESULT6']，目标只有 RESULT6` 是**预期**的（Task 4 Step 3 同）；RESULT5 自己的证明仍是 `sidebar_class_gone` 那一行。还有：如果基线那一次 `shell_check.py` 没把话说完（无 RESULT 判定行 / 无末行汇总 / 退出码非 0-1 / 超过 120s 没退出），驱动会在打印 `变异前基线红项` 之前就中止，一条变异都不写盘——那时先修 harness 或查环境，别去怀疑断言。）

**实测（Task 3，10 行全 `OK 变红`、exit 0、0 SKIP / 0 INVALID / 0 ANCHOR / 0 BAD）**：首行基线 `变异前基线红项：['RESULT9']`（与 Step 4 的 1 红一致 —— 本轮把 harness 改完之后才跑的这一步），末行 `全部断言已被证明会变红`。逐条 `证据`（判定值都能肉眼复核）：

| 变异 | 目标 | 证据里的判定值 | 新红集合 |
|---|---|---|---|
| `sidebar_w_zero` | RESULT1 | `{'x': 0, 'y': 0, 'w': 29, 'h': 900}` | `['RESULT1','RESULT2']` —— COLLATERAL 预期 |
| `no_sticky` | RESULT1 | `sidebarPos` 不再是 sticky（同 dict，`w: 264`） | 只有 RESULT1（+ 基线 RESULT9） |
| `grid_one_col` | RESULT2 | `{'x': 60, 'y': 900, 'w': 1320, 'h': 1174} containerName=ws` —— x≠264 而容器名仍对得上，正是本步要求的样子 | `['RESULT1','RESULT2']` —— COLLATERAL 预期 |
| `ws_container_gone` | RESULT2 | `{'x': 264, ...} containerName=none` | 只有 RESULT2 |
| `page_id_gone` | RESULT3 | `空页=['rules(-1)'] JS错误=[]` | 只有 RESULT3 |
| `ws_min_width` | RESULT4 | 12 页全部 `(+24px)` 溢出 | 只有 RESULT4 |
| `sidebar_class_gone` | RESULT5 | `实际 0` | `['RESULT1','RESULT5']` —— COLLATERAL 预期 |
| `nav_dup` | RESULT6 | `['chat(chat,chat)']`（`navInSidebar` 12→13 连带 RESULT5） | `['RESULT5','RESULT6']` —— COLLATERAL 预期 |
| `chat_vh_old` | RESULT7 | `chatBottom=760 期望 chatTop=28 + (vh=900 - padT=28 - padB=80) = 820 ±1` | 只有 RESULT7 |
| `modal_container` | RESULT8 | `{'maskW': 1440, 'display': 'grid', 'tracks': 2, ...}` —— 容器一摘，模态里那条单列规则不再生效，`tracks` 回到 2 | 只有 RESULT8 |

四对 COLLATERAL 与计划预告的名单逐字相同（`sidebar_w_zero`/`grid_one_col` → `['RESULT1','RESULT2']`，`sidebar_class_gone` → `['RESULT1','RESULT5']`，`nav_dup` → `['RESULT5','RESULT6']`），除此之外没有第五对，也没有任何一条撞到 RESULT7/RESULT8。
> 这是 Task 3 当时的记录，保留原话。**Task 4 之后的口径变了**：`grid_one_col` 现在连带打红 RESULT7（`a6e0979` 给 RESULT7 补的绝对上限 `bottom <= vh+1` 在单列 grid 下必然触发），另有 `ws_container_gone`/`ws_min_width` 连带 RESULT9（RESULT9 基线转绿后才数得进「相对基线新红」）。以 Task 4 Step 3 的实测段与 Task 6 Step 2 的名单为准。
`chat_vh_old` 这一行同时是 Step 4 那条恒等式的验收：**旧判定带在 vh=900 放行 `[814, 901]`，恒等式只放行 `820 ±1`**，760 两边都红，但带会放行 `calc(100vh - 114px)` 那种同族硬常量而恒等式不会。
还原复核（按字节）：跑前 `styles.css` `63912B / sha256 1a4ec610f18f9d66…`、`index.html` `12353B / sha256 473aba764cad2f6e…`；跑后两个哈希一字不变，另用 `cmp` 对 `/f/tmp/task3/` 里的快照比过一次相同；`git status --short` 只剩 ` M assets/css/styles.css`。


- [x] **Step 7a: Agent 全链路没被改坏（自动化那半）**

Run: `cd /f/Qoder/自媒体/.verify-agent && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" drive.py`
Expected: `RESULT-STREAM` + `RESULT1…RESULT11` 共 12 行全 PASS，exit 0。
**实测（Task 3）**：全绿 —— `RESULT-STREAM: PASS`、`RESULT1…RESULT11: PASS`、末行 `RESULT: PASS`、**exit 0**；`JS 错误(全程): (无)`；唯一噪声是 stderr 里 `mock_provider.py:86` 那段 `ConnectionAbortedError: [WinError 10053]` traceback，来自 RESULT5「停止生成」那一轮被客户端掐断，是驱动自己的既有行为、与 shell 无关（那一轮 `RESULT5: PASS`）。本轮动的是 CSS 断点与 `.chat-wrap` 高度，`assets/js/**` 一个字节没改，`chat` 页三栏在 1024 档退两栏（`.chat-tools` 隐藏）也没牵到工具面板：`RESULT7` 仍打 `面板工具: ['db_list','db_get','db_stats','skill_topic_schedule_gap']`。

- [ ] **Step 7b: 12 页人眼视觉验收（自动化代替不了）**

12 页人工翻一遍（对照 Easel 的比例感，实测可查的行：`web/frontend/src/styles/index.css:37` `--sidebar-width: 264px`、`:85-93` `.sidebar`、`:96` `.sidebar-header{padding:18px 16px 14px}`、`:136` `.sidebar-nav{padding:10px 8px;flex-direction:column;gap:2px}`、`:210` `.main-content`）。
Expected: 无页面出现横向滚动条；左栏 12 项指认不难、「`.nav-link.active::before` 那 3px 竖条不太弱」。
这条只能人工：自动化量的是几何与异常，量不出「左栏 12 项是否比原来更难指认」「那 3px 竖条是否太弱」。视觉判断不对就当场调 Task 2 Step 4 的 `.sidebar .nav-link` 内边距/`gap`，别把「看着不像 Easel」留成待办。
**自动化能替到的部分（不构成打勾）**：`RESULT4` 在 1440 与 1024 两档都 `PASS []`，即「无页面出现横向滚动条」这一半是量到的；后一半（指认难度、竖条强弱）没量也没人看，所以本步**保持未勾**，正式档期在 Task 6 Step 5。本轮新增的可见风险点是 `.chat-tools` 在 1024 档 `display: none`（工具栏整块消失，改壳前 1024 视口同样隐藏 —— 阈值 1180 视口 vs 800 容器在这一档结论相同），人眼要确认的是「退两栏后的助手页看起来是设计而不是坏了」。


- [x] **Step 8: Commit**

```bash
git add assets/css/styles.css
git commit -m "refactor(shell): 工作区断点改容器查询，chat 高度去硬编码"
```

**实测（Task 3）**：已按上头两条命令落库 —— `695b163 refactor(shell): 工作区断点改容器查询，chat 高度去硬编码`，`1 file changed, 24 insertions(+), 16 deletions(-)`（只 `assets/css/styles.css`：15 条查询各 ±1 行、`.chat-wrap` 高度 ±1 行、两处理由注释 +8 行；未 `git add -A`、未 `git add dist/`、未 `--amend`、未 `--no-verify`、**未 push**）。`index.html` 与 `assets/js/**` 本轮一个字节没动（`index.html` 跑前跑后同为 `12353B / sha256 473aba764cad2f6e…`）。本步文档改动（复选框、实测量、`shell_check.py` 围栏块同步）按同一口规单独一个 `docs(plan)` commit，不与代码混在一起。
给 Task 4 的交接量：本步跑完后 `grep -c "@media" assets/css/styles.css` = **0**、`@container ws (max-width: …)` = 15 条，你新增的那条 `.app-shell { display: block; }` 必须落在 `@media (max-width: 760px)`（视口查询，不是容器查询）里，`narrow_no_degrade` 的锚点才有宿主；`shell_check.py` 的 `RESULT9` 是当前唯一红项（`FAIL(1/9)`，两档都是），`chat_vh_old`/`modal_container` 两条变异本轮已各自证过（见 Step 6 表），你那一步跑全 11 条时基线红项应该是 `全绿`。

---

## Task 4: 窄屏降级（≤760px 回到顶栏形态）

**Files:**
- Modify: `workbench/assets/css/styles.css`（Task 3 后遗留的 `@media` 位置附近，新增一段）

**Interfaces:**
- Consumes: Task 2 的 `.app-shell/.sidebar/.nav-link` 结构
- Produces: 手机上退化成「横滑顶部导航」，等价于改壳前的观感；`shell_check.py` RESULT9 转绿

- [x] **Step 1: 加查询块**

```css
/* ── 窄屏：侧栏降级为顶部横滑导航（等价改壳前） ── */
@media (max-width: 760px) {
  .app-shell { display: block; }
  .sidebar {
    position: static;
    height: auto;
    gap: 10px;
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .sidebar .nav { flex-direction: row; gap: 4px; overflow-x: auto; }
  .sidebar .nav-link { padding: 8px 14px; white-space: nowrap; }
  .sidebar .nav-link.active::before { display: none; }
  .sidebar-foot { margin-top: 0; padding-top: 0; border-top: 0; }
  .workspace { padding: 20px 16px 60px; }
}
```

注意两点，都要写进 commit 说明或代码注释旁边：
1. `@media` 用视口宽度是对的 —— 这里退化的是整个壳（侧栏在不在），不是某一栏的内容宽度，所以不能用容器查询。
2. 降级段把 `.workspace` 内边距从 `32px` 改成 `16px`，于是窄屏下「容器阈值 ↔ 视口」的换算与桌面不同：桌面是 `内容 = 视口 - 264 - 64`，降级后是 `内容 = 视口 - 32`。同一容器阈值下，降级形态比桌面晚 32px 命中（`T-64` 对应视口 `T-32` 而不是 `T`）。这是既成事实的取舍，不是 bug：手机宽度下没人拿 32px 当尺子，但改数字时要意识到两档的尺子不一样长。
> 更正（Task 4 fix round 1，评审 Minor 4）：上一句的**基准标错了**。同一条容器阈值 `C`，三档形态的命中视口分别是：改壳前 `V = C + 64`（`.app-shell` 左右各 32px 内补）、桌面侧栏 `V = C + 328`（再加 `--sidebar-w 264`）、降级形态 `V = C + 32`。所以「晚 32px」只对**改壳前**成立（`C+64 → C+32`），对**桌面**是晚 **296px**（`C+328 → C+32`）。括号里 `T-64 对应视口 T-32 而不是 T` 算的确实是改壳前那一档，写法本身没错，错的是「比桌面」三个字。操作后果（两档的尺子不一样长、改数字要意识到）不受影响。commit `15ec01a` 的说明里带着这句旧措辞 —— 按房规不 amend，更正只落在计划与本条 blockquote。

**断点 760 从哪来（评审 Minor 3，2026-10-01 补）**：这一句必须写在这儿，因为 760 是计划直接给的、**原本没有推导** —— 全文搜不到它怎么来的，而改壳前 CSS 里的视口断点是 `980 / 900 / 768 / 720 / 640 / 560`，根本没有 760。现在给它两条硬约束与一次实测：
- 约束一：`< 1024`。Tauri 桌面包的 `minWidth: 1024`（`tauri.conf.json`），断点必须低于它，桌面包才不会莫名其妙进降级形态。
- 约束二：`≤ 824`。`824 = 496 + 264 + 64`，即 15 条容器规则里最窄的那条（`@container ws (max-width: 496px)`）在侧栏形态下收完的视口。断点若高于 824，就会有一段「降级已经生效、但容器规则还没收完」的重叠区，两套规则同时改同一批布局。
- 实测（控制器，2026-10-01，用当时的 harness 两档参数化宽度）：`shell_check.py 761` 与 `shell_check.py 800` 两档都是全绿 + `RESULT-OFFLINE: PASS` + exit 0；761 档 `.workspace` 的 border-box 宽 497、容器内容宽 433，已低于 496，即全部容器规则都落在最窄形态而无横向溢出。**所以 760 不是在遮掩一个坏掉的区间** —— 断点上方紧贴着的形态是好的。
- 如实记下没测到的：761..823 这一段「容器规则已全收完、但侧栏还在」只被测了 761 与 800 两个点，中间宽度无覆盖；这与 Task 3 遗留的那条 minor（四条更窄容器规则 576/496/656/704 在两档巡检里一次都没命中过）是同一个缺口，见 Task 6 Step 5 的人眼清单。

**实测（2026-10-01）**：上面 Files 行的「遗留视口查询位置附近」已过时 —— Task 3 收口后 `styles.css` 里视口查询计数为 **0**，没有遗留位置。按 controller ruling，降级段插在 `.modal` 容器块（原 `:207-210`）之后、`/* ── 卡片 ── */` 之前：被它覆盖的全部 shell 规则（`.sidebar*` 原 `:146-190`、`.workspace` 原 `:191-200`）都在文件更早处，且 `:210` 之后再无对 `.workspace`/`.sidebar`/`.sidebar .nav-link` 的重新声明，同特异度按源序降级段即胜出 —— 不加 `!important`、不放文件末尾。两点「注意」按房规写进了 commit `15ec01a` 的说明，而不是 CSS 注释（`@media` 计数门禁把注释文本也算进去）。写入门禁实测：视口查询计数 = **1**、容器查询分布不变合计 **15**（`576×4、836×3、916×2、496×2、656×1、704×1、800×1、1036×1`）、`narrow_no_degrade` 的锚点行全文件唯一（1 处，单行、逐字）；EOL 审计 `64939B / crlf 2259 / bare_lf 0`（编辑工具保 CRLF，全程未用 sed -i）。

- [x] **Step 2: 跑 harness（两档）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py 1024`
Expected: 两档都全部 9 条 PASS 且 `RESULT-OFFLINE: PASS`，末行 `RESULT: PASS`，exit 0。这是本计划的收口点，也是 `shell_mutate.py` 里 `no_sticky` 等变异从 INVALID 转成可证明的前提。编号全绿但 `RESULT-OFFLINE` 红时末行是 `RESULT: FAIL(0/9)`（分子只数编号断言，离线那条按 `RESULT-STREAM` 的房规单列、不进分母），所以这一步同时看 exit 码与那一行本身。

**实测（2026-10-01）**：1440 与 1024 两档均 9/9 PASS、`RESULT-OFFLINE: PASS  8 次外部请求被拦截，成功 0`、末行 `RESULT: PASS`、exit 0。`RESULT9` 转绿（两档同）：`display=block overflowX=0 错误=[]`。`RESULT7` 两档逐字等于预期：`chatBottom=820 期望 chatTop=28 + (vh=900 - padT=28 - padB=80) = 820 ±1，且 <= vh+1=901` —— 数字没动，降级段没有泄漏到桌面宽度。
> 更正（Task 4 fix round 1）：上面这句以及本步 Expected 里的「9 条」是当时那次运行的记录，保留原话。fix round 1 之后编号断言是 **10 条**（新增 `RESULT10` 量窄屏 chat 竖向装不装得下），Expected 应读作「两档全部 10 条 PASS」，`FAIL(0/9)` 读作 `FAIL(0/10)`；分母由 `len(RESULTS)` 自己算，加一条自动变 10，没有人手改过它。新实测见本任务末尾的 fix round 1 小节。

- [x] **Step 3: 跑全量变异，把 9 条断言（11 个变异）一次证明干净**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py`
Expected: 11 行全部 `OK 变红`（`RESULT1` 由 `sidebar_w_zero` 与 `no_sticky` 各证一次、`RESULT2` 由 `grid_one_col` 与 `ws_container_gone` 各证一次），末行 `全部断言已被证明会变红`，exit 0。基线红项那行应打印 `全绿`——若还列出任何 `RESULTn`，说明 Step 2 的绿是假的。这一行现在**只有 `shell_check.py` 把话说完才会被打**（stdout 无 RESULT 判定行 / 无末行 `RESULT:` 汇总 / 退出码非 0-1 / 超过 `CHECK_TIMEOUT = 120s` 未退出 → 驱动直接中止并带上 returncode 与 stderr 摘录），改前它是「子进程一个字没输出」也会打印的假绿句子。但这句话能撑到的范围要说准：它证明的是**那次子进程跑到了底**（至少有 1 条 `RESULT<数字>` 判定行、有末行汇总、退出码 0/1、没超时），不是**9 条编号断言与离线行都齐**——条数由 `shell_check.py` 自己那本账管，驱动故意不数（钉两个 9 就成两处账，第一次不同步会表现为整轮中止而不是诚实报告）。所以 Step 3 的「9 条齐全」仍靠人看那份逐行输出核，`全绿` 只是排掉了「压根没量」这条路。
（`sidebar_w_zero` 会让 RESULT1 与 RESULT2 同时变红：侧栏宽 0 → 工作区 x=0。这不影响判定，目标 RESULT1 红即算证明，但驱动会在它下面打一行 `COLLATERAL 相对基线新红 ['RESULT1', 'RESULT2']，目标只有 RESULT1` —— 那行现在是自动的，不用靠人盯 `实际` 列。`nav_dup` **不在**这一列里，且这是设计好的：Task 2 之后它的锚点在 `.sidebar` 内，复制一份会把 `navInSidebar` 推到 13，所以它这一行的预期输出是 `OK 变红` 下面紧跟 `COLLATERAL 相对基线新红 ['RESULT5', 'RESULT6']，目标只有 RESULT6`——RESULT5 的共现红是**预期**、不是缺陷（RESULT5 由 `sidebar_class_gone` 负责证明，`nav_dup` 只是第二次压上它的计数半边）。单一断言被单一变异打红这件事，只有 `no_sticky`、`page_id_gone`、`ws_container_gone` 等几条成立。）

**Task 2 实测补记（照此认账，别在 Task 4/6 重新发现一遍）**：那 8 条变异里还有两对共现——`grid_one_col` 打红 `['RESULT1', 'RESULT2']`、`sidebar_class_gone` 打红 `['RESULT1', 'RESULT5']`。成因与上面两条同类：锚点动的是 `.app-shell` 的列轨与 `.sidebar` 这个类本身，而 RESULT1 量的正是这两件事，所以 RESULT1 跟着红是结构必然，不是串撞错了对象。撞错对象长得不一样：那会是 `BAD 没变红`（目标没红、红的名字点不出因果）或 `INVALID`（目标在变异前就红）。Task 4 Step 3 跑全 11 条时，这四对 COLLATERAL 一起出现才是对的。
> 更正（Task 4 实测之后）：上一句在 Task 4 已不成立 —— 全 11 条跑出来的共现是 **6 条**（`grid_one_col` 变三红、`ws_container_gone`/`ws_min_width` 各多一条 RESULT9），名单与成因见下面 Task 4 的实测段。本段是 Task 2 那次 8 条变异（RESULT9 还恒红）的记录，保留原话。

**实测（2026-10-01，全 11 条）**：首行 `变异前基线红项：全绿`，11 行全部 `OK 变红`，末行 `全部断言已被证明会变红`，exit 0；0 SKIP、0 INVALID、0 ANCHOR、无还原失败。`RESULT1` 由 `sidebar_w_zero` 与 `no_sticky` 各证一次、`RESULT2` 由 `grid_one_col` 与 `ws_container_gone` 各证一次。四对预告 COLLATERAL 中三对逐字符合：`sidebar_w_zero → ['RESULT1', 'RESULT2']`、`sidebar_class_gone → ['RESULT1', 'RESULT5']`、`nav_dup → ['RESULT5', 'RESULT6']`；`grid_one_col` 实测为 `['RESULT1', 'RESULT2', 'RESULT7']`，比 Task 3 那份记录多出 RESULT7。**已用对照实验证明与本任务降级段无关**：把降级段整段临时移除（字节还原到写前状态，`git hash-object` 前后同为 `07d4ee7f…`），单跑 `grid_one_col`，collateral 仍是 `['RESULT1', 'RESULT2', 'RESULT7']`（基线红项此时为 `['RESULT9']`，故 RESULT9 不进新红名单）。成因是 `a6e0979` 给 RESULT7 补的绝对上限 `bottom <= vh + 1`：单列 grid 把工作区推到 y=900，chatBottom≈1720 必然超上限，而算术恒等式半边仍成立 —— Task 3 的「没有撞到 RESULT7」名单是旧版 RESULT7（无上限）下录的，此后认账以三红为准，这是 harness 演进后的结构必然，不是锚点撞错。另两条本轮才可见的 COLLATERAL：`ws_container_gone → ['RESULT2', 'RESULT9']`、`ws_min_width → ['RESULT4', 'RESULT9']` —— RESULT9 基线转绿后「相对基线新红」才数得进它（Task 4 之前 RESULT9 恒红，永远进不了新红名单），两条的成因都是工作区宽度被破坏后 390 窄屏跟着溢出/容器查询失配，同属结构必然。
> 更正（Task 4 fix round 1）：本步标题里的「9 条断言（11 个变异）」与上面这份实测是当时那轮的记录，保留原话。fix round 1 之后是 **10 条断言 / 13 个变异**（新增 `nav_h_gone` 与 `chat_rail_tall`，两条都指向 `RESULT10` —— 前者证两半、后者只证前半），共现名单从 6 条变 **7 条**（`chat_vh_old` 多打红 `RESULT10`），逐字实测见本任务末尾的 fix round 1 小节与 Task 6 Step 2 的白名单。另：`sidebar_class_gone` 那一轮**曾经整轮中止**（第一版 `NARROW_CHAT` 探针直接 `.sidebar.getBoundingClientRect()`，类被摘掉时抛 TypeError 把子进程打挂，驱动按「没走完 main()」中止）—— 那是本轮新加断言引入的缺陷，已修（探针改为对缺 `.sidebar` 保持哑、`RESULT10` 只把 `sidebarH` 当解释量），修后 13 条全绿。另：`sidebar_class_gone` 那一轮**曾经整轮中止**（第一版 `NARROW_CHAT` 探针直接 `.sidebar.getBoundingClientRect()`，类被摘掉时抛 TypeError 把子进程打挂，驱动按「没走完 main()」中止）—— 那是本轮新加断言引入的缺陷，已修（探针改为对缺 `.sidebar` 保持哑、`RESULT10` 只把 `sidebarH` 当解释量），修后 12 条全绿。


- [x] **Step 4: Commit**

```bash
git add assets/css/styles.css
git commit -m "feat(shell): 窄屏侧栏降级为顶部横滑导航"
```

**实测（2026-10-01）**：commit `15ec01a`（仅 `assets/css/styles.css`，1 file changed, 18 insertions），两点「注意」与 grid_one_col 三红的附注均写入 commit 说明；提交后 `git status --short` 为空。

#### Task 4 fix round 1（2026-10-01）：窄屏 chat 页竖向装不下

**触发**：Task 4 评审 spec ✅ / quality Approved，Critical 0、Important 1、Minor 4。Important 的内容是 —— 降级段那句「等价改壳前的观感」不成立：chat 页在窄屏**竖向**溢出，而 harness 对此全盲（`RESULT9` 只量 dashboard 的**横向**）。评审给的处方是「在降级段覆盖 `--ws-pad-t/--ws-pad-b`」加「另想办法减掉顶栏高度」，或记为已知代价。

**先坐实，再定位（scratch 探针 `F:/tmp/task3/nav_h_probe.py`，未动仓库 harness）**：390×780 → `sidebarH=111 chatTop=131 chatH=672 chatBottom=803 scrollH=863 overflowY=83`；W∈{280,320,360,390,414,480,560,640,720,760} × H∈{640,780} 十八档里 `sidebarH` 恒为 111、`overflowY` 恒为 83。两条根因叠加：

1. 降级段只写了字面 `padding: 20px 16px 60px`，没同步 `.chat-wrap` 高度算式真正读的那两个 token —— 它们仍停在 `:root` 的 28/80，于是 `chatH = vh − 108 = 672`（按降级内补本该是 `vh − 80 = 700`）。
2. **没有任何一项减掉叠上来的 111px 顶部导航**。改壳前那条 `calc(100vh - 168px)` 常量把顶栏高度折在里面；Task 3 把常量换成 token 时，这层折叠丢了。

溢出量 = `111 − 28 = 83`，与实测逐字相符 —— 这解释了为什么它在十档宽度下是同一个数。

**采纳发现，不采纳处方**：`Task 4: Ruling: 采纳这条 Important 的**发现**，不采纳它的**处方**`（全文在账本）。处方单独执行的后果是可证的，不是推测的：第 12 条变异 `nav_h_gone` 就是把 `--nav-h: 111px` 改回 `0px` 而保留降级内补 token，即「只覆盖 token」那一半 —— 实测 `chatH 672→700`、`overflowY 83→111`，**更坏**。所以修法是两半一起做：

- `:root` 新增 `--nav-h: 0px`（桌面侧栏在工作区左边，不占竖向）。
- 降级段内 `.workspace` 同时改三个 token：`--nav-h: 111px`、`--ws-pad-t: 20px`、`--ws-pad-b: 60px`，字面 padding 改读这三个 token。
- `.chat-wrap` 基规则改为 `height: calc(100vh - var(--nav-h) - var(--ws-pad-t) - var(--ws-pad-b))`。

**为什么不在降级段里再写一条 `.chat-wrap` 覆盖**：同特异度按源序，基规则在文件后部（约 `:2072`）会赢过降级段（约 `:212`），写了是死的。把「侧栏在不在顶部」这件事收敛成一个 token，是为了让降级段不必和文件后部的规则抢源序。

**把性质升成门禁**（本计划第二处「实现任务改门禁」，与 Task 3 改 RESULT7 同类）：新增 `RESULT10 窄屏 chat 页竖向装进视口（降级段减掉顶部导航高度）`，判据两半全部现量、除 ±1 容差不含任何常量 —— `document.documentElement.scrollHeight - innerHeight <= 0`（别的元素也别溢出）**且** `chat-wrap.bottom + workspace.paddingBottom <= innerHeight + 1`（chat 的高度算式确实减掉了顶栏）。两半**不是对称的**，这点必须先量再说：后半红必然连带前半红（chat 溢出就是文档溢出），前半红却可以只有前半红 —— 所以前半不是后半的重复，它管的是「chat 之外还有谁把文档撑高」。我第一版在这里写过「两半各自能单独红」，那是没验就下的话；用 `chat_rail_tall`（把 `.chat-rail` 撑到 900px，它越出定高的 `.chat-wrap` 却不改 `.chat-wrap` 自己的 rect → `chatBottom=720` 仍绿、`scrollH=1031`）实测到「只有前半红」之后才敢这么说。加这条而不是只修 CSS 的理由：今天没有任何断言覆盖它，我是靠临时探针才发现的；只修不加断言，下次谁动降级段的 padding 就静默重演 83px。

**实测（fix round 1，2026-10-01）—— 两档 harness**：`shell_check.py`（1440）与 `shell_check.py 1024` 均 exit 0，10/10 编号断言 PASS + `RESULT-OFFLINE: PASS  8 次外部请求被拦截，成功 0`，末行 `RESULT: PASS`。两档逐字相同的两条：

```
RESULT7: PASS  7 chat 高度 = 工作区可用高度（算术恒等式）  chatBottom=820 期望 chatTop=28 + (vh=900 - padT=28 - padB=80) = 820 ±1，且 <= vh+1=901
RESULT10: PASS  10 窄屏 chat 页竖向装进视口（降级段减掉顶部导航高度）  sidebarH=111 chatH=589 chatBottom=720 + padB=60 <= vh+1=781 scrollH=780 overflowY=0
```

`RESULT7` 的数字与 Task 3/4 逐字相同（`chatBottom=820`，`--nav-h` 在桌面是 0，所以恒等式没被窄屏那条改动污染），说明降级专属的 token 泄漏不到桌面宽度。`chatH=589` 是 `780 − 111 − 20 − 60 = 589`，且 ≥ `min-height: 520` 的地板。

**实测（fix round 1）—— 全 13 条变异**：exit 0，首行 `变异前基线红项：全绿`，13 行全 `OK 变红`，末行 `全部断言已被证明会变红`；0 SKIP / 0 INVALID / 0 ANCHOR / 0 BAD，跑完 `git status --short` 为空（按字节还原成立）。与 RESULT10 相关的三行逐字：

```
chat_vh_old: OK 变红  期望 RESULT7 红，实际 ['RESULT7', 'RESULT10']
nav_h_gone: OK 变红  期望 RESULT10 红，实际 ['RESULT10']
        证据 RESULT10: FAIL  10 窄屏 chat 页竖向装进视口（降级段减掉顶部导航高度）  sidebarH=111 chatH=700 chatBottom=831 + padB=60 <= vh+1=781 scrollH=891 overflowY=111
chat_rail_tall: OK 变红  期望 RESULT10 红，实际 ['RESULT10']
        证据 RESULT10: FAIL  10 窄屏 chat 页竖向装进视口（降级段减掉顶部导航高度）  sidebarH=111 chatH=589 chatBottom=720 + padB=60 <= vh+1=781 scrollH=1031 overflowY=251
```

`nav_h_gone` 是 `RESULT10` 后半（连带前半）的证据，也是 `--nav-h` 这个实测常量漂了之后唯一会响的警报；`chat_rail_tall` 单独证前半，两行放在一起就是「两半分工不同」这件事的证据，而不是我的断言。`chat_vh_old` 的锚点被重新指到新的基表达式上，因此它现在同时打红 RESULT7 与 RESULT10 —— 共现名单从 6 条变 **7 条**，白名单与成因见 Task 6 Step 2。

**两处本轮控制器自己的错，记在这里因为它们是证据的一部分**：
1. 第一版 `NARROW_CHAT` 探针直接 `.sidebar.getBoundingClientRect()`，`sidebar_class_gone` 变异摘掉该类时抛 `TypeError`，子进程没有末行 `RESULT:` 汇总 → 驱动按「这一轮一条都没量到」中止整轮（`shell_mutate.py` 里 `abort()` + `run()` 的那条一票否决：无 RESULT 判定行 / 无末行汇总 / 退出码非 0-1 / 超时，四条同权重）。这是本轮新增断言引入的缺陷，不是驱动的误判；探针改成对缺 `.sidebar` 保持哑、`sidebarH` 只当解释量后才跑通。**附注**：我先前把实现方加的保护判成「越权改动」并回退过一次 —— 判错了，那是对我方缺陷探针的正当规避。
2. 我在读盘之前先「记得」`shell_check.py` 的内容（声称有 13 条编号断言与三条读不存在探针键的 RESULT），并在那份幻觉状态上推理了一轮。逐字节 diff 证伪。此后本计划里所有 harness 事实一律来自当轮实跑输出。

**登记的代价与裁定**：`vh < 711`（= 520 地板 + 111 导航 + 20 + 60）时 520 起跳、窄屏 chat 重新出现竖向滚动 —— 与改壳前同类（390×640：`640 − 168 = 472 < 520`），`min-height: 520px` 因此**不动**，代价写进 Task 6 Step 5 人眼清单。`.sidebar-foot { margin-top: 0 }` 是评审证明的死声明（基值 `auto` 在 `height: auto` 的列 flex 里本就解析为 0），**保留不删**（brief 逐字且自解释）。断点 760 不改数字，改为补上推导与两条硬约束（见 Task 4 Step 1 的补记）。`15ec01a` 的 commit 说明里那句「降级形态比桌面晚 32px 命中」基准标错（对桌面是晚 **296px**；32px 只对改壳前的 `V = T` 成立），按房规不 amend，更正落在本计划与账本。

**本轮改的计数与没改的计数**：前瞻性文本全部按新口径改过 —— 文件结构表（10 条断言 / 13 个变异）、Task 6 Step 1（10 条 + `FAIL(0/10)`）、Step 2（13 行 + 7 条共现白名单，新增 `chat_vh_old → ['RESULT10','RESULT7']` 那行，并更正那条「Step 2 期望看到 `RESULT-OFFLINE: PASS`」的假文本）。历史段与已消费的交接段**不回改**（Task 1 的改壳前基线、Task 3 实测段那句「9 条编号断言与 FAIL(n/9) 分母没动」、Task 3 给 Task 4 的交接段「跑全 11 条」），它们记录的是当时的运行，按 Task 3 立下的「逐字一致」口径只认编号/红项集合/末行/exit；集中更正落在 Task 4 Step 2/3 后面的两条 `> 更正（Task 4 fix round 1）` 与本小节。

---

## Task 5: 线上可用性与桌面包收口

**Files:**
- Create: `F:\Qoder\自媒体\.verify-shell\cors_check.py`
- Modify: `workbench/assets/js/settings.js:264-267`（`#aiProxyNoteWrap` 那段代理模式说明，实测它只在 `s.mode === "proxy"` 时显示，正是该提醒的地方）

**Interfaces:**
- Consumes: `ai-gateway.js:466-470`（`requireDirect()` 的报错文案）、`chat.js:296`（`" · 代理模式不支持工具，请切直连"`）
- Produces: 一条可复跑的线上前置检查；不新增后端

- [x] **Step 1: 把 CORS 结论落成可复跑脚本**

`F:\Qoder\自媒体\.verify-shell\cors_check.py`：

```python
"""线上版能否直连跑 Agent —— 只看浏览器 preflight 是否放行。无需 API Key。"""
import json
import subprocess

ORIGIN = "https://workbench.shuncheng.xin"
URLS = {
    "deepseek": "https://api.deepseek.com/chat/completions",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "moonshot": "https://api.moonshot.cn/v1/chat/completions",
}

for name, url in URLS.items():
    out = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-D", "-", "-m", "20", "-X", "OPTIONS", url,
         "-H", f"Origin: {ORIGIN}", "-H", "Access-Control-Request-Method: POST",
         "-H", "Access-Control-Request-Headers: authorization,content-type"],
        capture_output=True, text=True).stdout.lower().replace("\r", "")
    h = dict(l.split(": ", 1) for l in out.splitlines() if ": " in l)
    ok = (h.get("access-control-allow-origin") == ORIGIN
          and "post" in h.get("access-control-allow-methods", "")
          and "authorization" in h.get("access-control-allow-headers", ""))
    print(f"{name}: {'PASS' if ok else 'FAIL'}  {json.dumps({k: v for k, v in h.items() if k.startswith('access-control')}, ensure_ascii=False)}")
```

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" cors_check.py`
实测（2026-09-30 复跑，脚本即上面这段，逐字输出）：

```
deepseek: PASS  {"access-control-allow-credentials": "true", "access-control-allow-methods": "post", "access-control-allow-headers": "authorization,content-type", "access-control-allow-origin": "https://workbench.shuncheng.xin"}
zhipu: PASS  {"access-control-allow-origin": "https://workbench.shuncheng.xin", "access-control-allow-methods": "post", "access-control-allow-headers": "authorization, content-type", "access-control-allow-credentials": "true", "access-control-max-age": "3600"}
moonshot: PASS  {"access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "post", "access-control-allow-origin": "https://workbench.shuncheng.xin"}
```

exit=0（脚本不置退出码，靠三行 `PASS` 判定；要接 CI 就自己 `raise SystemExit`）。注意 zhipu 的 `allow-headers` 带空格（`authorization, content-type`），所以判定用的是 `in`，不是相等。

**复跑（2026-10-01，Task 5 执行时，逐字与上面那段 2026-09-30 的实测相同）**：三行全 `PASS`、exit=0，`deepseek` / `zhipu` / `moonshot` 各自回显 `access-control-allow-origin: https://workbench.shuncheng.xin`、`allow-methods` 含 `post`、`allow-headers` 含 `authorization`。磁盘上的 `F:\Qoder\自媒体\.verify-shell\cors_check.py`（1197B）与本步围栏块逐字节相同（`sync_blocks.py` 的 `块#24 ... EOL归一后相同: True`）—— 也就是说这一步没有新产物，它做的是「把 2026-09-30 那次结论续到今天」，Step 2 那句要写进用户界面的文案就靠这条撑着。

这条实测支持的结论：**线上版 Agent 走直连即可，不需要给代理补 `tools` 透传。** 若某家日后变 FAIL，才回到「给 `api/ai/` 加一个转发 `messages/tools/tool_calls` 的 agent 路由」这条备选路（约需新增 1 个 api 文件 + 流式 `delta.tool_calls` 拼接，工作量参考 `ai-gateway.js:521-535`）。

两个不能从这条实测里多读出来的东西，写清楚免得日后被当依据：
- preflight 放行只证明浏览器**允许发这个请求**，不证明带上真实 Key 后的 `POST` 一定成功（那要 Key 才能验，用户没有 Key，本计划不声称验过）。
- `Origin` 用的是 `https://workbench.shuncheng.xin`。三家都回显来源（等于 `*` 的宽松策略），换域名不会变 FAIL；但如果哪家改成白名单，脚本会立刻红，这是它继续存在的意义。


- [x] **Step 2: 文案对齐实测结论**

`settings.js:266` 那行 `<strong>ℹ 代理模式说明</strong>…密钥不会泄露。` 之后、`</div>`（`:267`）之前插入一句（口径与 `chat.js:296` 的 `" · 代理模式不支持工具，请切直连"` 一致，颜色类沿用同文件已在用的 `text-xs muted-2`）：

```html
<br /><span class="text-xs muted-2">助手页在代理模式下不可用：代理路由不透传工具调用。要用助手就切「直连模式」并填你自己的 Key——线上版三家模型均已验证支持浏览器跨域调用。</span>
```

Run（确认插入没破坏模板字符串闭合，`settings.js` 这段本身在反引号模板里）：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && node --check assets/js/settings.js && grep -c "助手页在代理模式下不可用" assets/js/settings.js
```
Expected: `node --check` 无输出（语法通过），计数 `1`。再跑 `shell_check.py` 的 RESULT3（`JS错误=[]`）确认渲染设置页没有 pageerror。

**实测（2026-10-01）**：`node --check assets/js/settings.js` 无输出、exit 0；`grep -c "助手页在代理模式下不可用"` = **1**；`shell_check.py`（1440 档）`RESULT3: PASS  3 12 页均有内容且无未捕获异常  空页=[] JS错误=[]`，末行 `RESULT: PASS`、exit 0（顺带 10/10 全绿，这条文案改动没有牵连布局）。`settings.js` 改后 25679B / 629 行 / **100% LF、裸 CRLF 0** —— 该文件本来就是 LF，编辑工具保持了原样。

落点比 brief 写的 `:264-267` 早一行：插入位置实测在 `:265`（`<strong>ℹ 代理模式说明</strong>…密钥不会泄露。`）与 `:266`（`</div>`）之间；按名字认账（`id="aiProxyNoteWrap"` 那个 callout），别按裸行号。

**这条文案到底出不出现，`RESULT3` 量不出来**（它只看页面非空 + 无异常），所以补了一次性探针 `F:/tmp/task4fix/proxy_note_probe.py`（复用 `shell_check.py` 的 `serve()`/桩/离线 route，不动仓库 harness），走**真实 change 事件**而不是直接改 style：

```
默认状态: {'hasWrap': True, 'mode': 'direct', 'hasText': True, 'wrapDisplay': 'none', 'spanVisible': False, 'spanClass': 'text-xs muted-2', 'spanColor': 'rgb(110, 137, 163)', 'spanSize': '12px'}
切 proxy 后: {'hasWrap': True, 'mode': 'proxy', 'hasText': True, 'wrapDisplay': '', 'spanVisible': True, ...}
切回 direct 后: {'hasWrap': True, 'mode': 'direct', 'hasText': True, 'wrapDisplay': 'none', 'spanVisible': False, ...}
JS错误: []   PROBE RESULT: PASS   exit 0
```

两点值得记：(1) 新 `<span>` 是 `#aiProxyNoteWrap` 的**子节点**，所以它的显隐由 `toggleAiModeHint()`（`settings.js:377-384`，读 `input[name="aiMode"]:checked`）整块接管 —— 直连模式下必然看不到，这是设计而不是漏；(2) `text-xs muted-2` 不是新造类，computed 出来 `rgb(110, 137, 163)` / `12px`，`muted-2` 在 `settings.js` 里已有 4 处用法、`styles.css` 里定义 1 处。

- [x] **Step 3: 密钥边界写清楚（这是安全结论，不是可选说明）**

直连模式下 API Key 存在浏览器 localStorage（`ai-gateway.js:10` 的 `workbench-ai-settings-v2`），意味着：
- 公开部署的站点上，用户填的是**自己的** Key，浏览器直接拿它请求 provider —— 单机自用可接受；
- 但绝不能把任何真实 Key 写进仓库、`WorkbenchConfig` 默认值或 `dist/`。`git log` 里 `9253160`（内置共享 Supabase 凭据）已经说明这条线很容易被踩过。

Run（**只打印数量，绝不回显命中内容**——`grep` 不加 `-o` 会把整串 Key 打到屏幕上）：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && grep -rniE "sk-[a-z0-9]{16,}|api[_-]?key[[:space:]]*[:=][[:space:]]*['\"][^'\"]{20,}" index.html assets/js/ | wc -l
```
实测（2026-09-30）：`0`。非 0 就停下报告，不要把匹配行贴进任何文档或 commit 信息。

复跑（2026-10-01，Task 5）：同一条命令（带 `| wc -l`，只打印数量）= **0**。这条扫描的存在理由就是它的输出形态 —— `grep` 不加 `-o`/不带管道会把命中的整串 Key 打上屏幕，于是「查密钥」这个动作本身变成一次泄漏；所以命令模板里那个 `| wc -l` 是判据的一部分，不是排版。**新增文案与这条扫描的关系**：Step 2 那句只写「切直连并填你自己的 Key」，不含任何 Key 值，所以命中数仍是 0；核对 `cd17774` 用的是 `git show --stat` 加同一条带 `| wc -l` 的扫描，而不是把 diff 贴进文档或 commit 信息。

- [x] **Step 4: 桌面包收口（实测到的缺陷就在这）**

Run: `cd "/f/Qoder/自媒体/自媒体工作台/workbench" && npm run tauri:sync && printf "dist_scripts=%s\ndist_jsfiles=%s\nmissing=%s\n" "$(grep -c '<script src' dist/index.html)" "$(ls dist/assets/js | wc -l)" "$(comm -23 <(ls assets/js | sort) <(ls dist/assets/js | sort) | tr '\n' ' ')"`
实测同步前（2026-09-30）：`src_scripts=25`、`dist_scripts=22`、`src_jsfiles=22`、`dist_jsfiles=19`、`dist_missing=agent.js chat.js platforms.js`（反向差为空，即 dist 里没有已删除的死文件）。
Expected（同步后）：`dist_scripts=25`、`dist_jsfiles=22`、`missing=`（空）。`tauri:sync` 就是 `node sync-dist.js`，`tauri:build` 会先跑它，所以只有**手动** `tauri build` 会打出没有助手页的桌面包——这一步是把那条陷阱关掉。
注意 `dist/` 被 `.gitignore:15` 忽略（实测 `git check-ignore -v dist/index.html` 命中该规则），所以 **不要 `git add dist`**，桌面包的正确性靠构建前必跑 `tauri:sync` 保证。

**实测（2026-10-01，Task 5 执行）**：同一条 `printf` 口径，同步前逐字复现 2026-09-30 那个缺陷 ——

```
PRE  src_scripts=25 dist_scripts=22 src_jsfiles=22 dist_jsfiles=19 missing=[agent.js chat.js platforms.js ]
PRE  reverse_missing=[]
```

`npm run tauri:sync`（= `node sync-dist.js`，输出 `[ok] 文件: index.html` / `[ok] 目录: assets/` / `✓ 前端资源已同步到 dist/ (dist)`，exit 0）之后：

```
POST src_scripts=25 dist_scripts=25 src_jsfiles=22 dist_jsfiles=22 missing=[]
```

三条 Expected 全中。`git check-ignore -v dist/index.html` 仍命中 `.gitignore:15:dist/`，`git status --short` 里没有 `dist/` 任何一行 —— **本步没有产物要提交**，桌面版的正确性是「构建前必跑 sync」这条纪律，不是一个 commit。
另外三条 `cmp`/计数（因为「dist 里有 22 个 js」并不等于「dist 里的是当前版本」）：`cmp -s index.html dist/index.html` 相同、`cmp -s assets/css/styles.css dist/assets/css/styles.css` 相同（Task 2/3/4 的壳改动确实进了桌面包）、`grep -c "助手页在代理模式下不可用" dist/assets/js/settings.js` = 1（Step 2 那句也进去了）。

- [x] **Step 5: Commit**

```bash
git add assets/js/settings.js
git commit -m "docs(settings): 代理模式下说明助手页需直连"
```


（若仓库不跟踪 `dist/`，去掉 `dist`，改为确认 `.gitignore` 覆盖它并在 commit 信息里说明。）

**实测（2026-10-01）**：commit `cd17774 docs(settings)`，`1 file changed, 1 insertion(+)`，只有 `assets/js/settings.js`（无 `dist`，按上面那条括号的分支处理 —— 实测 `git check-ignore -v dist/index.html` 命中 `.gitignore:15`，commit 说明里已写明这条纪律与 `cors_check.py` 的出处边界）。提交后 `git status --short` 为空。
两件顺带记下的事：(1) `git` 在 add 时警告 `in the working copy of 'assets/js/settings.js', LF will be replaced by CRLF the next time Git touches it` —— 该文件在盘上是 100% LF（628 行、0 CRLF，改前改后都一样），这是仓库既有的 `core.autocrlf` 行为、不是本次引入；不要为此改 git 配置（房规）。(2) Task 5 全程**只新增了一句面向用户的文案**：`agent.js`/`ai-gateway.js`/`chat.js` 未动，没有新后端，`api/ai/*` 的透传缺口按附录 B 保持不动。

---

## Task 6: 端到端总验收

- [ ] **Step 1:** `shell_check.py` 与 `shell_check.py 1024` → 两档都 `RESULT: PASS` 且 `RESULT-OFFLINE: PASS`，exit 0（10 条编号断言；离线行红时末行是 `RESULT: FAIL(0/10)`——分子只数编号断言，离线那条按 `RESULT-STREAM` 的房规单列、不进分母 —— 所以这一档要同时看 exit 码和那行本身，以 exit 码为准）
- [ ] **Step 2:** `shell_mutate.py`（不带参数，跑全部 **13** 个变异）→ 首行基线红项打印 `全绿`（这一行被打出来 = harness 把话说完了；空跑/挂死时驱动会先中止），13 行 `OK 变红`（每行下面带 `证据`），末行 `全部断言已被证明会变红`，exit 0。
  **RESULT10 有两条变异**，因为它的判据是两半（`chat_rail_tall` 只红前半、`nav_h_gone` 两半同红）。一条断言由两条变异各自证到并非新例 —— `RESULT1`（`sidebar_w_zero`/`no_sticky`）与 `RESULT2`（`grid_one_col`/`ws_container_gone`）本来就是这样，含义都是「这条性质可以从不同部位被破坏」。
  离线门在这个驱动里只在红的时候说话：`shell_mutate.py` 的 `run()`（现约 `:127-129`，`if re.search(r"^RESULT-OFFLINE: FAIL", out, re.M)` 那一支）是「看到 OFFLINE 红就 `SystemExit` 并打出整段 stdout」，绿路径不打印那一行，所以本步的正确期望是「输出里没有 OFFLINE 行且首行是 `全绿`」，不是「有一行 `RESULT-OFFLINE: PASS`」——去找一行永远不会出现的文本，要么误判成 harness 坏了，要么把「没看到」当通过。Task 1 写这条时按 harness 的口径抄了过来，抄错了对象，2026-10-01 读码更正。
  **`COLLATERAL` 白名单（Task 4 fix round 1 后全 13 条实测，控制器 2026-10-01 复跑逐字相同）—— 7 条共现全是预期的，少一条或多一条都要停下来查**：
  | 变异 | 目标 | 实测新红集合 | 成因 |
  |---|---|---|---|
  | `sidebar_w_zero` | RESULT1 | `['RESULT1','RESULT2']` | 侧栏宽 0 → 工作区 x=0，RESULT2 量的正是 x=264 |
  | `grid_one_col` | RESULT2 | `['RESULT1','RESULT2','RESULT7']` | 单列 grid 把工作区推到 y=900 → RESULT1 的吸顶/几何红；chatBottom≈1720 超 RESULT7 的 `bottom <= vh+1` 上限（恒等式那半仍成立，是上限那半在咬） |
  | `ws_container_gone` | RESULT2 | `['RESULT2','RESULT9']` | 摘掉 `container-name` → 390 窄屏那档的容器查询失配，RESULT9 跟着红（RESULT9 基线转绿后才数得进「相对基线新红」） |
  | `ws_min_width` | RESULT4 | `['RESULT4','RESULT9']` | `min-width: 0` 换成 1200px → 12 页各 `+24px`，390 档同样溢出 |
  | `sidebar_class_gone` | RESULT5 | `['RESULT1','RESULT5']` | 去掉 `.sidebar` 类本身，而 RESULT1 量的就是它 |
  | `nav_dup` | RESULT6 | `['RESULT5','RESULT6']` | 复制出的那份导航在 `.sidebar` 内 → `navInSidebar` 12→13 |
  | `chat_vh_old` | RESULT7 | `['RESULT10','RESULT7']` | fix round 1 新增：锚点现在换的是 `height: calc(100vh - var(--nav-h) - …)` 那条**基规则**，退回 168px 常量的同时把窄屏该减的导航减项一起摘了 → RESULT10 同红。集合按编号前导整数排序打印，所以是 `RESULT10` 在 `RESULT7` 前面 |
  其余 6 条（`no_sticky`/`page_id_gone`/`modal_container`/`narrow_no_degrade`/`nav_h_gone`/`chat_rail_tall`）**不带** `COLLATERAL`，只红目标那一条。撞错对象长得完全不同：`BAD 没变红`（目标没红）或 `INVALID`（目标在变异前就红）。
  **变异表之外还要补跑一次 RESULT7 的上限那半**（表里没有它的条目，见 Task 1 Step 4 的映射表第 7 行）：往 `assets/css/styles.css` 末尾按字节追加 `#page-chat { padding-top: 100px; }`，跑 `shell_check.py`，必须看到 `RESULT7: FAIL … chatBottom=920 期望 chatTop=128 + (vh=900 - padT=28 - padB=80) = 920 ±1，且 <= vh+1=901`（恒等式成立而判定红 —— 这正是要它管住的那种回归），然后按字节还原并核对 `git hash-object assets/css/styles.css` 与追加前一致、`git status --short` 为空。
- [ ] **Step 3:** `drive.py` → `RESULT-STREAM` + `RESULT1…RESULT11` 共 12 行全 PASS，exit 0（Agent 没被牵连）
- [ ] **Step 4:** `export WB_REPO="F:/Qoder/自媒体/自媒体工作台/workbench"` 后跑 `node /f/tmp/check_registry.mjs` → `45/45 passed`；`node /f/tmp/check_dangling.mjs` → `无悬挂引用`（平台注册表那轮改动仍在，未被 shell 改动冲掉）。
  **这两个脚本没有 `WB_REPO` 会直接抛「需要 WB_REPO 环境变量」**（`check_registry.mjs:13`，实测），不带它就跑是假通过的前置形态：你会看到 Node 堆栈而不是 PASS。
- [ ] **Step 5:** 桌面：`npm run tauri:dev`，窗口拉到 `minWidth` 1024，逐页翻一遍
  这一步是全计划唯一的人眼验收（Task 2 Step 6b、Task 3 Step 7b 都把账记在这里），自动化量的是几何与异常，量不出「像不像 Easel」。要看的清单：
  - 左栏 12 项的指认难度、`.nav-link.active::before` 那 3px 竖条够不够强（不够就调 Task 2 Step 4 的 `.sidebar .nav-link` 内边距/`gap`，别留成待办）；宽屏上会出现两条滚动线（sticky 侧栏 + 文档滚动），确认它看着是设计而不是坏了。
  - 1024 档助手页退两栏（容器 696 ≤ 800 → `.chat-tools` 隐藏）是否仍好用。
  - **模态里的 `.grid-3`**：`metrics.js:534` 渲染 `<div class="grid grid-3">` 在模态内，Task 3 的容器化让它现在塌成 2 列（模态内容盒实测 **590** ≤ 916，走 `.grid-3,.grid-4 → repeat(2,1fr)` 那条；576 那条 `→ 1fr` 不触发）。方向上是想要的（与 `.editor-layout` 同一个既有 bug 家族），但**没有任何断言覆盖它**，只能看。评审已排除其它在模态内渲染的候选（`.metrics-dashboard`/`.cal-stats`/`.calendar-grid`/`.cal-week-grid`/`.card-design-layout`/`.hr-topic-*`/`.platform-compliance-grid` 都是页面级渲染；`.modal-lg` 目前无人引用），所以爆炸半径就是 `.grid-3/.grid-4` + `.editor-layout`。
  - **761..823 这一段没人看过**（fix round 1 记的账）：它是「15 条容器规则已全部收到最窄形态，但侧栏还没降级」的区间。断点 760 的两条硬约束是 `< 1024`（Tauri `minWidth`，桌面包永不进降级）与 `≤ 824`（= 496 + 264 + 64，最后一条容器规则收完的视口），760 同时满足；但 harness 只在 761 与 800 两档实测过这一族宽度（两档都 10/10 PASS + exit 0），中间宽度是算术推出来的、不是量出来的。把窗口在这段里拖一拖，看侧栏那 12 项在工作区被压到 ~430px 时有没有挤坏。
  - **矮视口（`vh < 711`）窄屏 chat 会重新出现竖向滚动 —— 这条是设计代价，不是回归**：`.chat-wrap` 的 `min-height: 520px` 地板起跳（520 + 降级导航 111 + padT 20 + padB 60 = 711）。`RESULT10` 钉在 vh=780，量不到这一档；改壳前同样如此（390×640：`640 - 168 = 472 < 520` → 也是 520、也溢出），所以 Task 4 fix round 1 明确不动地板。要看的是：手机横屏/小窗口下 chat 输入框滚动一次就够得着，且不把别的内容顶出视口。
- [ ] **Step 6:** 线上：部署后跑一次 `cors_check.py` 对照 + 在手机宽度（390）逐页翻一遍
  390 这一档的具体看点（fix round 1 加的，别只翻 dashboard —— `RESULT9` 量的就是 dashboard，其余页的竖向表现此前无人覆盖）：
  - **chat 页输入框不滚动就能碰到**（这就是 `RESULT10` 那条性质的真人口径；它 2026-10-01 之前是红的：390×780 下溢出 83px，输入框落在折叠线以下）。
  - 「降级 = 等价改壳前的观感」这句**只是近似**：改壳前是 brand + nav 同一行内联、整条 `position: sticky`；降级后是 brand/nav/foot 竖排、`position: static`，也就是**顶部导航会随着文档滚走**。如果这在你看来是不可接受的，那要改的是 Task 4 降级段的定位，不是把 `RESULT10` 的判据挪开。
  - 顶部导航横滑（`.sidebar .nav` 实测 scrollW 恒 1030，十档宽度不换行）在真机上手指滑动是否顺；`.sidebar-foot` 在降级后是否还在碍事（它现在 `margin-top: 0`，Task 4 评审证明那条是死声明，保留而非删除）。

---

## 附录 A：如果拒绝容器查询（备选实现，代价与数字都在这）

容器查询要求 Chromium 105+/Safari 16+。WebView2 是常青版，正常满足；若必须兼容更老内核，就不转 `@container`，改为把 15 条视口断点**整体右移 328px**（= `--sidebar-w 264` + `.workspace` 左右内边距 64），并把 Task 4 的降级段改成 `@media (max-width: 760px)` 而其余 15 条都加 `and (min-width: 761px)` 守卫：

| 容器方案的阈值（Task 3 表） | 备选 `@media` 阈值 | 出现次数 |
|---|---|---|
| 576 | 904 | 4 |
| 836 | 1164 | 3 |
| 916 | 1244 | 2 |
| 496 | 824 | 2 |
| 656 | 984 | 1 |
| 704 | 1032 | 1 |
| 1036 | 1364 | 1 |
| 800（`.chat-tools` 特例） | 1128 | 1 |

两个方案应当落在同一个**内容宽度**上，这条就是自检等式：容器阈值 `X` ⟺ 视口 `X + 328`（在 `X + 328 ≤ 1584` 时成立，上表最大值 1364 满足）。所以备选表就是 Task 3 表每个数字加 328，若你对不上，错在其中一个表。

我第一版在这里写过一条假代价（「位移后 1364 会先于 1164 命中，卡片设计页在 1164-1364 区间行为变了」）——不成立：1364/1164 与 1100/900 的先后关系完全一致，两个方案在同一内容宽度上触发。真实的代价是这两条：
1. **模态内仍然瞎**：`.modal` 挂在 `<body>` 上（实测 `parent === "BODY"`），拿视口当尺子，「640px 模态里 `.editor-layout` 挤两列」的既有 bug 修不掉，RESULT8 也永远转不了绿——选它就得同时把 RESULT8 从验收里摘掉，不能既选它又声称修好了。
2. **数字与侧栏宽度锁死**：`--sidebar-w` 以后一改，15 个阈值全部要重算（容器查询则不用，因为它直接量内容盒）。

## 附录 B：明确不做（需要用户单独点头）

| 项 | 现状 | 为什么没进计划 |
|---|---|---|
| 侧栏「可勾选工具」 | `chat.js:253-270` 只读面板，无 checkbox | 与 `agent.js:10`「工具全部只读，写库由用户在界面确认」的既有安全设计冲突；开勾选等于给模型放行「选哪些数据能被读到」以外的口子 |
| `generate_card` / `generate_script` 作为模型可调用工具 | 只有 `db_list/db_get/db_stats/skill_*` 4 个；生成能力在 Chat 的「文案生成」tab（`RESULT6` 已覆盖） | 生成即写库/产出物，按上面同一条不该放行给模型自主调用；若要加，需要先定「确认后落库」的交互 |
| 给 `api/ai/*` 补 `messages`/`tools` 透传 | 两头都剥（`generate.js:140-158`、`stream.js:227`），Agent 靠 `requireDirect()` 拒绝 | 实测三家 provider 浏览器 preflight 全通过，直连即可，透传属于「无收益的新后端」 |
| `.verify-agent/drive.py` 里那 4 个已修 bug 的回归 | 已在 harness 内 | 无新增面 |
| 会话标题重命名 | `chat.js` 无 rename UI，标题取首条消息前 22 字（`chat.js:395`） | 纯功能新增，与本次改版无关 |
| 平台/数据层 | `Platforms` 注册表刚落地，未提交 | 见 Task 6 Step 4，只锁「别被冲掉」，不在本计划里继续动 |

## 附录 C：与存档方案逐条对照（自检结果）

| 存档方案条目 | 本计划归属 |
|---|---|
| 目标 1（Agent 能力 + 线上/桌面同时可用 + 零新后端） | 已完成部分 = 现状 A；线上可用性 = Task 5 |
| 目标 2（全站 Easel 式 shell） | Task 2 / 3 / 4 |
| 新增 `assets/js/agent.js` + 双栏样式 | 已存在（差异 A），不重复计划 |
| 改 `index.html` 加 `data-page="agent"` | 已存在为 `data-page="chat"`（`index.html:70`） |
| 改 `ai-gateway.js` 透传 `tools` | 已实现于直连路径（`agentBody`，`ai-gateway.js:481-494`）；代理路径按计划不补，见差异 C/附录 B |
| 左侧栏：会话列表 | 已存在（`chat.js:44-50, 201-234`，含两步删除） |
| 左侧栏：可勾选工具 / 技能 | 技能下拉已存在（`fillSkillPicker`，`chat.js:148-157`）；勾选移附录 B |
| 工具 `query_topics/query_contents/get_calendar/get_metrics/generate_card/generate_script` | 以 `db_list/db_get/db_stats` 白名单投影实现（`agent.js:16-23` 锁 6 张可读表），生成类移附录 B |
| 风险：懒加载只影响 Agent 页 | Task 6 Step 3 用 `drive.py` 锁 |
| 风险：代理模式透传 | 差异 C，已结论化 |
| 冒烟「帮我总结本周内容日历」 | `drive.py` 已覆盖同形场景（RESULT6/7/8/10） |
| 全站 shell 回归每页跑核心路径 | Task 3 Step 7 + Task 6 Step 5/6（自动化只覆盖几何与异常，业务路径仍需人工） |
