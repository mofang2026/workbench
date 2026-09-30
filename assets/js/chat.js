/**
 * Chat · 助手对话页
 * ============================================================
 * 布局借 Easel 的形态：左侧会话列表 / 中间消息流 / 底部输入坞。
 * 差异：数据仍在工作台自己的 localStorage + Supabase 里，不引后端。
 * 引擎在 Agent 模块（工具循环），本模块只管渲染与会话持久化。
 */

WB.define("Chat", ["Agent"], (Agent) => {
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "workbench-chat-sessions-v1";
  const PAGE = "chat";

  let sessions = [];
  let current = null;
  let controller = null;
  let built = false;
  let mode = "chat"; // chat=自由对话（工具循环）| gen=文案生成（固定提示词一次生成）
  let tplList = null;
  let tplError = "";
  let pendingDel = null; // 侧栏里正在两步确认的会话 id
  let pendingClear = false;

  // ===== 会话存取 =====
  function load() {
    try {
      sessions = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    } catch {
      sessions = [];
    }
    if (!Array.isArray(sessions)) sessions = [];
    if (!sessions.length) sessions = [newSession()];
    current = sessions[0].id;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(sessions.slice(0, 50)));
    } catch (e) {
      console.warn("会话保存失败", e);
    }
  }

  function newSession() {
    const s = { id: "s" + Date.now().toString(36), title: "新对话", messages: [], created_at: Date.now() };
    sessions.unshift(s);
    current = s.id;
    save();
    return s;
  }

  const session = () => sessions.find((s) => s.id === current) || sessions[0];

  function md(text) {
    if (!window.marked) return escapeHtml(text || "");
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text || "");
  }

  // ===== 骨架 =====
  function build() {
    const host = $("page-" + PAGE);
    host.innerHTML = `
      <div class="chat-wrap">
        <aside class="chat-rail">
          <button class="btn btn-primary btn-sm" id="chatNew">+ 新对话</button>
          <button class="btn btn-ghost btn-sm" id="chatClear">清空本会话</button>
          <div class="chat-rail-list" id="chatList"></div>
        </aside>
        <section class="chat-main">
          <header class="chat-head">
            <div>
              <div class="chat-title" id="chatTitle">助手</div>
              <div class="chat-sub" id="chatSub"></div>
            </div>
            <div class="chat-head-tools">
              <select id="chatSkill" class="select chat-skill" title="优先使用某个技能"></select>
            </div>
          </header>
          <div class="chat-thread" id="chatThread"></div>
          <footer class="chat-composer">
            <div class="tab-bar chat-tabs" id="chatTabs">
              <button class="tab" data-mode="chat">自由对话</button>
              <button class="tab" data-mode="gen">文案生成</button>
            </div>
            <div class="chat-gen-row hidden" id="chatGenRow">
              <select id="chatTpl" class="select chat-tpl" title="选用模板"></select>
              <input id="chatGenSlot" class="input" placeholder="主题或一句话要求，例如：通勤穿搭三连" />
            </div>
            <textarea id="chatInput" class="chat-input" rows="2"
              placeholder="问一句，或让它对照选题与排期找缺口（Ctrl+Enter 发送）"></textarea>
            <div class="chat-composer-bar">
              <span class="chat-hint" id="chatHint"></span>
              <button class="btn btn-sm" id="chatStop" disabled>停止</button>
              <button class="btn btn-primary btn-sm" id="chatSend">发送</button>
            </div>
          </footer>
        </section>
        <aside class="chat-tools" id="chatTools"></aside>
      </div>`;

    $("chatNew").addEventListener("click", () => { pendingDel = null; pendingClear = false; newSession(); render(); });
    $("chatClear").addEventListener("click", clearThread);
    $("chatSend").addEventListener("click", send);
    $("chatStop").addEventListener("click", stop);
    $("chatInput").addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); }
    });
    $("chatTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn || controller || btn.dataset.mode === mode) return;
      mode = btn.dataset.mode;
      renderComposer();
      if (mode === "gen") fillTplPicker();
    });
    // 事件委托挂在 #chatThread 上：它跨 render() 存活，卡片重建也不用重新绑
    $("chatThread").addEventListener("click", (e) => {
      const head = e.target.closest(".chat-step-head");
      if (head) {
        const open = head.closest(".chat-step").classList.toggle("open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }
      const act = e.target.closest("[data-act]");
      if (!act) return;
      const kind = act.dataset.act;
      if (kind === "key") WB.get("App").switchPage("settings");
      else if (kind === "direct") switchToDirect();
      else if (kind === "retry") retryAt(Number(act.dataset.idx));
    });
    built = true;
    renderComposer();
  }

  // Tab 决定 composer 形态：对话轨用 textarea + 技能下拉，生成轨用模板 + 槽位
  function renderComposer() {
    $("chatTabs").querySelectorAll("[data-mode]").forEach((el) => {
      el.classList.toggle("active", el.dataset.mode === mode);
    });
    $("chatGenRow").classList.toggle("hidden", mode !== "gen");
    $("chatInput").classList.toggle("hidden", mode === "gen");
    $("chatSkill").classList.toggle("hidden", mode === "gen");
    $("chatSend").textContent = mode === "gen" ? "生成" : "发送";
  }

  const SKILL_LABEL = (name) => name.replace(/^skill_/, "").replace(/_/g, " ");

  function fillSkillPicker() {
    const sel = $("chatSkill");
    const keep = sel.value;
    const skills = Agent.toolDefs().filter((t) => t.function.name.startsWith("skill_"));
    sel.innerHTML = ["<option value=\"\">自动选择工具</option>"]
      .concat(skills.map((t) => `<option value="${t.function.name}">技能 · ${escapeHtml(SKILL_LABEL(t.function.name))}</option>`))
      .join("");
    // send() 会重渲染，若不回填选中值，用户选的技能会在点发送后被抹掉
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }

  // 生成轨用模板中心的数据，用户选模板而不是打提示词
  async function fillTplPicker() {
    const sel = $("chatTpl");
    if (!tplList) {
      sel.innerHTML = '<option value="">模板加载中…</option>';
      try {
        tplList = await WB.get("Db").list("templates", {
          select: "id, name, type, platform, content, is_builtin",
          order: { col: "name", ascending: true },
          limit: 200,
        });
      } catch (e) {
        tplList = [];
        tplError = e.message || String(e);
      }
    }
    const keep = sel.value;
    sel.innerHTML = tplList.length
      ? '<option value="">选择模板</option>' +
        tplList.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")
      : `<option value="">${escapeHtml(tplError ? "模板读不到：" + tplError : "模板库为空，先去模板中心建一个")}</option>`;
    if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
  }

  // ===== 渲染 =====
  function render() {
    if (!built) build();
    const s = session();
    $("chatTitle").textContent = s.title;
    $("chatClear").textContent = pendingClear ? "确认清空？" : "清空本会话";
    $("chatList").innerHTML = sessions.map((x) => {
      const asking = pendingDel === x.id;
      const tail = asking
        ? `<span class="chat-confirm">
            <button class="btn btn-ghost btn-sm" data-delok="${x.id}">确认删</button>
            <button class="btn btn-ghost btn-sm" data-delno="1">取消</button>
          </span>`
        : `<button class="chat-item-del" data-del="${x.id}" title="删除" aria-label="删除会话">✕</button>`;
      return `<div class="chat-item ${x.id === current ? "active" : ""}${asking ? " chat-item-asking" : ""}" data-sid="${x.id}">
        <span class="chat-item-title">${escapeHtml(x.title)}</span>${tail}
      </div>`;
    }).join("");
    $("chatList").querySelectorAll("[data-sid]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("button")) return; // ✕ / 确认删 / 取消 自己处理
        pendingDel = null;
        pendingClear = false;
        current = el.dataset.sid;
        render();
      });
    });
    $("chatList").querySelectorAll("[data-del]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingDel = el.dataset.del;
        render();
      });
    });
    $("chatList").querySelectorAll("[data-delok]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingDel = null;
        sessions = sessions.filter((x) => x.id !== el.dataset.delok);
        if (!sessions.length) newSession();
        if (!sessions.some((x) => x.id === current)) current = sessions[0].id;
        save();
        render();
      });
    });
    $("chatList").querySelectorAll("[data-delno]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingDel = null;
        render();
      });
    });
    fillSkillPicker();
    renderTools();
    const st = actionState();
    renderThread(s, st);
    renderHead(st);
  }

  function clearThread() {
    if (!pendingClear) { pendingClear = true; render(); return; }
    pendingClear = false;
    const s = session();
    s.messages = [];
    s.title = "新对话";
    save();
    render();
  }

  // 能力面板：把模型能调什么、读到什么口径摊开给用户看。只读透出，不提供任何写入口。
  function renderTools() {
    const defs = Agent.toolDefs();
    const tables = Object.entries(Agent.READABLE_TABLES)
      .map(([t, cols]) => `<li><code>${escapeHtml(t)}</code><span class="chat-tool-cols">${escapeHtml(cols.join(" · "))}</span></li>`)
      .join("");
    $("chatTools").innerHTML = `
      <div class="chat-tools-title">能力面板</div>
      <div class="chat-note">共 ${defs.length} 个工具，全部只读：只会读你库里的数据，不写库、不发布。</div>
      ${defs.map((d) => {
        const isSkill = d.function.name.startsWith("skill_");
        return `<div class="chat-tool">
          <div class="chat-tool-name">${escapeHtml(d.function.name)}${isSkill ? '<span class="chat-tool-tag">技能</span>' : ""}</div>
          <div class="chat-tool-desc">${escapeHtml(d.function.description || "")}</div>
        </div>`;
      }).join("")}
      <div class="chat-tools-sub">当前可读表口径</div>
      <ul class="chat-tables">${tables}</ul>`;
  }

  // 一次渲染只读一遍网关设置：报错动作和页头提示共用
  function actionState() {
    let providers = [];
    let proxy = false;
    try {
      const g = WB.get("AiGateway");
      providers = g.getAvailableProviders();
      proxy = g.getSettings().mode === "proxy";
    } catch { providers = []; }
    return { providers, proxy, needKey: providers.length === 0 };
  }

  function renderHead(st) {
    const sub = $("chatSub");
    const hint = $("chatHint");
    if (st.needKey) {
      sub.innerHTML = `<span class="chat-warn">未配置可用的模型提供商</span> ·
        <a class="chat-link" data-page="settings">去「账号与设置」填 API Key →</a>`;
      sub.querySelector("[data-page]").addEventListener("click", () => WB.get("App").switchPage("settings"));
      hint.textContent = "需要先在设置里配置直连模式的 API Key";
      return;
    }
    const first = st.providers[0];
    sub.textContent = `${st.providers.length} 个提供商可用 · 主用 ${first.name} / ${first.model}` +
      (st.proxy ? " · 代理模式不支持工具，请切直连" : "");
    hint.textContent = `已注册 ${Agent.toolDefs().length} 个工具`;
  }

  // 步骤卡默认收起成一行摘要，展开区限 20 行 / 600 字符（agent.js 那边还限了字符）
  const STEP_LINES = 20;

  const clipStr = (s, n) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

  function stepCard(step) {
    const pre = step.ok ? "已调用" : "调用失败";
    const badge = step.ok ? "" : " chat-step-bad";
    const sum = step.ok && step.summary ? `<span class="chat-step-sum">· ${escapeHtml(step.summary)}</span>` : "";
    const body = step.error || step.preview || "";
    const lines = body.split("\n");
    const keep = lines.slice(0, STEP_LINES).join("\n");
    const more = [];
    if (lines.length > STEP_LINES) more.push(`${lines.length - STEP_LINES} 行`);
    if (step.dropped) more.push(`${step.dropped} 字符`);
    return `<div class="chat-step${badge}">
      <button class="chat-step-head" type="button" aria-expanded="false">
        <span class="chat-step-caret">▸</span> <span class="chat-step-pre">${pre}</span>
        <span class="chat-step-name">${escapeHtml(step.name)}</span>${sum}
      </button>
      <div class="chat-step-detail">
        <div class="chat-step-kv">入参</div><code>${escapeHtml(clipStr(JSON.stringify(step.args || {}), 200))}</code>
        <div class="chat-step-kv">${step.error ? "错误" : "返回"}</div><code>${escapeHtml(keep)}</code>${
          more.length ? `<div class="chat-step-more">还有 ${more.join(" / ")} 未展示</div>` : ""
        }
      </div>
    </div>`;
  }

  // 报错气泡的上下文动作：只给「当前这步就能做完」的，不引导用户去翻菜单
  function errActions(m, i, st) {
    const btn = (act, label) => `<button class="btn btn-ghost btn-sm" data-act="${act}" data-idx="${i}">${label}</button>`;
    const list = [];
    if (st.needKey) list.push(btn("key", "去设置填 Key"));
    if (st.proxy) list.push(btn("direct", "切直连模式"));
    if (m.req) list.push(btn("retry", "重试本条"));
    return list.length ? `<div class="chat-err-actions">${list.join("")}</div>` : "";
  }

  function msgNode(m, i, st) {
    if (m.role === "user") {
      return `<div class="chat-msg chat-msg-user"><div class="chat-bubble">${escapeHtml(m.content)}</div></div>`;
    }
    const steps = (m.steps || []).map(stepCard).join("");
    const body = m.error
      ? `<div class="chat-error">${escapeHtml(m.error)}</div>${errActions(m, i, st)}`
      : `<div class="chat-bubble md-preview">${md(m.content)}</div>`;
    return `<div class="chat-msg chat-msg-assistant">
      <div class="chat-avatar">AI</div>
      <div class="chat-body">${steps}${body}</div>
    </div>`;
  }

  function renderThread(s, st) {
    const thread = $("chatThread");
    if (!s.messages.length) {
      thread.innerHTML = `<div class="chat-empty">
        <div class="chat-empty-title">让它从你库里真实的数据出发</div>
        <div class="chat-empty-sub">下面的示例会调用工具查询你的选题、排期与数据</div>
        <div class="chat-samples">
          ${["这周还有哪些选题没排期？", "统计各平台已发布内容的平均互动率", "内容库里状态为“草稿”的有哪些？"]
            .map((t) => `<button class="chat-sample" data-q="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
        </div>
      </div>`;
      thread.querySelectorAll("[data-q]").forEach((b) => {
        b.addEventListener("click", () => { $("chatInput").value = b.dataset.q; $("chatInput").focus(); });
      });
      return;
    }
    thread.innerHTML = s.messages.map((m, i) => msgNode(m, i, st)).join("");
    thread.scrollTop = thread.scrollHeight;
  }

  // ===== 收发 =====
  function stop() {
    if (controller) controller.abort();
    controller = null;
  }

  async function send() {
    if (controller) return;
    if (mode === "gen") return genSend();
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text) return;
    const skill = $("chatSkill").value;
    input.value = "";
    return chatTurn(text, skill);
  }

  async function chatTurn(text, skill) {
    const s = session();
    // 停掉/报错的那轮 content 是空串，回传给 provider 会被 400，所以只带非空消息
    const history = s.messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }));
    s.messages.push({ role: "user", content: text });
    if (s.title === "新对话") s.title = text.slice(0, 22);

    // req 落库，报错气泡上的「重试本条」才知道该按哪一轨、带什么参数重跑
    const assistant = { role: "assistant", content: "", steps: [], req: { type: "chat", text, skill } };
    s.messages.push(assistant);
    render();
    // render() 已按 messages 画出空气泡，直接复用它，避免同一轮出现两个节点
    const node = document.querySelector("#chatThread .chat-msg-assistant:last-child");
    const bubble = node.querySelector(".chat-bubble");
    const body = node.querySelector(".chat-body");
    // 推理模型先吐 reasoning 再吐正文，中间可能好几秒没输出，不给提示会像卡住了
    const think = document.createElement("div");
    think.className = "chat-think hidden";
    think.textContent = "思考中…";
    body.insertBefore(think, bubble);

    controller = new AbortController();
    $("chatSend").disabled = true;
    $("chatStop").disabled = false;

    try {
      const res = await Agent.run(skill ? `（请优先使用工具 ${skill}）\n${text}` : text, {
        history,
        signal: controller.signal,
        onChunk(chunk) {
          think.classList.add("hidden");
          assistant.content += chunk;
          bubble.innerHTML = md(assistant.content);
          $("chatThread").scrollTop = $("chatThread").scrollHeight;
        },
        onReason() {
          think.classList.remove("hidden");
        },
        onStep(step) {
          assistant.steps.push(step);
          const card = document.createElement("div");
          card.innerHTML = stepCard(step);
          body.insertBefore(card.firstElementChild, think);
          $("chatThread").scrollTop = $("chatThread").scrollHeight;
        },
      });
      assistant.content = res.text || assistant.content;
    } catch (e) {
      assistant.error = e.name === "AbortError" ? "已停止" : (e.message || String(e));
    } finally {
      controller = null;
      $("chatSend").disabled = false;
      $("chatStop").disabled = true;
      save();
      render();
    }
  }

  // ===== 生成轨：固定提示词 + 槽位，一次成稿，不进工具循环 =====
  const GEN_SYSTEM = "你是全域自媒体文案生成器。严格按给定模板的结构与调性产出可直接发布的成品，只输出成品本身，不要解释。";

  function buildGenPrompt(tpl, topic) {
    const content = (tpl.content || "").replace(/\{\{\s*(title|topic|theme|subject)\s*\}\}/g, topic);
    const platform = tpl.platform && tpl.platform !== "all" ? tpl.platform : "不限";
    return `主题：${topic}\n平台：${platform}\n模板：${tpl.name}\n\n按下面模板的结构产出成品：\n${content}`;
  }

  async function genSend() {
    const tpl = (tplList || []).find((t) => t.id === $("chatTpl").value);
    const topic = $("chatGenSlot").value.trim();
    if (!tpl) { $("chatHint").textContent = tplError ? `模板库读不到：${tplError}` : "先选一个模板"; return; }
    if (!topic) { $("chatHint").textContent = "填一个主题或一句话要求"; return; }
    $("chatGenSlot").value = "";
    return genTurn(tpl.id, topic);
  }

  async function genTurn(tplId, topic) {
    const tpl = (tplList || []).find((t) => t.id === tplId);
    if (!tpl) { $("chatHint").textContent = "这个模板已不在库里，重新选一个再生成"; return; }

    const s = session();
    s.messages.push({ role: "user", content: `${tpl.name} · ${topic}` });
    if (s.title === "新对话") s.title = topic.slice(0, 22);

    const assistant = { role: "assistant", content: "", gen: true, steps: [], req: { type: "gen", tplId, topic } };
    s.messages.push(assistant);
    render();
    const bubble = document.querySelector("#chatThread .chat-msg-assistant:last-child .chat-bubble");

    controller = new AbortController();
    $("chatSend").disabled = true;
    $("chatStop").disabled = false;

    // 走老入口 stream()：它用 onChunk/onDone/onError 回调，不抛错也不返值，约定不能改
    let failed = "";
    try {
      await WB.get("AiGateway").stream(buildGenPrompt(tpl, topic), {
        system: GEN_SYSTEM,
        signal: controller.signal,
        maxTokens: 1800,
        onChunk(chunk) {
          assistant.content += chunk;
          bubble.innerHTML = md(assistant.content);
          $("chatThread").scrollTop = $("chatThread").scrollHeight;
        },
        onError(msg) { failed = msg; },
      });
      if (failed) assistant.error = failed;
    } catch (e) {
      assistant.error = e.name === "AbortError" ? "已停止" : (e.message || String(e));
    } finally {
      // stream() 吞掉 AbortError，中止只能自己认
      if (controller.signal.aborted && !assistant.error) assistant.error = "已停止";
      controller = null;
      $("chatSend").disabled = false;
      $("chatStop").disabled = true;
      save();
      render();
    }
  }

  // 报错气泡上的「重试本条」：摘掉失败的这一轮（连同它的 user 气泡），按原轨道原参数重跑
  async function retryAt(idx) {
    if (controller) return;
    const s = session();
    const req = (s.messages[idx] || {}).req;
    if (!req) return;
    const prev = s.messages[idx - 1];
    const cut = prev && prev.role === "user" ? idx - 1 : idx;
    s.messages.splice(cut, idx - cut + 1);
    save();
    if (req.type === "gen") {
      await fillTplPicker();
      return genTurn(req.tplId, req.topic);
    }
    return chatTurn(req.text, req.skill);
  }

  // saveSettings 是整体覆盖，不是合并，所以必须读出来改一处再写回
  function switchToDirect() {
    try {
      const g = WB.get("AiGateway");
      const s = g.getSettings();
      s.mode = "direct";
      g.saveSettings(s);
      render(); // renderHead() 会重写 chatHint，提示要放在它后面
      $("chatHint").textContent = "已切到直连模式，可以重试本条";
    } catch (e) {
      $("chatHint").textContent = "切换失败：" + (e.message || e);
    }
  }

  async function renderPage() {
    if (!sessions.length) load();
    render();
  }

  return { render: renderPage, send, newSession, load };
});
