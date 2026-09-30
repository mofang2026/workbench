# 全站 Easel 式 Shell 改版 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作台从「吸顶横向导航 + 整页滚动」改成 Easel 式「常驻左栏 + 右侧工作区」，并让 Agent（助手页）在线上版与桌面版同时可用，不新增后端。

**Architecture:** 纯 CSS/HTML 改动 —— 已实测确认没有任何 JS 读**视口或自身之外**的几何：`grep -rE "innerWidth|clientWidth|getBoundingClientRect|ResizeObserver|addEventListener\(.resize." assets/js/` 命中 **0**（2026-09-30 复跑），所以换壳不需要重排 JS。**必须同时登记的例外**：`scrollTop`/`scrollHeight` 各有 5 处命中（`chat.js:370/423/433/493` 与 `ai-gateway.js:350`），全部是 `el.scrollTop = el.scrollHeight` 这种「写自己那个滚动容器」的自动滚到底，不做视口判断。它们的成立前提是那个容器仍然有界且可滚——换壳后 `.chat-wrap` 的高度改由 `--ws-pad-t/--ws-pad-b` 决定，所以 RESULT7（chat 工作区填满可用高度）就是替这 5 处把守的门禁，不是可以省的断言。侧栏用 `position:sticky + height:100vh`，工作区用 `container-type: inline-size`，让现存 15 条响应式断点继续按「自己那一栏的内容宽度」生效（阈值需平移 −64，推导见 Task 3 Step 1）。

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
- `.editor-layout` 在模态里挤成两列（既有 bug，与壳无关）：`.modal` 是 `width:100%; max-width:640px`（`styles.css:620-622`），而它内部的 `.editor-layout`（`:659`）靠 `@media (max-width: 980px)` 才降单列（`:664`）——尺子是视口，可它量的是 640px 的模态。Playwright 实测 1440 与 1024 两档视口下模态内 `gridTemplateColumns` 都是 **2 条轨**（`RESULT8` 的 detail：`{'parent': 'BODY', 'maskW': 1440, 'maskH': 900, 'tracks': 2, ...}`）。Task 3 换容器查询后自动修正，并已写成断言锁住。
- 顺带把容器化的一条真实风险量掉了：`container-type` 会让该元素成为其 **fixed 后代的包含块**（本来 fixed 是相对视口定位的）。实测全项目 `position: fixed` 只有 4 处：`body::before`（`styles.css:80-82`，body 的伪元素）、`.auth-mask`（`:419-420`，对应 `index.html:18` 的 `#authMask`）、`.modal-mask`（`:609-611`，由 `showModal()` 挂到 `document.body`，实测 `parent === "BODY"`）、以及 `#toast` 的内联样式（`index.html:230`）。**四者都是 body 级节点，没有一个 `.workspace` 或 `.modal` 的后代是 fixed 定位**，所以给这两处加 `container-type` 不会把任何遮罩/Toast 钉错位置。RESULT8 就是这条的守门断言（它同时校验 `parent === "BODY"` 与遮罩铺满整视口，`maskW==vw && maskH==vh`）。

---

## 文件结构

| 路径 | 动作 | 职责 |
|---|---|---|
| `F:\Qoder\自媒体\.verify-shell\shell_check.py` | 新建（仓库外，避免被 `sync-dist.js` 打进桌面包） | shell 几何回归：**9 条** RESULT 断言，全程离线 |
| `F:\Qoder\自媒体\.verify-shell\shell_mutate.py` | 新建 | 把 shell_check 的每条断言逐个改红，证明非空跑；带「变异前基线红项」预检 |
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

**只 commit，绝不 push。** push 需要用户单独批准（本环境 GCM 无界面，HTTPS push 本就必然失败，见全局约束）。

---

## Task 1: 布局回归 harness（先立靶子，允许全红）

**Files:**
- Create: `F:\Qoder\自媒体\.verify-shell\shell_check.py`
- Create: `F:\Qoder\自媒体\.verify-shell\shell_mutate.py`

**Interfaces:**
- Consumes: `window.switchPage(name)`（`app.js:417` 导出，实测 `typeof === "function"`）、`window.showModal/closeModal`（utils 镜像到全局，实测均为 function）
- Produces: `shell_check.py` 退出码（0 = 全绿）与 stdout 上的 `RESULT<n>: PASS/FAIL` 行；Task 2/3/4 的每一步都跑它

- [ ] **Step 1: 写 harness**

`F:\Qoder\自媒体\.verify-shell\shell_check.py`：

```python
"""工作台 shell 几何回归：逐页量布局，全程离线（外部请求一律 abort）。"""
import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

WORKBENCH = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench")
PORT = 4174
URL = f"http://127.0.0.1:{PORT}/index.html"
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
    chatBottom: (function () { const c = document.querySelector(".chat-wrap");
      return c ? Math.round(c.getBoundingClientRect().bottom) : null; })(),
    overflowX: document.documentElement.scrollWidth - Math.round(window.innerWidth),
    vw: window.innerWidth, vh: window.innerHeight,
  };
}"""

MODAL = """() => {
  showModal('<div class="editor-layout"><div style="height:40px">a</div><div>b</div></div>');
  const mask = document.querySelector(".modal-mask"), el = document.querySelector(".editor-layout");
  const b = mask.getBoundingClientRect();
  const out = { parent: mask.parentElement.tagName,
    maskW: Math.round(b.width), maskH: Math.round(b.height),
    tracks: getComputedStyle(el).gridTemplateColumns.trim().split(/\\s+/).length,
    vw: window.innerWidth, vh: window.innerHeight };
  closeModal();
  return out;
}"""

RESULTS = []


def check(name, ok, detail=""):
    print(f"RESULT{name.split()[0]}: {'PASS' if ok else 'FAIL'}  {name}  {detail}")
    RESULTS.append(bool(ok))


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
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script(STUB_SUPABASE)
        ctx.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))

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
        check("2 工作区在侧栏右侧", bool(d["workspace"]) and d["workspace"]["x"] == SIDEBAR_W,
              str(d["workspace"]))
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
                bad_active.append(f"{name}({','.join(s['active']) or '无'})")
        check("3 12 页均有内容且无未捕获异常", not bad_render and not errs,
              f"空页={bad_render} JS错误={errs[:2]}")
        check("4 12 页均无横向溢出", not bad_overflow, str(bad_overflow))
        check("6 单高亮且随页切换", not bad_active, str(bad_active))

        pg.evaluate("() => window.switchPage('chat')")
        c = pg.evaluate(PROBE)
        want = c["vh"] - 80
        check("7 chat 工作区填满可用高度", c["chatBottom"] is not None
              and want - 6 <= c["chatBottom"] <= c["vh"] + 1,
              f"chatBottom={c['chatBottom']} 期望≥{want - 6} vh={c['vh']}")

        m = pg.evaluate(MODAL)
        check("8 模态覆盖整视口 + 编辑器单列", m["parent"] == "BODY"
              and m["maskW"] == m["vw"] and m["maskH"] == m["vh"] and m["tracks"] == 1, str(m))

        # ---- 窄屏 390 ----
        browse(390, 780)
        pg.evaluate("() => window.switchPage('dashboard')")
        n = pg.evaluate(PROBE)
        check("9 窄屏无横向溢出（侧栏降级）", n["display"] == "block" and n["overflowX"] <= 0
              and n["pageKids"] >= 1 and not errs,
              f"display={n['display']} overflowX={n['overflowX']} 错误={errs[:2]}")

        browser.close()
    srv.shutdown()
    print("\nRESULT: " + ("PASS" if all(RESULTS) else f"FAIL({RESULTS.count(False)}/{len(RESULTS)})"))
    return 0 if all(RESULTS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: 跑一遍，确认它现在会红（已实测，输出如下逐字为准）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
实测（2026-09-30，改壳前的现状，exit=1）：

```
# 桌面巡检宽度 = 1440
RESULT1: FAIL  1 侧栏 264 且吸顶  None
RESULT2: FAIL  2 工作区在侧栏右侧  None
RESULT5: FAIL  5 侧栏含 12 个导航项  实际 0
RESULT3: PASS  3 12 页均有内容且无未捕获异常  空页=[] JS错误=[]
RESULT4: PASS  4 12 页均无横向溢出  []
RESULT6: PASS  6 单高亮且随页切换  []
RESULT7: PASS  7 chat 工作区填满可用高度  chatBottom=825 期望≥814 vh=900
RESULT8: FAIL  8 模态覆盖整视口 + 编辑器单列  {'parent': 'BODY', 'maskW': 1440, 'maskH': 900, 'tracks': 2, 'vw': 1440, 'vh': 900}
RESULT9: PASS  9 窄屏无横向溢出（侧栏降级）  display=block overflowX=0 错误=[]

RESULT: FAIL(4/9)
```

红：`RESULT1/2/5`（还没有侧栏与工作区）、`RESULT8`（`tracks: 2` 就是那条与壳无关的既有 bug：640px 模态里的 `.editor-layout` 被 980px 视口断点判成两列）。
`shell_check.py 1024`（Tauri `minWidth` 那一档）同跑实测：红绿集合与 exit 码与 1440 完全一致，只是 `RESULT8` 的 `maskW/vw` 由 1440 变 1024（`tracks: 2` 照旧），末行仍是 `RESULT: FAIL(4/9)`。
绿：`RESULT3/4/6`（守恒断言，改壳后必须仍绿）、`RESULT7`（`chatBottom=825` 来自今天 `100vh - 168px` 这个恰好还凑合的常量）、`RESULT9`（今天 `.app-shell` 无 `display` 声明 → 窄屏本来就是 block）。

两条踩过的坑，重跑时别踩：
- **必须留 `STUB_SUPABASE` 这段 init script**。`ctx.route` 掐外部请求会连 Supabase 的 CDN 全局一起掐掉，`WorkbenchConfig` 初始化就抛 `createClient is not a function`，随后是 `auth.getUser is not a function` —— 那时 RESULT3 量到的是 harness 自己的问题，不是页面的。缺哪个 auth 方法就照报错补哪个 stub。
- **必须用 `get-then-patch` 打桩**（`WB.get("Db").list = async () => []`），不要整块替换 `WB._registry["Db"].instance`：后者会抹掉别的方法，实测会让 dashboard 渲染走进异常分支。
- playwright 只装在 Easel venv，系统 `python` 会 `ModuleNotFoundError`（已实测）；`python3` 在本机静默失败（exit 49），用 `python`。

- [ ] **Step 3: 写变异驱动脚本**

`F:\Qoder\自媒体\.verify-shell\shell_mutate.py`：

```python
"""改坏一处 → 跑 shell_check → 期望指定 RESULT 变红 → 按字节还原。证明断言非空跑。"""
import re
import subprocess
import sys
from pathlib import Path

CSS = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench\assets\css\styles.css")
HTML = Path(r"F:\Qoder\自媒体\自媒体工作台\workbench\index.html")
PY = r"F:\Qoder\自媒体\Easel\.venv\Scripts\python.exe"

# 名字 -> (目标文件, 原文, 替换, 期望变红的 RESULT 编号)
# 锚点必须全文件唯一：`min-width: 0;` 在 styles.css 里已有 4 处（1171/1638/1725/1800），
# 单独拿它当锚点会命中 `.rec-body` 而不是 `.workspace`，变异就白做了。
MUT = {
    "sidebar_w_zero": (CSS, "--sidebar-w: 264px;", "--sidebar-w: 0px;", "RESULT1"),
    "no_sticky": (CSS, "position: sticky;", "position: static;", "RESULT1"),
    "grid_one_col": (CSS, "grid-template-columns: var(--sidebar-w) minmax(0, 1fr);",
                     "grid-template-columns: 1fr;", "RESULT2"),
    "page_id_gone": (HTML, '<section id="page-rules"', '<section id="pagex-rules"', "RESULT3"),
    "ws_min_width": (CSS, "box-sizing: border-box;\n  min-width: 0;",
                     "box-sizing: border-box;\n  min-width: 1200px;", "RESULT4"),
    "sidebar_class_gone": (HTML, '<aside class="sidebar">', "<aside>", "RESULT5"),
    # 复制一份 chat 导航项：switchPage 会把两个都标 active，同时侧栏计数变 13
    "nav_dup": (HTML, '<a class="nav-link" data-page="chat">助手</a>',
                '<a class="nav-link" data-page="chat">助手</a>\n          '
                '<a class="nav-link" data-page="chat">助手（重复）</a>', "RESULT6"),
    "chat_vh_old": (CSS, "height: calc(100vh - var(--ws-pad-t) - var(--ws-pad-b));",
                    "height: calc(100vh - 168px);", "RESULT7"),
    "modal_container": (CSS, ".modal {\n  container-type: inline-size;\n  container-name: ws;\n}",
                        "/* 模态容器被移除 */", "RESULT8"),
    "narrow_no_degrade": (CSS, ".app-shell { display: block; }",
                          ".app-shell { display: grid; }", "RESULT9"),
}


def run():
    r = subprocess.run([PY, "shell_check.py"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", cwd=str(Path(__file__).parent))
    # 只认 RESULT<数字>，末行的汇总 "RESULT: FAIL(4/9)" 不是断言，混进来会污染基线红项
    return [m.group(1) for m in re.finditer(r"^(RESULT\d+): FAIL", r.stdout, re.M)]


def main():
    names = sys.argv[1:] or list(MUT)
    src = {CSS: CSS.read_text(encoding="utf-8"), HTML: HTML.read_text(encoding="utf-8")}
    base = run()
    print(f"变异前基线红项：{base or '全绿'}")
    bad = 0
    for name in names:
        path, old, new, want = MUT[name]
        original = src[path]
        if old not in original:
            print(f"{name}: SKIP —— 锚点不在 {path.name} 中（前置任务没做到位，先修那个再继续）")
            bad += 1
            continue
        if want in base:
            # 断言在变异前就已经是红的，这次变异证明不了任何东西
            print(f"{name}: INVALID —— {want} 变异前就红，先把基线跑绿再谈证明")
            bad += 1
            continue
        path.write_text(original.replace(old, new, 1), encoding="utf-8")
        try:
            reds = run()
        finally:
            path.write_text(original, encoding="utf-8")
            assert path.read_text(encoding="utf-8") == original, f"{name} 还原失败"
        hit = want in reds
        print(f"{name}: {'OK 变红' if hit else 'BAD 没变红'}  期望 {want} 红，实际 {reds or '全绿'}")
        if not hit:
            bad += 1
    if bad:
        raise SystemExit(f"{bad} 项未被证明")
    print("全部断言已被证明会变红")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 现在就跑一次全量变异（有 2 条当场能被证明，其余 8 条必须被拒绝）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py`
实测（改壳前，10 个变异，exit=1）：

```
变异前基线红项：['RESULT1', 'RESULT2', 'RESULT5', 'RESULT8']
sidebar_w_zero: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
no_sticky: INVALID —— RESULT1 变异前就红，先把基线跑绿再谈证明
grid_one_col: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
page_id_gone: OK 变红  期望 RESULT3 红，实际 ['RESULT1', 'RESULT2', 'RESULT5', 'RESULT3', 'RESULT8']
ws_min_width: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
sidebar_class_gone: SKIP —— 锚点不在 index.html 中（前置任务没做到位，先修那个再继续）
nav_dup: OK 变红  期望 RESULT6 红，实际 ['RESULT1', 'RESULT2', 'RESULT5', 'RESULT6', 'RESULT8']
chat_vh_old: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
modal_container: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
narrow_no_degrade: SKIP —— 锚点不在 styles.css 中（前置任务没做到位，先修那个再继续）
8 项未被证明
```

（上块的末行 `8 项未被证明` 是 `SystemExit(str)` 打到 **stderr** 的，exit=1；只重定向 stdout 会看不到这一行。）

`page_id_gone` / `nav_dup` 这两条**改壳前就能证明**，因为它们量的是今天已存在的东西（页面 section 的 id、导航项唯一性）。这一步就是它们的责任：先证明 RESULT3/RESULT6 不是空跑，后面换壳时才有资格说「它俩仍绿」。

三种输出的含义，都不许当成通过：
- **OK 变红**：断言非空跑，且只被这一处变异打红（`实际` 列要逐字核对——若红名单里多了没预期的条目，说明变异串撞到了别处，见下面的唯一性）。
- **SKIP**：锚点串还没进文件（Task 2/3/4 没做到位）。这条同时是「计划里的 CSS 片段是否真被写进文件」的探针——漏写 `.modal` 容器块、漏写 `--sidebar-w`、Task 4 那段没落地，都会在这里以 SKIP 现形。
- **INVALID**：断言在变异**之前**就已经是红的，这次变异证明不了任何东西。这条预检是我第一版漏掉的，当时 `no_sticky` 打印了 `OK 变红` 而 RESULT1 其实一直红着——假证明比没有证明更糟。注意判定顺序：锚点检查在前，所以 `sidebar_w_zero`（目标 RESULT1 也红）报的是 SKIP 而不是 INVALID。

**每条断言都要有对应的变异**（第一版计划漏了 RESULT3/6/9 三条，等于默许它们空跑）：

| RESULT | 断言 | 证明它的变异 | 何时可跑 |
|---|---|---|---|
| 1 | 侧栏 264 且 sticky | `sidebar_w_zero`、`no_sticky` | Task 2 后 |
| 2 | 工作区 x=264 | `grid_one_col` | Task 2 后 |
| 3 | 12 页均有内容、无 pageerror | `page_id_gone` | **改壳前即可（已证）** |
| 4 | 12 页无横向溢出 | `ws_min_width` | Task 2 后 |
| 5 | 侧栏内 12 个导航项 | `sidebar_class_gone` | Task 2 后 |
| 6 | 单高亮且随页切换 | `nav_dup` | **改壳前即可（已证）** |
| 7 | chat 填满可用高度 | `chat_vh_old` | Task 3 后 |
| 8 | 模态覆盖视口 + 编辑器单列 | `modal_container` | Task 3 后 |
| 9 | 窄屏降级无溢出 | `narrow_no_degrade` | Task 4 后（此前 RESULT9 是红的，会报 INVALID） |

`nav_dup` 尤其有用：Task 2 若把旧顶栏忘删、留下两份导航，RESULT5（计数变 24）与 RESULT6（双高亮）会当场抓住。

锚点唯一性实测（决定变异是否只改到你想改的那处）：`position: sticky;` 在 `styles.css` 里当前**只有 1 处**（`:101`，`.topbar`），Task 2 删掉它后由 `.sidebar` 接手，仍唯一；`box-sizing: border-box;` 当前 1 处但是 `* { ... }` 单行写法（`:58`），所以 `ws_min_width` 用「`box-sizing` 换行 + `min-width: 0;`」两行组合当锚点——单用 `min-width: 0;` 会命中已有的 4 处（`:1171/:1638/:1725/:1800`）而改错对象；`display: block` 单独有 5 处，所以 `narrow_no_degrade` 用整行 `.app-shell { display: block; }`（当前 0 处，Task 4 落地后唯一）。每次跑完 harness 会断言按字节还原（`assert ... == original`），实测还原后 `pagex-rules`/`助手（重复）`/`min-width: 1200px` 残留计数均为 **0**。

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

- [ ] **Step 1: 确认基线（与 Task 1 Step 2 逐字一致才算）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
Expected: 红的正好是 `RESULT1/RESULT2/RESULT5/RESULT8`，末行 `RESULT: FAIL(4/9)`。多出或少掉任何一条，都说明工作树被别的改动动过——先回查（`git status --short`、Task 0 是否已落库），不要开始改 markup。

- [ ] **Step 2: 改 markup**

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

- [ ] **Step 3: 删掉两条会一起搬错的死 CSS**

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

- [ ] **Step 4: 写 shell CSS**

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

- [ ] **Step 5: 跑 harness**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py`
Expected（本任务结束时应有 **3 红 6 绿**：`RESULT7/8/9`，每条红都指向后面哪个任务修它）：
- 转 PASS：`RESULT1`、`RESULT2`、`RESULT5`
- **转 FAIL（新红，预期内）**：`RESULT7`。`168px` 这个常量是给「顶栏 60 + `.app-shell` 上下内边距 28+80」凑的；顶栏一撤、`.workspace` 改用 `--ws-pad-t: 28`，`.chat-wrap` 顶边就从实测的 `93` 抬到约 `33`，`chatBottom` 由 `825` 掉到约 `765`，落在判定带 `[814, 901]` 之外。**765 是算术推的，不是实测**：跑完把 harness 打印的真实值记进本步的勾选备注里，Task 3 Step 3 用 `calc(100vh - var(--ws-pad-t) - var(--ws-pad-b))` 修。
- **转 FAIL（新红，由断言构造决定）**：`RESULT9`。Task 2 给 `.app-shell` 写的是**无条件** `display: grid`，而 RESULT9 断言 390 视口下 `display == "block"`；侧栏此时还占着 264px。Task 4 的 `@media (max-width: 760px)` 降级段修它。
- 仍 FAIL：`RESULT8`（`tracks: 2`，Task 3 修）
- 必须仍 PASS：`RESULT3`、`RESULT4`、`RESULT6` —— 其中 `RESULT4` 一旦红，就是 `minmax(0, 1fr)` 或 `min-width: 0` 漏了，立刻回查，不要留给后面的任务

- [ ] **Step 6: 人工看一眼主窗口宽度**

Run: `cd "/f/Qoder/自媒体/自媒体工作台/workbench" && npx serve . -l 4173` → 浏览器开 `http://127.0.0.1:4173`，把窗口拖到 1024（Tauri `minWidth` 下限）。
Expected: 侧栏 264 固定，右栏 760 起，无横向滚动条。
注意：本计划的自动化只跑 Chromium（Playwright），WebView2 里若出现差异需人工反馈，自动化不声称覆盖它。

- [ ] **Step 7: Agent 全链路没被改坏**

Run: `cd /f/Qoder/自媒体/.verify-agent && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" drive.py`
Expected: `RESULT-STREAM` + `RESULT1…RESULT11` 共 12 行全 PASS，exit 0（改壳前基线已复跑确认，见差异表 A）。尤其 `RESULT7 面板工具`（左栏工具面板渲染）与 `RESULT11`（两步确认删除 + 清空会话）：chat 页 DOM 位置变了，这两条最容易受牵连。

- [ ] **Step 8: Commit**

```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
git add index.html assets/css/styles.css
git commit -m "feat(shell): 顶部横向导航改为常驻左栏 + 右工作区"
```

---

## Task 3: 15 条断点改容器查询 + chat 高度去常量

**Files:**
- Modify: `workbench/assets/css/styles.css` 的 15 处 `@media`（行号见下表，均为改壳前原始行号）
- Modify: `workbench/assets/css/styles.css:1986-1991`（`.chat-wrap` 高度）

**Interfaces:**
- Consumes: Task 2 的 `container-name: ws`、`--ws-pad-t/--ws-pad-b`
- Produces: 所有工作区/模态内布局按「自己那一栏的宽度」响应；`shell_check.py` 的 RESULT8 转绿

- [ ] **Step 1: 按「查询值」整批替换，不是按行号**

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

- [ ] **Step 2: 检查替换数量（按值数，不按行数）**

Run:
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench"
grep -oE "@container ws \(max-width: [0-9]+px\)" assets/css/styles.css | sort | uniq -c
grep -c "@media" assets/css/styles.css
```
Expected: `576×4`、`836×3`、`916×2`、`496×2`、`656×1`、`704×1`、`800×1`、`1036×1`（合计 15），`@media` 计数 = **0**（Task 4 才把窄屏那条加回来，它是刻意保留的视口查询）。数字对不上就是漏换或重换。此时 `@container` 总数应为 15；若你顺手数出 17，多半是把 `.modal`/`.workspace` 的 `container-type` 两行也误当查询计进去了。


- [ ] **Step 3: chat 高度去常量**

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

- [ ] **Step 4: 跑 harness（两档宽度都要跑）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py 1024`
Expected: 两档都只剩 `RESULT9` 红（Task 4 的窄屏降级还没写），末行 `RESULT: FAIL(1/9)`。`RESULT8` 转 PASS 就是 `tracks: 1`，即那条 640px 模态挤两列的既有 bug 被容器查询顺手修掉了；`RESULT7` 的 `chatBottom` 应回到 **825**——这是算术推的：`height: calc(100vh - 28 - 80)` 在 vh=900 得 792，`.workspace` 顶部内边距 28 + 页面自身那 5px 得顶边 33，`33 + 792 = 825`，与改壳前实测的 825 相同。跑出来不是 825 就以实数为准并记在这里，别硬凑。

- [ ] **Step 5: 量最窄桌面宽度下的溢出（这是改壳的真实代价，必须量不是猜）**

`shell_check.py` 的第一个参数就是巡检宽度，不用改代码：`shell_check.py 1024`（Tauri `minWidth`）。
改壳前实测（2026-09-30）：`RESULT4: PASS 12 页均无横向溢出 []` —— 今天 1024 下 12 页都不溢出，所以改壳后也必须如此，这条不是奢望。
Expected: 1024 档 `RESULT4` PASS。若 `card-design` 溢出，注意 `.cd-preview` 今天已带 `max-width:100%`（实测 `styles.css:1560`），所以别再加一遍同一条；真正要看的是 `.card-design-layout` 的 `220px 1fr 280px`（`:1480`）在容器 696 下有没有被 `.cd-editor`/`.cd-main` 里的不可断行内容撑破——按 Step 1 的换算，1024 视口下容器 = `1024-328 = 696 ≤ 836`，`:1487` 那条应已把它降成 `1fr` 单列；若仍是三列，说明阈值平移算错了，回 Step 1 复核而不是加 `overflow:hidden` 糊过去。若 `chat` 页在 1024 下三栏挤（内容 696 ≤ 800），`.chat-tools` 应自动隐藏而 `RESULT4` 仍 PASS——这正是 Step 1 里那条特例的验证点。


- [ ] **Step 6: 证明断言会变红**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py sidebar_w_zero no_sticky grid_one_col page_id_gone ws_min_width sidebar_class_gone nav_dup chat_vh_old modal_container`
Expected: 9 行全部 `OK 变红`，exit 0。**故意不带 `narrow_no_degrade`**：此刻 RESULT9 还是红的（Task 4 没做），它会以 `INVALID` 报出来——那不是失败，是时序。
任一行 `BAD 没变红` 或 `SKIP` 就是计划本身有问题，停下报告，不要继续。
（`SKIP` 的意思是锚点串在文件里找不到 —— 例如把 `.modal` 那条容器块漏写了，此时断言根本没东西可测，继续下去就是自欺。逐行核对 `实际` 列：除目标外不应多出别的红项，多了说明变异串撞到了别处。）

- [ ] **Step 7: 视觉回归 + Agent 回归**

12 页人工翻一遍（对照 Easel 的比例感，实测可查的行：`web/frontend/src/styles/index.css:37` `--sidebar-width: 264px`、`:85-93` `.sidebar`、`:96` `.sidebar-header{padding:18px 16px 14px}`、`:136` `.sidebar-nav{padding:10px 8px;flex-direction:column;gap:2px}`、`:210` `.main-content`）。
Expected: `drive.py` 的 `RESULT-STREAM` + `RESULT1…RESULT11` 全 PASS、exit 0；无页面出现横向滚动条。
这条只能人工：自动化量的是几何与异常，量不出「左栏 12 项是否比原来更难指认」「`.nav-link.active::before` 那 3px 竖条是否太弱」。视觉判断不对就当场调 Task 2 Step 4 的 `.sidebar .nav-link` 内边距/`gap`，别把「看着不像 Easel」留成待办。


- [ ] **Step 8: Commit**

```bash
git add assets/css/styles.css
git commit -m "refactor(shell): 工作区断点改容器查询，chat 高度去硬编码"
```

---

## Task 4: 窄屏降级（≤760px 回到顶栏形态）

**Files:**
- Modify: `workbench/assets/css/styles.css`（Task 3 后遗留的 `@media` 位置附近，新增一段）

**Interfaces:**
- Consumes: Task 2 的 `.app-shell/.sidebar/.nav-link` 结构
- Produces: 手机上退化成「横滑顶部导航」，等价于改壳前的观感；`shell_check.py` RESULT9 转绿

- [ ] **Step 1: 加查询块**

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

- [ ] **Step 2: 跑 harness（两档）**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_check.py 1024`
Expected: 两档都全部 9 条 PASS，末行 `RESULT: PASS`，exit 0。这是本计划的收口点，也是 `shell_mutate.py` 里 `no_sticky` 等变异从 INVALID 转成可证明的前提。

- [ ] **Step 3: 跑全量变异，把 9 条断言一次证明干净**

Run: `cd /f/Qoder/自媒体/.verify-shell && PYTHONIOENCODING=utf-8 "/f/Qoder/自媒体/Easel/.venv/Scripts/python.exe" shell_mutate.py`
Expected: 10 行全部 `OK 变红`（`RESULT1` 由 `sidebar_w_zero` 与 `no_sticky` 各证一次），末行 `全部断言已被证明会变红`，exit 0。基线红项那行应打印 `全绿`——若还列出任何 `RESULTn`，说明 Step 2 的绿是假的。
（`sidebar_w_zero` 会让 RESULT1 与 RESULT2 同时变红：侧栏宽 0 → 工作区 x=0。这不影响判定，目标 RESULT1 红即算证明，但要知道邻居也被牵动了——单一断言被单一变异打红这件事，只有 `no_sticky`、`page_id_gone`、`nav_dup` 等几条成立。）


- [ ] **Step 4: Commit**

```bash
git add assets/css/styles.css
git commit -m "feat(shell): 窄屏侧栏降级为顶部横滑导航"
```

---

## Task 5: 线上可用性与桌面包收口

**Files:**
- Create: `F:\Qoder\自媒体\.verify-shell\cors_check.py`
- Modify: `workbench/assets/js/settings.js:264-267`（`#aiProxyNoteWrap` 那段代理模式说明，实测它只在 `s.mode === "proxy"` 时显示，正是该提醒的地方）

**Interfaces:**
- Consumes: `ai-gateway.js:466-470`（`requireDirect()` 的报错文案）、`chat.js:296`（`" · 代理模式不支持工具，请切直连"`）
- Produces: 一条可复跑的线上前置检查；不新增后端

- [ ] **Step 1: 把 CORS 结论落成可复跑脚本**

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

这条实测支持的结论：**线上版 Agent 走直连即可，不需要给代理补 `tools` 透传。** 若某家日后变 FAIL，才回到「给 `api/ai/` 加一个转发 `messages/tools/tool_calls` 的 agent 路由」这条备选路（约需新增 1 个 api 文件 + 流式 `delta.tool_calls` 拼接，工作量参考 `ai-gateway.js:521-535`）。

两个不能从这条实测里多读出来的东西，写清楚免得日后被当依据：
- preflight 放行只证明浏览器**允许发这个请求**，不证明带上真实 Key 后的 `POST` 一定成功（那要 Key 才能验，用户没有 Key，本计划不声称验过）。
- `Origin` 用的是 `https://workbench.shuncheng.xin`。三家都回显来源（等于 `*` 的宽松策略），换域名不会变 FAIL；但如果哪家改成白名单，脚本会立刻红，这是它继续存在的意义。


- [ ] **Step 2: 文案对齐实测结论**

`settings.js:266` 那行 `<strong>ℹ 代理模式说明</strong>…密钥不会泄露。` 之后、`</div>`（`:267`）之前插入一句（口径与 `chat.js:296` 的 `" · 代理模式不支持工具，请切直连"` 一致，颜色类沿用同文件已在用的 `text-xs muted-2`）：

```html
<br /><span class="text-xs muted-2">助手页在代理模式下不可用：代理路由不透传工具调用。要用助手就切「直连模式」并填你自己的 Key——线上版三家模型均已验证支持浏览器跨域调用。</span>
```

Run（确认插入没破坏模板字符串闭合，`settings.js` 这段本身在反引号模板里）：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && node --check assets/js/settings.js && grep -c "助手页在代理模式下不可用" assets/js/settings.js
```
Expected: `node --check` 无输出（语法通过），计数 `1`。再跑 `shell_check.py` 的 RESULT3（`JS错误=[]`）确认渲染设置页没有 pageerror。

- [ ] **Step 3: 密钥边界写清楚（这是安全结论，不是可选说明）**

直连模式下 API Key 存在浏览器 localStorage（`ai-gateway.js:10` 的 `workbench-ai-settings-v2`），意味着：
- 公开部署的站点上，用户填的是**自己的** Key，浏览器直接拿它请求 provider —— 单机自用可接受；
- 但绝不能把任何真实 Key 写进仓库、`WorkbenchConfig` 默认值或 `dist/`。`git log` 里 `9253160`（内置共享 Supabase 凭据）已经说明这条线很容易被踩过。

Run（**只打印数量，绝不回显命中内容**——`grep` 不加 `-o` 会把整串 Key 打到屏幕上）：
```bash
cd "/f/Qoder/自媒体/自媒体工作台/workbench" && grep -rniE "sk-[a-z0-9]{16,}|api[_-]?key[[:space:]]*[:=][[:space:]]*['\"][^'\"]{20,}" index.html assets/js/ | wc -l
```
实测（2026-09-30）：`0`。非 0 就停下报告，不要把匹配行贴进任何文档或 commit 信息。

- [ ] **Step 4: 桌面包收口（实测到的缺陷就在这）**

Run: `cd "/f/Qoder/自媒体/自媒体工作台/workbench" && npm run tauri:sync && printf "dist_scripts=%s\ndist_jsfiles=%s\nmissing=%s\n" "$(grep -c '<script src' dist/index.html)" "$(ls dist/assets/js | wc -l)" "$(comm -23 <(ls assets/js | sort) <(ls dist/assets/js | sort) | tr '\n' ' ')"`
实测同步前（2026-09-30）：`src_scripts=25`、`dist_scripts=22`、`src_jsfiles=22`、`dist_jsfiles=19`、`dist_missing=agent.js chat.js platforms.js`（反向差为空，即 dist 里没有已删除的死文件）。
Expected（同步后）：`dist_scripts=25`、`dist_jsfiles=22`、`missing=`（空）。`tauri:sync` 就是 `node sync-dist.js`，`tauri:build` 会先跑它，所以只有**手动** `tauri build` 会打出没有助手页的桌面包——这一步是把那条陷阱关掉。
注意 `dist/` 被 `.gitignore:15` 忽略（实测 `git check-ignore -v dist/index.html` 命中该规则），所以 **不要 `git add dist`**，桌面包的正确性靠构建前必跑 `tauri:sync` 保证。

- [ ] **Step 5: Commit**

```bash
git add assets/js/settings.js
git commit -m "docs(settings): 代理模式下说明助手页需直连"
```


（若仓库不跟踪 `dist/`，去掉 `dist`，改为确认 `.gitignore` 覆盖它并在 commit 信息里说明。）

---

## Task 6: 端到端总验收

- [ ] **Step 1:** `shell_check.py` 与 `shell_check.py 1024` → 两档都 `RESULT: PASS`，exit 0（9 条）
- [ ] **Step 2:** `shell_mutate.py`（不带参数，跑全部 **10** 个变异）→ 首行基线红项打印 `全绿`，10 行 `OK 变红`，末行 `全部断言已被证明会变红`，exit 0
- [ ] **Step 3:** `drive.py` → `RESULT-STREAM` + `RESULT1…RESULT11` 共 12 行全 PASS，exit 0（Agent 没被牵连）
- [ ] **Step 4:** `export WB_REPO="F:/Qoder/自媒体/自媒体工作台/workbench"` 后跑 `node /f/tmp/check_registry.mjs` → `45/45 passed`；`node /f/tmp/check_dangling.mjs` → `无悬挂引用`（平台注册表那轮改动仍在，未被 shell 改动冲掉）。
  **这两个脚本没有 `WB_REPO` 会直接抛「需要 WB_REPO 环境变量」**（`check_registry.mjs:13`，实测），不带它就跑是假通过的前置形态：你会看到 Node 堆栈而不是 PASS。
- [ ] **Step 5:** 桌面：`npm run tauri:dev`，窗口拉到 `minWidth` 1024，逐页翻一遍
- [ ] **Step 6:** 线上：部署后跑一次 `cors_check.py` 对照 + 在手机宽度（390）逐页翻一遍

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
