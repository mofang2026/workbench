/**
 * 模板中心 · 模块
 * 类型：排版模板/结尾模板/互动引导/免责声明/标题公式/标签组合
 * 功能：CRUD + 分类筛选 + 一键复制 + 内置模板
 */

const Templates = (function () {
  const TYPES = {
    layout: { name: "排版模板", icon: "📐" },
    ending: { name: "结尾模板", icon: "🔚" },
    cta: { name: "互动引导", icon: "💬" },
    disclaimer: { name: "免责声明", icon: "⚠️" },
    title_formula: { name: "标题公式", icon: "🏷️" },
    tag_combo: { name: "标签组合", icon: "#️⃣" },
  };

  const PLATFORMS = { xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条", all: "通用" };

  let cache = [];
  let filterType = "all";
  let filterPlatform = "all";
  let filterBuiltin = "all"; // all | builtin | custom

  async function render() {
    const wrap = $("page-templates");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">TEMPLATES · 模板中心</p>
        <h1>模板中心</h1>
        <p class="sub">八大平台排版 · 复用素材 · 标题公式 · 标签组合</p>
      </div>

      <div class="card mb-md">
        <div class="row gap-md" style="flex-wrap:wrap;">
          <div class="row gap-sm">
            <span class="text-xs muted">类型</span>
            <select id="tFilterType" class="select" style="width:auto;">
              <option value="all">全部</option>
              ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join("")}
            </select>
          </div>
          <div class="row gap-sm">
            <span class="text-xs muted">平台</span>
            <select id="tFilterPlatform" class="select" style="width:auto;">
              <option value="all">全部</option>
              ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}
            </select>
          </div>
          <div class="row gap-sm">
            <span class="text-xs muted">来源</span>
            <select id="tFilterBuiltin" class="select" style="width:auto;">
              <option value="all">全部</option>
              <option value="builtin">内置</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <button class="btn btn-warm btn-sm" id="btnAiGenTemplate" style="margin-left:auto;">AI 生成模板</button>
          <button class="btn btn-primary" id="btnNewTemplate">+ 新建模板</button>
        </div>
      </div>

      <div id="templateList"></div>
    `;

    $("tFilterType").addEventListener("change", (e) => { filterType = e.target.value; renderList(); });
    $("tFilterPlatform").addEventListener("change", (e) => { filterPlatform = e.target.value; renderList(); });
    $("tFilterBuiltin").addEventListener("change", (e) => { filterBuiltin = e.target.value; renderList(); });
    $("btnNewTemplate").addEventListener("click", () => openEditor(null));
    $("btnAiGenTemplate").addEventListener("click", openAiGenModal);

    await loadList();
  }

  async function loadList() {
    try {
      cache = await window.Db.list("templates", {
        select: "id, name, type, platform, content, description, is_builtin, user_id",
        order: { col: "name", ascending: true },
        limit: 500,
      });
      renderList();
    } catch (e) {
      $("templateList").innerHTML = `<div class="card empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function renderList() {
    const wrap = $("templateList");
    let list = cache;

    if (filterType !== "all") list = list.filter(t => t.type === filterType);
    if (filterPlatform !== "all") list = list.filter(t => t.platform === filterPlatform || t.platform === "all");
    if (filterBuiltin === "builtin") list = list.filter(t => t.is_builtin);
    if (filterBuiltin === "custom") list = list.filter(t => !t.is_builtin);

    if (list.length === 0) {
      wrap.innerHTML = `
        <div class="card empty-state">
          <div class="em-icon">📋</div>
          <div>${cache.length === 0 ? "还没有模板，点击「新建模板」创建" : "没有符合条件的模板"}</div>
        </div>`;
      return;
    }

    // 按类型分组
    const grouped = {};
    list.forEach(t => {
      const k = t.type;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(t);
    });

    wrap.innerHTML = Object.entries(grouped).map(([type, items]) => {
      const tInfo = TYPES[type] || { name: type, icon: "📦" };
      return `
        <div class="card mb-md">
          <div class="card-title">
            <span>${tInfo.icon} ${tInfo.name}</span>
            <span class="text-xs muted">${items.length} 个</span>
          </div>
          <div class="grid grid-2">
            ${items.map(t => `
              <div class="list-item" data-id="${t.id}">
                <div class="list-item-head">
                  <div class="list-item-title">${escapeHtml(t.name)}</div>
                  <div class="row gap-xs">
                    ${t.is_builtin ? `<span class="tag">内置</span>` : `<span class="tag brand">自定义</span>`}
                    <span class="tag">${PLATFORMS[t.platform] || t.platform || "通用"}</span>
                  </div>
                </div>
                ${t.description ? `<div class="text-xs muted mb-sm">${escapeHtml(t.description)}</div>` : ""}
                <div class="template-preview">${escapeHtml((t.content || "").slice(0, 150))}${(t.content || "").length > 150 ? "..." : ""}</div>
                <div class="list-item-meta">
                  <button class="btn btn-ghost btn-sm" data-copy="${t.id}">复制</button>
                  <button class="btn btn-warm btn-sm" data-apply="${t.id}">AI 套用</button>
                  ${!t.is_builtin ? `<button class="btn btn-ghost btn-sm" data-edit="${t.id}">编辑</button>` : ""}
                  ${!t.is_builtin ? `<button class="btn btn-ghost btn-sm text-danger" data-del="${t.id}">删除</button>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll("[data-copy]").forEach(el => {
      el.addEventListener("click", () => copyTemplate(el.dataset.copy));
    });
    wrap.querySelectorAll("[data-apply]").forEach(el => {
      el.addEventListener("click", () => openApplyModal(el.dataset.apply));
    });
    wrap.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", () => openEditor(cache.find(t => t.id === el.dataset.edit)));
    });
    wrap.querySelectorAll("[data-del]").forEach(el => {
      el.addEventListener("click", async () => {
        const ok = await confirm("确定删除该模板？");
        if (!ok) return;
        await window.Db.remove("templates", el.dataset.del);
        toast("已删除");
        await loadList();
      });
    });
  }

  function copyTemplate(id) {
    const t = cache.find(x => x.id === id);
    if (!t) return;
    navigator.clipboard.writeText(t.content || "").then(() => {
      toast("模板已复制到剪贴板");
    }).catch(() => {
      toast("复制失败");
    });
  }

  function openEditor(template) {
    const isEdit = !!template;
    const t = template || {
      name: "",
      type: "layout",
      platform: "all",
      content: "",
      description: "",
      is_builtin: false,
    };

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑模板" : "新建模板"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">类型 *</label>
          <select id="tType" class="select">
            ${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${t.type === k ? "selected" : ""}>${v.icon} ${v.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">适用平台</label>
          <select id="tPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${t.platform === k ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">模板名称 *</label>
        <input id="tName" class="input" value="${escapeAttr(t.name)}" placeholder="如：小红书干货模板" />
      </div>
      <div class="field">
        <label class="field-label">描述</label>
        <input id="tDesc" class="input" value="${escapeAttr(t.description || "")}" placeholder="模板用途说明" />
      </div>
      <div class="field">
        <label class="field-label">模板内容 * <span class="text-xs muted-2">（支持占位符 {{var}}）</span></label>
        <textarea id="tContent" class="textarea" rows="10" placeholder="模板正文...">${escapeHtml(t.content || "")}</textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveTemplate">保存</button>
      </div>
    `);

    $("btnSaveTemplate").addEventListener("click", () => save(isEdit ? t.id : null));
  }

  async function save(id) {
    const payload = {
      name: $("tName").value.trim(),
      type: $("tType").value,
      platform: $("tPlatform").value,
      content: $("tContent").value,
      description: $("tDesc").value.trim(),
      is_builtin: false,
    };
    if (!payload.name || !payload.content) {
      toast("请填写名称和内容");
      return;
    }
    try {
      if (id) {
        await window.Db.update("templates", id, payload);
      } else {
        await window.Db.create("templates", payload);
      }
      toast("已保存");
      closeModal();
      await loadList();
    } catch (e) {
      toast("保存失败: " + e.message);
    }
  }

  // ========== AI 一键生成模板 ==========

  function openAiGenModal() {
    showModal(`
      <div class="modal-head">
        <h3>AI 生成模板</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">选择类型和平台，输入赛道/主题，AI 自动生成结构化模板并入库</p>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">模板类型 *</label>
          <select id="gType" class="select">
            ${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">适用平台</label>
          <select id="gPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${k === "all" ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">赛道/主题 *</label>
        <input id="gTrack" class="input" placeholder="如：职场干货、育儿知识、美食探店、科技测评" />
      </div>
      <div class="field">
        <label class="field-label">补充要求（可选）</label>
        <input id="gExtra" class="input" placeholder="如：偏轻松幽默、要有数据支撑、带 emoji..." />
      </div>
      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnDoGenTemplate">生成并入库</button>
        <span id="gStatus" class="text-xs muted"></span>
      </div>
      <div id="gResult"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);
    $("btnDoGenTemplate").addEventListener("click", doAiGenerate);
  }

  async function doAiGenerate() {
    const type = $("gType").value;
    const platform = $("gPlatform").value;
    const track = $("gTrack").value.trim();
    const extra = $("gExtra").value.trim();
    if (!track) { toast("请填写赛道/主题"); return; }

    const status = $("gStatus");
    const result = $("gResult");
    const typeInfo = TYPES[type];
    const platformLabel = PLATFORMS[platform] || "通用";

    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 正在生成模板...</span>';
    result.innerHTML = "";

    try {
      const prompt = `你是自媒体模板设计专家。请生成一个高质量的${typeInfo.name}模板。\n\n类型：${typeInfo.name}\n适用平台：${platformLabel}\n赛道/主题：${track}\n补充要求：${extra || "无"}\n\n要求：\n1. 模板内容要结构化，包含占位符 {{title}}、{{topic}}、{{key_point}} 等可替换变量\n2. 符合${platformLabel}平台的内容调性和排版习惯\n3. 实用、可直接套用\n\n严格按以下 JSON 格式输出：\n${JSON.stringify({
        name: "模板名称",
        description: "模板用途说明",
        content: "模板正文（含占位符）",
      }, null, 2)}\n\n只输出 JSON。`;

      const text = await window.AiGateway.generate(prompt, {
        system: "你是自媒体模板设计专家，擅长为不同平台设计可复用的结构化模板。",
        maxTokens: 1500,
      });
      const parsed = tryParseJson(text);

      if (!parsed || !parsed.content) {
        status.innerHTML = '<span class="text-danger">生成失败，请重试</span>';
        return;
      }

      // 入库
      const saved = await window.Db.create("templates", {
        name: parsed.name || `${track}-${typeInfo.name}`,
        type,
        platform,
        content: parsed.content,
        description: parsed.description || "",
        is_builtin: false,
      });

      status.innerHTML = '<span class="text-ok">✓ 模板已生成并入库</span>';
      result.innerHTML = `
        <div class="rec-item">
          <span class="rec-heat heat-high">✓</span>
          <div class="rec-body">
            <div class="rec-title">${escapeHtml(saved.name)}</div>
            ${saved.description ? `<div class="rec-desc">${escapeHtml(saved.description)}</div>` : ""}
            <div class="revised-preview">${escapeHtml(saved.content)}</div>
          </div>
        </div>
      `;
      toast("模板已生成并入库");
      await loadList();
    } catch (e) {
      status.innerHTML = `<span class="text-danger">生成失败: ${escapeHtml(e.message)}</span>`;
    }
  }

  // ========== AI 智能套用模板 ==========

  function openApplyModal(templateId) {
    const t = cache.find(x => x.id === templateId);
    if (!t) return;

    // 提取占位符
    const placeholders = [...new Set((t.content.match(/\{\{(\w+)\}\}/g) || []).map(m => m.replace(/\{\{|}}/g, "")))];

    showModal(`
      <div class="modal-head">
        <h3>AI 智能套用模板</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="mb-md">
        <div class="text-sm" style="font-weight:600;">${escapeHtml(t.name)}</div>
        ${t.description ? `<div class="text-xs muted mt-xs">${escapeHtml(t.description)}</div>` : ""}
      </div>

      ${placeholders.length > 0 ? `
        <div class="field">
          <label class="field-label">模板变量（可手动填写，留空则 AI 自动填充）</label>
          ${placeholders.map(p => `
            <div class="row gap-sm mb-sm">
              <span class="text-xs muted" style="min-width:100px;">{{${p}}}</span>
              <input class="input tpl-var" data-var="${p}" placeholder="填写或留空让 AI 填充" />
            </div>
          `).join("")}
        </div>
      ` : `<p class="text-xs muted mb-md">该模板无占位符，可直接预览效果</p>`}

      <div class="field">
        <label class="field-label">内容主题/简述（用于 AI 填充变量）</label>
        <input id="applyTopic" class="input" placeholder="如：如何高效学习一门新技能" />
      </div>

      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnDoApply">AI 填充并预览</button>
        <button class="btn btn-ghost btn-sm hidden" id="btnCopyResult">复制结果</button>
      </div>
      <div id="applyResult"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);

    let lastResult = "";
    $("btnDoApply").addEventListener("click", () => doApplyTemplate(t, placeholders, (r) => { lastResult = r; }));
    const btnCopy = $("btnCopyResult");
    if (btnCopy) {
      btnCopy.addEventListener("click", () => {
        navigator.clipboard.writeText(lastResult).then(() => toast("已复制套用结果"));
      });
    }
  }

  async function doApplyTemplate(t, placeholders, onResult) {
    const topic = $("applyTopic").value.trim();
    const manualVars = {};
    document.querySelectorAll(".tpl-var").forEach(el => {
      const v = el.value.trim();
      if (v) manualVars[el.dataset.var] = v;
    });

    // 是否需要 AI 填充
    const emptyVars = placeholders.filter(p => !manualVars[p]);
    const result = $("applyResult");
    const btn = $("btnDoApply");

    if (emptyVars.length === 0) {
      // 全部手动填写，直接替换
      let filled = t.content;
      Object.entries(manualVars).forEach(([k, v]) => {
        filled = filled.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });
      showApplyResult(filled);
      onResult(filled);
      return;
    }

    if (!topic && emptyVars.length > 0) {
      toast("请填写内容主题，或手动填写所有变量");
      return;
    }

    btn.disabled = true;
    btn.textContent = "AI 填充中...";
    result.innerHTML = '<div class="ai-thinking"><span class="spinner"></span> AI 正在填充变量...</div>';

    try {
      const prompt = `请根据模板和主题，填充模板中的占位符变量。\n\n模板：${t.content}\n\n主题：${topic}\n\n需要填充的变量：${emptyVars.join(", ")}\n已填写的变量：${Object.entries(manualVars).map(([k, v]) => `${k}=${v}`).join(", ") || "无"}\n\n请输出填充后的完整模板内容，保留原有结构和格式，只替换占位符部分。\n直接输出填充后的内容，不要其他说明。`;

      const text = await window.AiGateway.generate(prompt, {
        system: "你是内容创作助手，擅长根据主题填充模板变量，保持模板结构不变。",
        maxTokens: 1500,
      });

      let filled = text.trim();
      // 如果 AI 输出仍含占位符，用手动值补充替换
      Object.entries(manualVars).forEach(([k, v]) => {
        filled = filled.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      });

      showApplyResult(filled);
      onResult(filled);
      $("btnCopyResult").classList.remove("hidden");
    } catch (e) {
      result.innerHTML = `<div class="text-danger">填充失败: ${escapeHtml(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "AI 填充并预览";
    }
  }

  function showApplyResult(content) {
    let html = `<pre>${escapeHtml(content)}</pre>`;
    try {
      if (window.marked) {
        window.marked.setOptions({ breaks: true, gfm: true });
        html = window.marked.parse(content);
      }
    } catch (e) {}
    $("applyResult").innerHTML = `
      <div class="field">
        <label class="field-label">套用结果</label>
        <div class="md-preview" style="min-height:120px;">${html}</div>
      </div>
    `;
  }

  // ========== 按赛道推荐模板 ==========

  async function recommendByTrack(track, platform) {
    if (!cache || cache.length === 0) return [];
    let list = cache;
    if (platform && platform !== "all") {
      list = list.filter(t => t.platform === platform || t.platform === "all");
    }
    // 简单匹配：名称/描述/内容包含赛道关键词
    const kw = track.toLowerCase();
    const matched = list.filter(t => {
      const txt = `${t.name || ""} ${t.description || ""} ${t.content || ""}`.toLowerCase();
      return txt.includes(kw);
    });
    return matched.slice(0, 5);
  }

  return { render, loadList, recommendByTrack };
})();

window.Templates = Templates;
