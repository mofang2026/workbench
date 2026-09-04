/**
 * 平台规则库 + 质检清单模板 · 模块
 * 功能：四平台合规规则查看 + 质检清单模板管理
 */

WB.define("Rules", ["Db"], (Db) => {
  const Rules = (function () {
  const PLATFORMS = { xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条" };
  const CATEGORIES = ["封面", "标题", "标签", "敏感词", "排版", "时长", "字幕", "图片", "简介"];
  const RISK_COLORS = { info: "tag", warning: "tag warn", danger: "tag danger" };
  const RISK_LABELS = { info: "提示", warning: "警告", danger: "危险" };

  let rulesCache = [];
  let qaCache = [];
  let activePlatform = "xhs";

  async function render() {
    const wrap = $("page-rules");
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">RULES · 平台规则与质检</p>
        <h1>平台规则库</h1>
        <p class="sub">八大平台最新合规规则 · 质检清单模板</p>
      </div>

      <!-- 平台切换 -->
      <div class="tab-bar mb-md" id="platformTabs">
        ${Object.entries(PLATFORMS).map(([k, n]) => `
          <button class="tab ${k === activePlatform ? "active" : ""}" data-pf="${k}">${n}</button>
        `).join("")}
      </div>

      <div class="grid grid-2">
        <!-- 规则列表 -->
        <div class="card">
          <div class="card-title">
            <span>合规规则</span>
            <span class="text-xs muted" id="ruleCount"></span>
          </div>
          <div id="ruleList"></div>
        </div>

        <!-- 质检清单 -->
        <div class="card">
          <div class="card-title">
            <span>质检清单模板</span>
            <span class="text-xs muted">发布前必检项</span>
          </div>
          <div id="qaList"></div>
        </div>
      </div>
    `;

    // 平台切换
    wrap.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => {
        activePlatform = el.dataset.pf;
        wrap.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.pf === activePlatform));
        renderRules();
        renderQa();
      });
    });

    await loadData();
  }

  async function loadData() {
    try {
      const [rules, qa] = await Promise.all([
        Db.list("platform_rules", { order: { col: "category", ascending: true }, limit: 500 }),
        Db.list("qa_checklist_templates", { order: { col: "sort_order", ascending: true }, limit: 500 }),
      ]);
      rulesCache = rules;
      qaCache = qa;
      renderRules();
      renderQa();
    } catch (e) {
      $("ruleList").innerHTML = `<div class="text-danger text-sm">加载失败: ${e.message}</div>`;
      $("qaList").innerHTML = `<div class="text-danger text-sm">加载失败: ${e.message}</div>`;
    }
  }

  function renderRules() {
    const wrap = $("ruleList");
    const list = rulesCache.filter(r => r.platform === activePlatform);
    $("ruleCount").textContent = `${list.length} 条`;

    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="em-icon">📜</div><div>暂无规则，请先执行 seed.sql</div></div>`;
      return;
    }

    // 按分类分组
    const grouped = {};
    list.forEach(r => {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r);
    });

    wrap.innerHTML = Object.entries(grouped).map(([cat, items]) => `
      <div class="mb-md">
        <div class="text-xs muted-2 mb-sm" style="font-weight:600;">${escapeHtml(cat)}</div>
        ${items.map(r => `
          <div class="rule-item">
            <span class="${RISK_COLORS[r.risk_level] || "tag"}">${RISK_LABELS[r.risk_level] || r.risk_level}</span>
            <div class="rule-body">
              <div class="text-sm">${escapeHtml(r.rule_text)}</div>
              ${r.examples ? `<div class="text-xs muted-2 mt-xs">例：${escapeHtml(r.examples)}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  function renderQa() {
    const wrap = $("qaList");
    const list = qaCache.filter(q => q.platform === activePlatform);

    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="em-icon">✅</div><div>暂无质检项，请先执行 seed.sql</div></div>`;
      return;
    }

    // 按分类分组
    const grouped = {};
    list.forEach(q => {
      if (!grouped[q.category]) grouped[q.category] = [];
      grouped[q.category].push(q);
    });

    wrap.innerHTML = Object.entries(grouped).map(([cat, items]) => `
      <div class="mb-md">
        <div class="text-xs muted-2 mb-sm" style="font-weight:600;">${escapeHtml(cat)}</div>
        ${items.map((q, i) => `
          <div class="qa-item">
            <span class="qa-check">☐</span>
            <span class="text-sm">${escapeHtml(q.item_text)}</span>
            ${!q.is_required ? '<span class="text-xs muted-2">（可选）</span>' : ""}
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  return { render };
  })();
  return Rules;
});
