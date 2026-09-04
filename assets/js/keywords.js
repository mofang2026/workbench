/**
 * 关键词管理库 · 模块 (U11)
 * - 关键词 CRUD + 分类 + 平台 + 赛道
 * - 从选题灵感库一键聚合关键词
 * - 热度评分 + 状态管理（active/watching/deprecated）
 * - 批量导入
 */

WB.define("Keywords", ["Db"], (Db) => {
  const Keywords = (function () {
  const CATEGORIES = {
    industry: { name: "行业词", color: "brand" },
    long_tail: { name: "长尾词", color: "ok" },
    emotion: { name: "情绪词", color: "warn" },
    topic: { name: "话题词", color: "accent" },
    competitor: { name: "竞品词", color: "danger" },
  };

  const STATUS = {
    active: { label: "启用", cls: "qa_passed" },
    watching: { label: "观察中", cls: "pending" },
    deprecated: { label: "已废弃", cls: "archived" },
  };

  const PLATFORMS = { xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条", all: "通用" };

  let cache = [];
  let filterCategory = "all";
  let filterPlatform = "all";
  let filterStatus = "all";
  let searchKw = "";

  async function render(opts) {
    opts = opts || {};
    const wrap = opts.wrapper || $("page-keywords");
    const hero = opts.noHero ? "" : `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">KEYWORDS · 关键词管理库</p>
        <h1>关键词管理库</h1>
        <p class="sub">分类管理 · 热度评分 · 选题聚合 · 批量导入</p>
      </div>`;
    wrap.innerHTML = hero + `
      <div class="card">
        <div class="toolbar">
          <input id="kwSearch" class="input" placeholder="搜索关键词..." style="flex:1; min-width:200px;" />
          <select id="kwFilterCategory" class="select">
            <option value="all">全部分类</option>
            ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("")}
          </select>
          <select id="kwFilterPlatform" class="select">
            <option value="all">全部平台</option>
            ${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <select id="kwFilterStatus" class="select">
            <option value="all">全部状态</option>
            ${Object.entries(STATUS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("")}
          </select>
          <button class="btn btn-ghost btn-sm" id="btnAggregate">从选题聚合</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchImport">批量导入</button>
          <button class="btn btn-primary" id="btnNewKw">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            新增
          </button>
        </div>
        <div id="kwStatsBar" class="row gap-md" style="flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--line); margin-top:8px;"></div>
        <div id="kwList" class="mt-md"></div>
      </div>
    `;

    $("kwSearch").addEventListener("input", (e) => { searchKw = e.target.value.trim().toLowerCase(); renderList(); });
    $("kwFilterCategory").addEventListener("change", (e) => { filterCategory = e.target.value; renderList(); });
    $("kwFilterPlatform").addEventListener("change", (e) => { filterPlatform = e.target.value; renderList(); });
    $("kwFilterStatus").addEventListener("change", (e) => { filterStatus = e.target.value; renderList(); });
    $("btnNewKw").addEventListener("click", () => openEditor(null));
    $("btnAggregate").addEventListener("click", aggregateFromTopics);
    $("btnBatchImport").addEventListener("click", openBatchImport);

    await loadList();
  }

  async function loadList() {
    const wrap = $("kwList");
    wrap.innerHTML = `<div class="empty-state"><div class="ai-thinking"><span class="spinner"></span> 加载中...</div></div>`;
    try {
      cache = await Db.list("keywords", {
        order: { col: "updated_at", ascending: false },
        limit: 1000,
      });
      renderStats();
      renderList();
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function renderStats() {
    const wrap = $("kwStatsBar");
    if (!wrap) return;
    const total = cache.length;
    const byCategory = {};
    cache.forEach(k => { byCategory[k.category] = (byCategory[k.category] || 0) + 1; });
    const activeCount = cache.filter(k => k.status === "active").length;
    const avgHot = total > 0 ? Math.round(cache.reduce((s, k) => s + (k.hot_score || 0), 0) / total) : 0;

    wrap.innerHTML = `
      <span class="text-xs">总词数 <b>${total}</b></span>
      <span class="text-xs">|</span>
      <span class="text-xs text-ok">启用 <b>${activeCount}</b></span>
      <span class="text-xs">|</span>
      <span class="text-xs text-warm">平均热度 <b>${avgHot}</b></span>
      ${Object.keys(byCategory).length > 0 ? `<span class="text-xs">|</span>
      <span class="text-xs muted">分类：</span>
      ${Object.entries(byCategory).map(([c, n]) => `<span class="tag">${CATEGORIES[c]?.name || c} ${n}</span>`).join("")}` : ""}
    `;
  }

  function renderList() {
    const wrap = $("kwList");
    let list = cache;
    if (filterCategory !== "all") list = list.filter(k => k.category === filterCategory);
    if (filterPlatform !== "all") list = list.filter(k => k.platform === filterPlatform || k.platform === "all");
    if (filterStatus !== "all") list = list.filter(k => k.status === filterStatus);
    if (searchKw) list = list.filter(k => (k.word || "").toLowerCase().includes(searchKw) || (k.notes || "").toLowerCase().includes(searchKw));

    if (list.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="em-icon">🏷️</div>
          <div>${cache.length === 0 ? "还没有关键词，点击「新增」或「从选题聚合」开始" : "没有符合条件的关键词"}</div>
        </div>`;
      return;
    }

    wrap.innerHTML = list.map(k => {
      const cat = CATEGORIES[k.category] || { name: k.category || "未分类", color: "muted" };
      const st = STATUS[k.status] || STATUS.active;
      const hot = k.hot_score || 0;
      const hotCls = hot >= 70 ? "text-warm" : hot >= 40 ? "text-ok" : "muted";
      return `
        <div class="list-item row gap-sm" data-id="${k.id}" style="align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div class="list-item-head">
              <div class="list-item-title">${escapeHtml(k.word)}</div>
              <span class="status-badge status-${st.cls}">${st.label}</span>
            </div>
            <div class="list-item-meta">
              <span class="tag ${cat.color}">${cat.name}</span>
              ${k.platform ? `<span class="tag">${PLATFORMS[k.platform] || k.platform}</span>` : ""}
              ${k.track ? `<span>· ${escapeHtml(k.track)}</span>` : ""}
              <span class="${hotCls}">· 热度 ${hot}</span>
              ${k.source ? `<span class="muted">· ${escapeHtml(k.source)}</span>` : ""}
            </div>
            ${k.notes ? `<div class="list-item-desc">${escapeHtml(k.notes)}</div>` : ""}
          </div>
          <div class="row gap-sm">
            <button class="btn btn-ghost btn-sm" data-copy="${k.id}" type="button">复制</button>
            <button class="btn btn-ghost btn-sm" data-edit="${k.id}" type="button">编辑</button>
          </div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditor(cache.find(k => k.id === el.dataset.edit));
      });
    });
    wrap.querySelectorAll("[data-copy]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = cache.find(x => x.id === el.dataset.copy);
        if (k) {
          navigator.clipboard.writeText(k.word).then(() => toast("已复制"));
        }
      });
    });
  }

  function openEditor(keyword) {
    const isEdit = !!keyword;
    const k = keyword || {
      word: "", category: "industry", platform: "all", track: "",
      hot_score: 50, status: "active", source: "手动添加", notes: "",
    };

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑关键词" : "新增关键词"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">关键词 *</label>
          <input id="kwWord" class="input" value="${escapeAttr(k.word)}" placeholder="关键词" />
        </div>
        <div class="field">
          <label class="field-label">分类</label>
          <select id="kwCategory" class="select">
            ${Object.entries(CATEGORIES).map(([key, c]) => `<option value="${key}" ${k.category === key ? "selected" : ""}>${c.name}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">平台</label>
          <select id="kwPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([key, v]) => `<option value="${key}" ${k.platform === key ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">赛道</label>
          <input id="kwTrack" class="input" value="${escapeAttr(k.track || "")}" placeholder="如：职场/育儿/科技" />
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">热度评分 (0-100)</label>
          <input id="kwHot" class="input" type="number" min="0" max="100" value="${k.hot_score || 0}" />
        </div>
        <div class="field">
          <label class="field-label">状态</label>
          <select id="kwStatus" class="select">
            ${Object.entries(STATUS).map(([key, s]) => `<option value="${key}" ${k.status === key ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">来源</label>
        <input id="kwSource" class="input" value="${escapeAttr(k.source || "")}" placeholder="手动添加/选题聚合/外部导入" />
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <textarea id="kwNotes" class="textarea" rows="3" placeholder="关键词使用场景、效果说明...">${escapeHtml(k.notes || "")}</textarea>
      </div>
      <div class="modal-foot">
        ${isEdit ? `<button class="btn btn-ghost" id="btnDeleteKw" style="margin-right:auto;">删除</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveKw">保存</button>
      </div>
    `);

    $("btnSaveKw").addEventListener("click", () => save(isEdit ? k.id : null));
    if (isEdit) {
      $("btnDeleteKw").addEventListener("click", async () => {
        const ok = await confirm("确定删除该关键词？");
        if (!ok) return;
        await Db.remove("keywords", k.id);
        toast("已删除");
        closeModal();
        await loadList();
      });
    }
  }

  async function save(id) {
    const word = $("kwWord").value.trim();
    if (!word) { toast("请填写关键词"); return; }
    const payload = {
      word,
      category: $("kwCategory").value,
      platform: $("kwPlatform").value,
      track: $("kwTrack").value.trim(),
      hot_score: parseInt($("kwHot").value) || 0,
      status: $("kwStatus").value,
      source: $("kwSource").value.trim() || "手动添加",
      notes: $("kwNotes").value.trim(),
    };
    try {
      if (id) {
        await Db.update("keywords", id, payload);
      } else {
        await Db.create("keywords", payload);
      }
      toast("已保存");
      closeModal();
      await loadList();
    } catch (e) {
      toast("保存失败: " + e.message);
    }
  }

  // 从选题灵感库聚合关键词
  async function aggregateFromTopics() {
    try {
      const topics = await Db.list("topics", {
        select: "id, keywords, platform, track, is_hot",
        limit: 500,
      });
      const wordMap = {}; // word -> { count, hot_count, platforms, tracks }
      topics.forEach(t => {
        (t.keywords || []).forEach(w => {
          if (!w) return;
          if (!wordMap[w]) wordMap[w] = { count: 0, hot_count: 0, platforms: new Set(), tracks: new Set() };
          wordMap[w].count++;
          if (t.is_hot) wordMap[w].hot_count++;
          if (t.platform) wordMap[w].platforms.add(t.platform);
          if (t.track) wordMap[w].tracks.add(t.track);
        });
      });

      const words = Object.entries(wordMap);
      if (words.length === 0) {
        toast("选题库中暂无关键词可聚合");
        return;
      }

      const ok = await confirm(`发现 ${words.length} 个唯一关键词，将把不存在的关键词添加到词库（爆款词热度+20），继续？`);
      if (!ok) return;

      // 现有词缓存（避免重复）
      const existing = new Set(cache.map(k => k.word));
      let added = 0, skipped = 0;
      for (const [word, info] of words) {
        if (existing.has(word)) { skipped++; continue; }
        try {
          await Db.create("keywords", {
            word,
            category: info.hot_count > 0 ? "topic" : "long_tail",
            platform: info.platforms.size === 1 ? [...info.platforms][0] : "all",
            track: info.tracks.size === 1 ? [...info.tracks][0] : "",
            hot_score: Math.min(100, info.count * 10 + info.hot_count * 20),
            status: "active",
            source: "选题聚合",
            notes: `出现 ${info.count} 次，爆款 ${info.hot_count} 次`,
          });
          added++;
        } catch (e) {
          // 唯一约束冲突等忽略
        }
      }
      toast(`聚合完成：新增 ${added}，跳过已存在 ${skipped}`);
      await loadList();
    } catch (e) {
      toast("聚合失败: " + e.message);
    }
  }

  function openBatchImport() {
    showModal(`
      <div class="modal-head">
        <h3>批量导入关键词</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">每行一个关键词，可附分类（用逗号分隔），如：职场焦虑,情绪词</p>
      <div class="field">
        <label class="field-label">默认分类</label>
        <select id="biCategory" class="select">
          ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field-label">默认平台</label>
        <select id="biPlatform" class="select">
          ${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}" ${k === "all" ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field-label">关键词列表</label>
        <textarea id="biText" class="textarea" rows="10" placeholder="职场焦虑,情绪词&#10;副业搞钱,行业词&#10;育儿焦虑"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnBiImport">导入</button>
      </div>
    `);

    $("btnBiImport").addEventListener("click", async () => {
      const text = $("biText").value.trim();
      if (!text) { toast("请输入关键词"); return; }
      const defaultCat = $("biCategory").value;
      const defaultPlat = $("biPlatform").value;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      let added = 0, failed = 0;
      for (const line of lines) {
        const parts = line.split(/[,，]/).map(s => s.trim());
        const word = parts[0];
        const cat = parts[1] && CATEGORIES[parts[1]] ? parts[1] : defaultCat;
        try {
          await Db.create("keywords", {
            word,
            category: cat,
            platform: defaultPlat,
            hot_score: 50,
            status: "active",
            source: "批量导入",
          });
          added++;
        } catch (e) {
          failed++;
        }
      }
      toast(`导入完成：成功 ${added}，失败 ${failed}（可能重复）`);
      closeModal();
      await loadList();
    });
  }

  return { render, loadList };
  })();
  return Keywords;
});
