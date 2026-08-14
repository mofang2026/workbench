/**
 * 卡片设计引擎 · 独立模块
 * - 18 套预设卡片模板（金句卡/数据卡/封面图/清单卡/对比卡/倒计时卡等）
 * - 在线编辑（标题/正文/配色/背景）
 * - 导出 PNG（html2canvas）+ 复制 HTML
 */

const CardDesign = (function () {
  // 18 套模板
  const TEMPLATES = [
    { id: "quote-dark", name: "金句卡·暗夜", cat: "金句", layout: "quote", bg: "linear-gradient(135deg,#0f172a,#1e293b)", color: "#e2e8f0", accent: "#59c4ff" },
    { id: "quote-warm", name: "金句卡·暖阳", cat: "金句", layout: "quote", bg: "linear-gradient(135deg,#7c2d12,#ea580c)", color: "#fff7ed", accent: "#fde68a" },
    { id: "quote-ink", name: "金句卡·水墨", cat: "金句", layout: "quote", bg: "linear-gradient(135deg,#1c1917,#44403c)", color: "#fafaf9", accent: "#fbbf24" },
    { id: "data-blue", name: "数据卡·科技蓝", cat: "数据", layout: "data", bg: "linear-gradient(135deg,#0c4a6e,#0891b2)", color: "#e0f2fe", accent: "#67e8f9" },
    { id: "data-green", name: "数据卡·财富绿", cat: "数据", layout: "data", bg: "linear-gradient(135deg,#14532d,#16a34a)", color: "#f0fdf4", accent: "#86efac" },
    { id: "data-purple", name: "数据卡·梦幻紫", cat: "数据", layout: "data", bg: "linear-gradient(135deg,#4c1d95,#7c3aed)", color: "#f5f3ff", accent: "#c4b5fd" },
    { id: "cover-xhs", name: "封面图·小红书", cat: "封面", layout: "cover", bg: "linear-gradient(135deg,#ff2442,#ff6b8a)", color: "#ffffff", accent: "#fff0f3" },
    { id: "cover-douyin", name: "封面图·抖音", cat: "封面", layout: "cover", bg: "linear-gradient(135deg,#161823,#25f4ee)", color: "#ffffff", accent: "#25f4ee" },
    { id: "cover-bili", name: "封面图·B站", cat: "封面", layout: "cover", bg: "linear-gradient(135deg,#1a1a2e,#fb7299)", color: "#ffffff", accent: "#fb7299" },
    { id: "list-num", name: "清单卡·数字", cat: "清单", layout: "list", bg: "linear-gradient(135deg,#0f766e,#14b8a6)", color: "#f0fdfa", accent: "#5eead4" },
    { id: "list-check", name: "清单卡·勾选", cat: "清单", layout: "list", bg: "linear-gradient(135deg,#1e3a8a,#3b82f6)", color: "#eff6ff", accent: "#93c5fd" },
    { id: "list-warm", name: "清单卡·暖色", cat: "清单", layout: "list", bg: "linear-gradient(135deg,#7c2d12,#f59e0b)", color: "#fffbeb", accent: "#fcd34d" },
    { id: "contrast-split", name: "对比卡·左右分屏", cat: "对比", layout: "contrast", bg: "linear-gradient(135deg,#0f172a,#334155)", color: "#e2e8f0", accent: "#f87171" },
    { id: "contrast-yinyang", name: "对比卡·黑白", cat: "对比", layout: "contrast", bg: "linear-gradient(135deg,#000000,#374151)", color: "#f9fafb", accent: "#ffffff" },
    { id: "countdown", name: "倒计时卡", cat: "倒计时", layout: "countdown", bg: "linear-gradient(135deg,#831843,#be123c)", color: "#fff1f2", accent: "#fda4af" },
    { id: "gradient-rainbow", name: "渐变卡·彩虹", cat: "渐变", layout: "quote", bg: "linear-gradient(135deg,#7c3aed,#ec4899,#f59e0b)", color: "#ffffff", accent: "#fef3c7" },
    { id: "gradient-aurora", name: "渐变卡·极光", cat: "渐变", layout: "quote", bg: "linear-gradient(135deg,#065f46,#0891b2,#1e40af)", color: "#ecfeff", accent: "#a7f3d0" },
    { id: "minimal-white", name: "极简卡·纯白", cat: "极简", layout: "quote", bg: "linear-gradient(135deg,#ffffff,#f3f4f6)", color: "#111827", accent: "#111827" },
  ];

  let currentTemplate = TEMPLATES[0];
  let currentData = { title: "金句标题", body: "在这里输入正文内容，支持多行显示。", items: ["要点一", "要点二", "要点三"], dataNum: "9999+", dataLabel: "累计阅读", leftTitle: "之前", leftBody: "拖延、焦虑、低效", rightTitle: "之后", rightBody: "自律、专注、高效", countdownNum: "7", countdownUnit: "天" };

  async function render() {
    const wrap = $("page-card-design");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">CARD · 卡片设计引擎</p>
        <h1>卡片设计引擎</h1>
        <p class="sub">18 套模板 · 在线编辑 · 一键导出 PNG</p>
      </div>

      <div class="card-design-layout">
        <!-- 左侧：模板选择 -->
        <div class="cd-sidebar">
          <div class="cd-sidebar-head">
            <input id="cdSearch" class="input" placeholder="搜索模板..." />
          </div>
          <div class="cd-cat-tabs" id="cdCats"></div>
          <div class="cd-tpl-list" id="cdTplList"></div>
        </div>

        <!-- 中间：预览区 -->
        <div class="cd-main">
          <div class="cd-toolbar">
            <button class="btn btn-primary btn-sm" id="btnCdExport">导出 PNG</button>
            <button class="btn btn-ghost btn-sm" id="btnCdCopyHtml">复制 HTML</button>
            <button class="btn btn-ghost btn-sm" id="btnCdReset">重置内容</button>
          </div>
          <div class="cd-preview-wrap">
            <div id="cdPreview" class="cd-preview"></div>
          </div>
        </div>

        <!-- 右侧：编辑面板 -->
        <div class="cd-editor" id="cdEditor"></div>
      </div>
    `;

    renderCategories();
    renderTemplateList("");
    renderEditor();
    renderPreview();

    $("cdSearch").addEventListener("input", (e) => renderTemplateList(e.target.value));
    $("btnCdExport").addEventListener("click", exportPng);
    $("btnCdCopyHtml").addEventListener("click", copyHtml);
    $("btnCdReset").addEventListener("click", resetData);
  }

  function renderCategories() {
    const cats = ["全部", ...[...new Set(TEMPLATES.map(t => t.cat))]];
    $("cdCats").innerHTML = cats.map((c, i) => `
      <button class="cd-cat-tab ${i === 0 ? "active" : ""}" data-cat="${c}">${c}</button>
    `).join("");
    $("cdCats").querySelectorAll(".cd-cat-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $("cdCats").querySelectorAll(".cd-cat-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderTemplateList($("cdSearch").value, btn.dataset.cat);
      });
    });
  }

  function renderTemplateList(keyword, cat) {
    const kw = (keyword || "").toLowerCase();
    const list = TEMPLATES.filter(t => {
      const matchKw = !kw || t.name.toLowerCase().includes(kw) || t.cat.toLowerCase().includes(kw);
      const matchCat = !cat || cat === "全部" || t.cat === cat;
      return matchKw && matchCat;
    });
    $("cdTplList").innerHTML = list.map(t => `
      <div class="cd-tpl-item ${t.id === currentTemplate.id ? "active" : ""}" data-id="${t.id}">
        <div class="cd-tpl-thumb" style="background:${t.bg};">
          <span style="color:${t.color}; font-size:10px;">${t.cat}</span>
        </div>
        <div class="cd-tpl-name">${escapeHtml(t.name)}</div>
      </div>
    `).join("");
    $("cdTplList").querySelectorAll(".cd-tpl-item").forEach(el => {
      el.addEventListener("click", () => {
        currentTemplate = TEMPLATES.find(t => t.id === el.dataset.id);
        renderTemplateList(kw, cat);
        renderEditor();
        renderPreview();
      });
    });
  }

  function renderEditor() {
    const t = currentTemplate;
    const d = currentData;
    const editor = $("cdEditor");
    const common = `
      <div class="field">
        <label class="field-label">标题</label>
        <input id="edTitle" class="input" value="${escapeAttr(d.title)}" />
      </div>
      <div class="field">
        <label class="field-label">背景渐变</label>
        <input id="edBg" class="input" value="${escapeAttr(t.bg)}" />
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">文字色</label>
          <input id="edColor" class="input" type="color" value="${t.color.startsWith("#") ? t.color : "#ffffff"}" />
        </div>
        <div class="field">
          <label class="field-label">强调色</label>
          <input id="edAccent" class="input" type="color" value="${t.accent.startsWith("#") ? t.accent : "#59c4ff"}" />
        </div>
      </div>
    `;

    let layoutFields = "";
    if (t.layout === "quote") {
      layoutFields = `
        <div class="field">
          <label class="field-label">正文</label>
          <textarea id="edBody" class="textarea" rows="4">${escapeHtml(d.body)}</textarea>
        </div>
      `;
    } else if (t.layout === "data") {
      layoutFields = `
        <div class="field">
          <label class="field-label">数据数值</label>
          <input id="edDataNum" class="input" value="${escapeAttr(d.dataNum)}" />
        </div>
        <div class="field">
          <label class="field-label">数据标签</label>
          <input id="edDataLabel" class="input" value="${escapeAttr(d.dataLabel)}" />
        </div>
        <div class="field">
          <label class="field-label">补充正文</label>
          <textarea id="edBody" class="textarea" rows="3">${escapeHtml(d.body)}</textarea>
        </div>
      `;
    } else if (t.layout === "cover") {
      layoutFields = `
        <div class="field">
          <label class="field-label">大标题</label>
          <input id="edTitle" class="input" value="${escapeAttr(d.title)}" />
        </div>
        <div class="field">
          <label class="field-label">副标题</label>
          <input id="edBody" class="input" value="${escapeAttr(d.body)}" />
        </div>
      `;
    } else if (t.layout === "list") {
      layoutFields = `
        <div class="field">
          <label class="field-label">标题</label>
          <input id="edTitle" class="input" value="${escapeAttr(d.title)}" />
        </div>
        <div class="field">
          <label class="field-label">清单项（每行一项）</label>
          <textarea id="edItems" class="textarea" rows="5">${escapeHtml(d.items.join("\n"))}</textarea>
        </div>
      `;
    } else if (t.layout === "contrast") {
      layoutFields = `
        <div class="grid grid-2">
          <div class="field">
            <label class="field-label">左侧标题</label>
            <input id="edLeftTitle" class="input" value="${escapeAttr(d.leftTitle)}" />
          </div>
          <div class="field">
            <label class="field-label">右侧标题</label>
            <input id="edRightTitle" class="input" value="${escapeAttr(d.rightTitle)}" />
          </div>
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label class="field-label">左侧内容</label>
            <textarea id="edLeftBody" class="textarea" rows="2">${escapeHtml(d.leftBody)}</textarea>
          </div>
          <div class="field">
            <label class="field-label">右侧内容</label>
            <textarea id="edRightBody" class="textarea" rows="2">${escapeHtml(d.rightBody)}</textarea>
          </div>
        </div>
      `;
    } else if (t.layout === "countdown") {
      layoutFields = `
        <div class="field">
          <label class="field-label">标题</label>
          <input id="edTitle" class="input" value="${escapeAttr(d.title)}" />
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label class="field-label">数字</label>
            <input id="edCountdownNum" class="input" value="${escapeAttr(d.countdownNum)}" />
          </div>
          <div class="field">
            <label class="field-label">单位</label>
            <input id="edCountdownUnit" class="input" value="${escapeAttr(d.countdownUnit)}" />
          </div>
        </div>
        <div class="field">
          <label class="field-label">补充正文</label>
          <textarea id="edBody" class="textarea" rows="2">${escapeHtml(d.body)}</textarea>
        </div>
      `;
    }

    editor.innerHTML = `
      <div class="cd-editor-head">
        <span class="text-sm" style="font-weight:600;">编辑面板</span>
        <span class="tag">${t.name}</span>
      </div>
      ${layoutFields}
      ${common}
    `;

    // 绑定输入事件
    editor.querySelectorAll("[id^='ed']").forEach(el => {
      el.addEventListener("input", () => {
        readEditor();
        renderPreview();
      });
    });
  }

  function readEditor() {
    const get = (id) => { const el = $(id); return el ? el.value : ""; };
    currentData.title = get("edTitle") || currentData.title;
    currentData.body = get("edBody") !== undefined ? get("edBody") : currentData.body;
    if ($("edItems")) currentData.items = $("edItems").value.split("\n").filter(Boolean);
    if ($("edDataNum")) currentData.dataNum = $("edDataNum").value;
    if ($("edDataLabel")) currentData.dataLabel = $("edDataLabel").value;
    if ($("edLeftTitle")) currentData.leftTitle = $("edLeftTitle").value;
    if ($("edLeftBody")) currentData.leftBody = $("edLeftBody").value;
    if ($("edRightTitle")) currentData.rightTitle = $("edRightTitle").value;
    if ($("edRightBody")) currentData.rightBody = $("edRightBody").value;
    if ($("edCountdownNum")) currentData.countdownNum = $("edCountdownNum").value;
    if ($("edCountdownUnit")) currentData.countdownUnit = $("edCountdownUnit").value;
    if ($("edBg")) currentTemplate.bg = $("edBg").value;
    if ($("edColor")) currentTemplate.color = $("edColor").value;
    if ($("edAccent")) currentTemplate.accent = $("edAccent").value;
  }

  function renderPreview() {
    const t = currentTemplate;
    const d = currentData;
    const pv = $("cdPreview");
    if (!pv) return;

    let inner = "";
    if (t.layout === "quote") {
      inner = `<div class="card-tpl-quote">
        <div class="card-tpl-mark" style="color:${t.accent};">"</div>
        <h2 class="card-tpl-title">${escapeHtml(d.title)}</h2>
        <p class="card-tpl-body">${escapeHtml(d.body)}</p>
      </div>`;
    } else if (t.layout === "data") {
      inner = `<div class="card-tpl-data">
        <div class="card-tpl-datanum" style="color:${t.accent};">${escapeHtml(d.dataNum)}</div>
        <div class="card-tpl-datalabel">${escapeHtml(d.dataLabel)}</div>
        <p class="card-tpl-body" style="margin-top:16px;">${escapeHtml(d.body)}</p>
      </div>`;
    } else if (t.layout === "cover") {
      inner = `<div class="card-tpl-cover">
        <h1 class="card-tpl-cover-title">${escapeHtml(d.title)}</h1>
        <p class="card-tpl-cover-sub">${escapeHtml(d.body)}</p>
        <div class="card-tpl-cover-tag" style="background:${t.accent}; color:${t.bg.includes("fff") || t.bg.includes("FFFF") ? "#111" : "#fff"};">关注了解更多</div>
      </div>`;
    } else if (t.layout === "list") {
      inner = `<div class="card-tpl-list">
        <h2 class="card-tpl-title">${escapeHtml(d.title)}</h2>
        ${d.items.map((item, i) => `
          <div class="card-tpl-list-item">
            <span class="card-tpl-list-num" style="background:${t.accent}; color:${t.bg.includes("fff") || t.bg.includes("FFFF") ? "#111" : "#fff"};">${i + 1}</span>
            <span>${escapeHtml(item)}</span>
          </div>
        `).join("")}
      </div>`;
    } else if (t.layout === "contrast") {
      inner = `<div class="card-tpl-contrast">
        <div class="card-tpl-contrast-left">
          <div class="card-tpl-contrast-title">${escapeHtml(d.leftTitle)}</div>
          <p>${escapeHtml(d.leftBody)}</p>
        </div>
        <div class="card-tpl-contrast-divider" style="background:${t.accent};">VS</div>
        <div class="card-tpl-contrast-right">
          <div class="card-tpl-contrast-title" style="color:${t.accent};">${escapeHtml(d.rightTitle)}</div>
          <p>${escapeHtml(d.rightBody)}</p>
        </div>
      </div>`;
    } else if (t.layout === "countdown") {
      inner = `<div class="card-tpl-countdown">
        <h2 class="card-tpl-title">${escapeHtml(d.title)}</h2>
        <div class="card-tpl-cd-num" style="color:${t.accent};">${escapeHtml(d.countdownNum)}</div>
        <div class="card-tpl-cd-unit">${escapeHtml(d.countdownUnit)}</div>
        <p class="card-tpl-body" style="margin-top:12px;">${escapeHtml(d.body)}</p>
      </div>`;
    }

    pv.style.background = t.bg;
    pv.style.color = t.color;
    pv.innerHTML = inner;
  }

  function resetData() {
    currentData = { title: "金句标题", body: "在这里输入正文内容，支持多行显示。", items: ["要点一", "要点二", "要点三"], dataNum: "9999+", dataLabel: "累计阅读", leftTitle: "之前", leftBody: "拖延、焦虑、低效", rightTitle: "之后", rightBody: "自律、专注、高效", countdownNum: "7", countdownUnit: "天" };
    renderEditor();
    renderPreview();
    toast("已重置内容");
  }

  async function exportPng() {
    const node = $("cdPreview");
    if (!node) return;
    toast("正在生成 PNG...");
    try {
      // 动态加载 html2canvas
      if (!window.html2canvas) {
        await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
      }
      const canvas = await window.html2canvas(node, { scale: 2, backgroundColor: null, useCORS: true });
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `card-${currentTemplate.id}-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast("已导出 PNG");
      });
    } catch (e) {
      toast("导出失败: " + e.message);
    }
  }

  async function copyHtml() {
    const node = $("cdPreview");
    if (!node) return;
    const html = node.outerHTML;
    const style = `background:${currentTemplate.bg};color:${currentTemplate.color};`;
    const full = `<div style="${style} padding:32px; border-radius:16px; max-width:420px;">${node.innerHTML}</div>`;
    try {
      await navigator.clipboard.writeText(full);
      toast("已复制 HTML，可粘贴到编辑器");
    } catch (e) {
      toast("复制失败: " + e.message);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  return { render };
})();

window.CardDesign = CardDesign;
