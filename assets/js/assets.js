/**
 * 素材资源库 · 模块
 * 分类：封面图/配图/表情包/视频片段/BGM/文案金句
 * 功能：CRUD + 标签检索 + 平台筛选 + 收藏 + 一键复制/插入
 */

const Assets = (function () {
  const TYPES = {
    cover: { name: "封面图", icon: "🖼️" },
    image: { name: "配图", icon: "📷" },
    sticker: { name: "表情包", icon: "😊" },
    video_clip: { name: "视频片段", icon: "🎬" },
    bgm: { name: "BGM", icon: "🎵" },
    quote: { name: "文案金句", icon: "✍️" },
  };

  const PLATFORMS = { xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条", all: "通用" };

  let cache = [];
  let filterType = "all";
  let filterPlatform = "all";
  let filterFav = false;
  let searchKw = "";
  let selectedSet = new Set(); // 批量选中

  async function render() {
    const wrap = $("page-assets");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">ASSETS · 素材资源库</p>
        <h1>素材资源库</h1>
        <p class="sub">封面图 · 配图 · 表情包 · 视频片段 · BGM · 文案金句</p>
      </div>

      <!-- 筛选栏 -->
      <div class="card mb-md">
        <div class="row gap-md" style="flex-wrap:wrap;">
          <div class="row gap-sm">
            <span class="text-xs muted">类型</span>
            <select id="aFilterType" class="select" style="width:auto;">
              <option value="all">全部</option>
              ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join("")}
            </select>
          </div>
          <div class="row gap-sm">
            <span class="text-xs muted">平台</span>
            <select id="aFilterPlatform" class="select" style="width:auto;">
              <option value="all">全部</option>
              ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}
            </select>
          </div>
          <label class="row gap-sm">
            <input type="checkbox" id="aFilterFav" />
            <span class="text-xs">仅看收藏</span>
          </label>
          <input id="aSearch" class="input" style="flex:1; min-width:160px;" placeholder="搜索标题/标签/文案..." />
          <button class="btn btn-warm btn-sm" id="btnAiGenQuotes">AI 生成金句</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchImport">批量导入</button>
          <button class="btn btn-primary" id="btnNewAsset">+ 新增素材</button>
        </div>
        <!-- 批量操作栏 -->
        <div id="batchBar" class="row gap-md mt-sm hidden" style="flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--line);">
          <span class="text-xs muted" id="batchCount">已选 0 项</span>
          <button class="btn btn-ghost btn-sm" id="btnAiBatchTag">AI 批量打标签</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchFav">批量收藏</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchDel">批量删除</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchClear">取消选择</button>
        </div>
      </div>

      <!-- 素材列表 -->
      <div id="assetGrid" class="asset-grid"></div>
    `;

    $("aFilterType").addEventListener("change", (e) => { filterType = e.target.value; renderGrid(); });
    $("aFilterPlatform").addEventListener("change", (e) => { filterPlatform = e.target.value; renderGrid(); });
    $("aFilterFav").addEventListener("change", (e) => { filterFav = e.target.checked; renderGrid(); });
    $("aSearch").addEventListener("input", (e) => { searchKw = e.target.value.trim().toLowerCase(); renderGrid(); });
    $("btnNewAsset").addEventListener("click", () => openEditor(null));
    $("btnAiGenQuotes").addEventListener("click", openAiQuotesModal);
    $("btnBatchImport").addEventListener("click", openBatchImportModal);
    $("btnAiBatchTag").addEventListener("click", () => aiBatchTag([...selectedSet]));
    $("btnBatchFav").addEventListener("click", () => batchUpdateFav([...selectedSet]));
    $("btnBatchDel").addEventListener("click", () => batchDelete([...selectedSet]));
    $("btnBatchClear").addEventListener("click", clearSelection);

    await loadList();
  }

  async function loadList() {
    const grid = $("assetGrid");
    grid.innerHTML = `<div class="empty-state"><div class="ai-thinking"><span class="spinner"></span> 加载中...</div></div>`;
    try {
      cache = await window.Db.list("assets", {
        select: "id, type, title, url, content, tags, platform, is_favorite, created_at",
        order: { col: "created_at", ascending: false },
        limit: 500,
      });
      renderGrid();
    } catch (e) {
      grid.innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function renderGrid() {
    const grid = $("assetGrid");
    let list = cache;

    if (filterType !== "all") list = list.filter(a => a.type === filterType);
    if (filterPlatform !== "all") list = list.filter(a => a.platform === filterPlatform || a.platform === "all");
    if (filterFav) list = list.filter(a => a.is_favorite);
    if (searchKw) {
      list = list.filter(a => {
        const txt = `${a.title || ""} ${a.content || ""} ${(a.tags || []).join(" ")}`.toLowerCase();
        return txt.includes(searchKw);
      });
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="em-icon">🎨</div>
          <div>${cache.length === 0 ? "还没有素材，点击「新增素材」添加" : "没有符合条件的素材"}</div>
        </div>`;
      return;
    }

    grid.innerHTML = list.map(a => {
      const t = TYPES[a.type] || { name: a.type, icon: "📦" };
      const platName = PLATFORMS[a.platform] || a.platform || "通用";
      const isSelected = selectedSet.has(a.id);
      const isImage = a.type === "cover" || a.type === "image" || a.type === "sticker";
      return `
        <div class="asset-card ${isSelected ? "selected" : ""}" data-id="${a.id}">
          <div class="asset-card-head">
            <label class="asset-check" data-check="${a.id}">
              <input type="checkbox" ${isSelected ? "checked" : ""} />
              <span class="asset-type">${t.icon} ${t.name}</span>
            </label>
            <button class="asset-fav ${a.is_favorite ? "active" : ""}" data-fav="${a.id}" title="收藏">${a.is_favorite ? "⭐" : "☆"}</button>
          </div>
          <div class="asset-card-body">
            ${isImage && a.url ? `<div class="asset-thumb" style="background-image:url('${escapeAttr(a.url)}');"></div>` : ""}
            <div class="asset-title">${escapeHtml(a.title || "未命名")}</div>
            ${a.type === "quote" && a.content ? `<div class="asset-quote">${escapeHtml(a.content)}</div>` : ""}
            ${a.url ? `<a href="${escapeAttr(a.url)}" target="_blank" class="text-xs brand">查看链接 →</a>` : ""}
            <div class="asset-meta">
              <span class="tag">${platName}</span>
              ${(a.tags || []).slice(0, 3).map(tg => `<span class="tag">#${escapeHtml(tg)}</span>`).join("")}
            </div>
          </div>
          <div class="asset-card-foot">
            <button class="btn btn-ghost btn-sm" data-copy="${a.id}">复制</button>
            <button class="btn btn-warm btn-sm" data-aitag="${a.id}">AI 打标</button>
            <button class="btn btn-ghost btn-sm" data-edit="${a.id}">编辑</button>
          </div>
        </div>
      `;
    }).join("");

    // 更新批量栏状态
    updateBatchBar();

    // 绑定事件
    grid.querySelectorAll("[data-fav]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(el.dataset.fav); });
    });
    grid.querySelectorAll("[data-copy]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); copyAsset(el.dataset.copy); });
    });
    grid.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); openEditor(cache.find(a => a.id === el.dataset.edit)); });
    });
    grid.querySelectorAll("[data-aitag]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); aiTagSingle(el.dataset.aitag); });
    });
    grid.querySelectorAll("[data-check]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.check;
        if (selectedSet.has(id)) selectedSet.delete(id);
        else selectedSet.add(id);
        renderGrid();
      });
    });
  }

  function updateBatchBar() {
    const bar = $("batchBar");
    const count = $("batchCount");
    if (!bar) return;
    if (selectedSet.size > 0) {
      bar.classList.remove("hidden");
      count.textContent = `已选 ${selectedSet.size} 项`;
    } else {
      bar.classList.add("hidden");
    }
  }

  function clearSelection() {
    selectedSet.clear();
    renderGrid();
  }

  async function toggleFav(id) {
    const a = cache.find(x => x.id === id);
    if (!a) return;
    try {
      await window.Db.update("assets", id, { is_favorite: !a.is_favorite });
      a.is_favorite = !a.is_favorite;
      renderGrid();
    } catch (e) {
      toast("操作失败: " + e.message);
    }
  }

  function copyAsset(id) {
    const a = cache.find(x => x.id === id);
    if (!a) return;
    const text = a.content || a.url || a.title || "";
    if (!text) { toast("该素材无可复制内容"); return; }
    navigator.clipboard.writeText(text).then(() => {
      toast("已复制到剪贴板");
    }).catch(() => {
      toast("复制失败，请手动选择复制");
    });
  }

  function openEditor(asset) {
    const isEdit = !!asset;
    const a = asset || {
      type: "quote",
      title: "",
      url: "",
      content: "",
      tags: [],
      platform: "all",
      is_favorite: false,
    };

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑素材" : "新增素材"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">类型 *</label>
          <select id="aType" class="select">
            ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${a.type === k ? "selected" : ""}>${t.icon} ${t.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">适用平台</label>
          <select id="aPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${a.platform === k ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">标题</label>
        <input id="aTitle" class="input" value="${escapeAttr(a.title || "")}" placeholder="素材名称" />
      </div>
      <div class="field" id="urlField">
        <label class="field-label">链接 URL</label>
        <input id="aUrl" class="input" value="${escapeAttr(a.url || "")}" placeholder="图片/视频/BGM 链接" />
      </div>
      <div class="field" id="contentField">
        <label class="field-label">文案内容</label>
        <textarea id="aContent" class="textarea" rows="4" placeholder="文案金句类素材填写此处">${escapeHtml(a.content || "")}</textarea>
      </div>
      <div class="field">
        <label class="field-label">标签（逗号分隔）</label>
        <input id="aTags" class="input" value="${escapeAttr((a.tags || []).join(", "))}" placeholder="标签1, 标签2" />
      </div>
      <label class="row gap-sm">
        <input type="checkbox" id="aFav" ${a.is_favorite ? "checked" : ""} />
        <span class="text-sm">收藏</span>
      </label>
      <div class="modal-foot">
        ${isEdit ? `<button class="btn btn-ghost" id="btnDeleteAsset" style="margin-right:auto;">删除</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveAsset">保存</button>
      </div>
    `);

    // 类型联动：非 quote 隐藏文案框
    const toggleFields = () => {
      const isQuote = $("aType").value === "quote";
      $("contentField").style.display = isQuote ? "" : "none";
      $("urlField").style.display = isQuote ? "none" : "";
    };
    $("aType").addEventListener("change", toggleFields);
    toggleFields();

    $("btnSaveAsset").addEventListener("click", () => save(isEdit ? a.id : null));
    if (isEdit) {
      $("btnDeleteAsset").addEventListener("click", async () => {
        const ok = await confirm("确定删除该素材？");
        if (!ok) return;
        await window.Db.remove("assets", a.id);
        toast("已删除");
        closeModal();
        await loadList();
      });
    }
  }

  async function save(id) {
    const tagsStr = $("aTags").value.trim();
    const payload = {
      type: $("aType").value,
      title: $("aTitle").value.trim(),
      url: $("aUrl").value.trim(),
      content: $("aContent").value.trim(),
      tags: tagsStr ? tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
      platform: $("aPlatform").value,
      is_favorite: $("aFav").checked,
    };
    if (!payload.title && !payload.content && !payload.url) {
      toast("请至少填写标题、文案或链接");
      return;
    }
    try {
      if (id) {
        await window.Db.update("assets", id, payload);
      } else {
        await window.Db.create("assets", payload);
      }
      toast("已保存");
      closeModal();
      await loadList();
    } catch (e) {
      toast("保存失败: " + e.message);
    }
  }

  // ========== AI 智能打标签 ==========

  async function aiTagSingle(id) {
    const a = cache.find(x => x.id === id);
    if (!a) return;
    toast("AI 分析中...", 1500);
    try {
      const tags = await callAiTag(a);
      if (tags.length === 0) { toast("未生成标签"); return; }
      await window.Db.update("assets", id, { tags: [...new Set([...(a.tags || []), ...tags])] });
      a.tags = [...new Set([...(a.tags || []), ...tags])];
      renderGrid();
      toast(`已添加 ${tags.length} 个 AI 标签：${tags.join("、")}`);
    } catch (e) {
      toast("AI 打标失败: " + e.message);
    }
  }

  async function aiBatchTag(ids) {
    if (ids.length === 0) { toast("请先勾选素材"); return; }
    if (ids.length > 20) { toast("批量打标最多 20 个"); return; }
    toast(`正在批量打标 ${ids.length} 个素材...`, 2000);
    let okCount = 0;
    for (const id of ids) {
      const a = cache.find(x => x.id === id);
      if (!a) continue;
      try {
        const tags = await callAiTag(a);
        if (tags.length > 0) {
          await window.Db.update("assets", id, { tags: [...new Set([...(a.tags || []), ...tags])] });
          a.tags = [...new Set([...(a.tags || []), ...tags])];
          okCount++;
        }
      } catch (e) { console.error(id, e); }
    }
    renderGrid();
    toast(`批量打标完成（${okCount}/${ids.length}）`);
    clearSelection();
  }

  async function callAiTag(asset) {
    const t = TYPES[asset.type] || { name: asset.type };
    const prompt = `请为以下自媒体素材生成 3-5 个精准标签。\n\n素材类型：${t.name}\n标题：${asset.title || "无"}\n文案：${asset.content || "无"}\n链接：${asset.url || "无"}\n现有标签：${(asset.tags || []).join("、") || "无"}\n\n要求：\n1. 标签简洁（2-4字）\n2. 涵盖内容主题、使用场景、情绪风格\n3. 适合搜索和分类\n\n严格按 JSON 数组格式输出，如 ["标签1","标签2"]\n只输出 JSON 数组。`;
    const text = await window.AiGateway.generate(prompt, {
      system: "你是素材分类专家，擅长为自媒体素材生成精准标签。",
      maxTokens: 300,
    });
    const parsed = tryParseJson(text);
    return Array.isArray(parsed) ? parsed.map(s => String(s).trim()).filter(Boolean).slice(0, 5) : [];
  }

  // ========== AI 批量生成金句 ==========

  function openAiQuotesModal() {
    showModal(`
      <div class="modal-head">
        <h3>AI 批量生成文案金句</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">输入主题和场景，AI 将生成多条金句素材，自动入库</p>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">主题 *</label>
          <input id="qTheme" class="input" placeholder="如：自律、成长、职场、育儿" />
        </div>
        <div class="field">
          <label class="field-label">数量</label>
          <select id="qCount" class="select">
            <option value="5">5 条</option>
            <option value="10" selected>10 条</option>
            <option value="15">15 条</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">风格/场景（可选）</label>
        <input id="qStyle" class="input" placeholder="如：鸡汤励志、幽默吐槽、干货总结、情绪共鸣" />
      </div>
      <div class="field">
        <label class="field-label">适用平台</label>
        <select id="qPlatform" class="select">
          ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${k === "all" ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnGenQuotes">生成并入库</button>
        <span id="qStatus" class="text-xs muted"></span>
      </div>
      <div id="qResults"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);
    $("btnGenQuotes").addEventListener("click", generateQuotes);
  }

  async function generateQuotes() {
    const theme = $("qTheme").value.trim();
    if (!theme) { toast("请填写主题"); return; }
    const style = $("qStyle").value.trim();
    const count = parseInt($("qCount").value) || 10;
    const platform = $("qPlatform").value;

    const status = $("qStatus");
    const results = $("qResults");
    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 正在生成金句...</span>';
    results.innerHTML = "";

    try {
      const platformLabel = PLATFORMS[platform] || "通用";
      const prompt = `请生成 ${count} 条高质量自媒体文案金句。\n\n主题：${theme}\n风格：${style || "不限"}\n适用平台：${platformLabel}\n\n要求：\n1. 每条金句独立成句，15-40字\n2. 有传播力和共鸣感\n3. 适合作为内容开头、结尾或引用\n4. 风格多样化，避免同质化\n\n严格按 JSON 数组格式输出：\n${JSON.stringify(["金句1", "金句2"], null, 2)}\n\n只输出 JSON 数组。`;

      const text = await window.AiGateway.generate(prompt, {
        system: "你是自媒体文案创作专家，擅长写出有传播力的金句。",
        maxTokens: 2000,
      });
      const parsed = tryParseJson(text);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        status.innerHTML = '<span class="text-danger">生成失败，请重试</span>';
        return;
      }

      // 入库
      let okCount = 0;
      const saved = [];
      for (const q of parsed) {
        const quote = String(q).trim();
        if (!quote) continue;
        try {
          const item = await window.Db.create("assets", {
            type: "quote",
            title: quote.slice(0, 20) + (quote.length > 20 ? "..." : ""),
            content: quote,
            tags: [theme, style].filter(Boolean),
            platform,
            is_favorite: false,
          });
          saved.push(item);
          okCount++;
        } catch (e) { console.error(e); }
      }

      status.innerHTML = `<span class="text-ok">✓ 已生成并入库 ${okCount} 条金句</span>`;
      results.innerHTML = saved.map((q, i) => `
        <div class="rec-item">
          <span class="rec-heat heat-high">${i + 1}</span>
          <div class="rec-body">
            <div class="rec-title">${escapeHtml(q.content)}</div>
            <div class="rec-meta"><span class="tag">${PLATFORMS[q.platform] || "通用"}</span><span class="tag">#${escapeHtml(theme)}</span></div>
          </div>
        </div>
      `).join("");
      toast(`已生成 ${okCount} 条金句素材`);
      await loadList();
    } catch (e) {
      status.innerHTML = `<span class="text-danger">生成失败: ${escapeHtml(e.message)}</span>`;
    }
  }

  // ========== 批量导入 ==========

  function openBatchImportModal() {
    showModal(`
      <div class="modal-head">
        <h3>批量导入素材</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">每行一条，格式：类型 | 标题 | 链接/文案 | 标签（逗号分隔）<br>示例：quote | 自律金句 | 你今天的努力是明天的底气 | 自律,励志</p>
      <div class="field">
        <label class="field-label">适用平台</label>
        <select id="biPlatform" class="select">
          ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${k === "all" ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field-label">素材内容（每行一条）</label>
        <textarea id="biText" class="textarea" rows="10" placeholder="quote | 自律金句 | 你今天的努力是明天的底气 | 自律,励志&#10;cover | 封面图1 | https://example.com/cover1.jpg | 封面,主图"></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnBiImport">导入</button>
      </div>
    `);
    $("btnBiImport").addEventListener("click", doBatchImport);
  }

  async function doBatchImport() {
    const text = $("biText").value.trim();
    if (!text) { toast("请输入素材内容"); return; }
    const platform = $("biPlatform").value;
    const lines = text.split("\n").filter(l => l.trim());
    let okCount = 0;
    const typeKeys = Object.keys(TYPES);

    for (const line of lines) {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length < 2) continue;
      const [typeStr, title, contentOrUrl, tagsStr] = parts;
      const type = typeKeys.includes(typeStr) ? typeStr : "quote";
      const isUrl = contentOrUrl && /^https?:\/\//.test(contentOrUrl);
      try {
        await window.Db.create("assets", {
          type,
          title: title || (isUrl ? "未命名" : contentOrUrl?.slice(0, 20) || "未命名"),
          url: isUrl ? contentOrUrl : "",
          content: isUrl ? "" : (contentOrUrl || ""),
          tags: tagsStr ? tagsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [],
          platform,
          is_favorite: false,
        });
        okCount++;
      } catch (e) { console.error(line, e); }
    }

    toast(`成功导入 ${okCount} 条素材`);
    closeModal();
    await loadList();
  }

  // ========== 批量操作 ==========

  async function batchUpdateFav(ids) {
    if (ids.length === 0) { toast("请先勾选素材"); return; }
    for (const id of ids) {
      try { await window.Db.update("assets", id, { is_favorite: true }); } catch (e) {}
    }
    toast(`已收藏 ${ids.length} 个素材`);
    clearSelection();
    await loadList();
  }

  async function batchDelete(ids) {
    if (ids.length === 0) { toast("请先勾选素材"); return; }
    const ok = await confirm(`确定删除选中的 ${ids.length} 个素材？`);
    if (!ok) return;
    for (const id of ids) {
      try { await window.Db.remove("assets", id); } catch (e) {}
    }
    toast(`已删除 ${ids.length} 个素材`);
    clearSelection();
    await loadList();
  }

  return { render, loadList };
})();

window.Assets = Assets;
