/**
 * 选题灵感库 · 模块
 * - 列表 + 筛选 + 状态流转
 * - 新建/编辑/废弃
 * - 一键转为内容创作
 */

WB.define("Topics", ["AiGateway", "Db", "ContentEditor"], (AiGateway, Db, ContentEditor) => {
  const Topics = (function () {
  const STATUS_FLOW = [
    { key: "idea", label: "灵感储备" },
    { key: "pending", label: "待创作" },
    { key: "creating", label: "创作中" },
    { key: "done", label: "已完结" },
    { key: "abandoned", label: "废弃" },
  ];

  const PLATFORM_LABELS = {
    xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条", all: "全域",
  };

  let listData = [];
  let filterStatus = "all";
  let filterPlatform = "all";
  let filterHot = false;
  let searchKw = "";

  async function render(opts) {
    opts = opts || {};
    const wrap = opts.wrapper || $("page-topics");
    const hero = opts.noHero ? "" : `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">TOPICS · 选题灵感库</p>
        <h1>选题灵感库</h1>
        <p class="sub">灵感收录 · 状态流转 · 爆款选题 · 关键词管理</p>
      </div>`;
    wrap.innerHTML = hero + `
      <div class="card">
        <div class="toolbar">
          <input id="topicSearch" class="input" placeholder="搜索标题/关键词..." style="flex:1; min-width:200px;" />
          <select id="topicFilterStatus" class="select">
            <option value="all">全部状态</option>
            ${STATUS_FLOW.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
          </select>
          <select id="topicFilterPlatform" class="select">
            <option value="all">全部平台</option>
            ${Object.entries(PLATFORM_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <label class="row gap-sm">
            <input type="checkbox" id="topicFilterHot" />
            <span class="text-sm text-warm">🔥 仅爆款</span>
          </label>
          <button id="btnAiHotAnalysis" class="btn btn-ghost btn-sm">AI 爆款分析</button>
          <button id="btnAiRecommend" class="btn btn-warm btn-sm">AI 选题推荐</button>
          <button id="btnNewTopic" class="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            新建选题
          </button>
        </div>
        <!-- U10 爆款统计条 -->
        <div id="hotStatsBar" class="row gap-md mt-sm" style="flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--line);"></div>
        <div id="topicList"></div>
      </div>

      <!-- U10 AI 爆款分析结果 -->
      <div id="hotAnalysisBox" class="card mt-md hidden"></div>
    `;

    // 绑定事件
    $("topicSearch").addEventListener("input", (e) => {
      searchKw = e.target.value.trim().toLowerCase();
      renderList();
    });
    $("topicFilterStatus").addEventListener("change", (e) => {
      filterStatus = e.target.value;
      renderList();
    });
    $("topicFilterPlatform").addEventListener("change", (e) => {
      filterPlatform = e.target.value;
      renderList();
    });
    $("topicFilterHot").addEventListener("change", (e) => {
      filterHot = e.target.checked;
      renderList();
    });
    $("btnNewTopic").addEventListener("click", () => openEditor(null));
    $("btnAiHotAnalysis").addEventListener("click", generateHotAnalysis);
    $("btnAiRecommend").addEventListener("click", openRecommendModal);

    await loadList();
  }

  // U10：爆款统计条
  function renderHotStats() {
    const wrap = $("hotStatsBar");
    if (!wrap) return;
    const total = listData.length;
    const hotCount = listData.filter(t => t.is_hot).length;
    const byPlatform = {};
    listData.filter(t => t.is_hot).forEach(t => {
      const p = t.platform || "all";
      byPlatform[p] = (byPlatform[p] || 0) + 1;
    });
    const byTrack = {};
    listData.filter(t => t.is_hot && t.track).forEach(t => {
      byTrack[t.track] = (byTrack[t.track] || 0) + 1;
    });
    const topTracks = Object.entries(byTrack).sort((a, b) => b[1] - a[1]).slice(0, 3);

    wrap.innerHTML = `
      <span class="text-xs">总选题 <b>${total}</b></span>
      <span class="text-xs">|</span>
      <span class="text-xs text-warm">🔥 爆款 <b>${hotCount}</b></span>
      ${hotCount > 0 ? `<span class="text-xs">|</span>
      <span class="text-xs muted">分平台：</span>
      ${Object.entries(byPlatform).map(([p, n]) => `<span class="tag" style="color:var(--${p === 'all' ? 'brand' : p}); border-color:var(--${p === 'all' ? 'brand' : p});">${PLATFORM_LABELS[p] || p} ${n}</span>`).join("")}` : ""}
      ${topTracks.length > 0 ? `<span class="text-xs">|</span>
      <span class="text-xs muted">热门赛道：</span>
      ${topTracks.map(([t, n]) => `<span class="tag warn">${escapeHtml(t)} ${n}</span>`).join("")}` : ""}
    `;
  }

  // U10：AI 爆款分析
  async function generateHotAnalysis() {
    const hotTopics = listData.filter(t => t.is_hot);
    const box = $("hotAnalysisBox");
    if (hotTopics.length === 0) {
      toast("暂无爆款选题，请先标记爆款选题");
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="card-title">
        <span>AI 爆款分析</span>
        <button class="btn btn-ghost btn-sm" id="btnCloseAnalysis">关闭</button>
      </div>
      <div class="ai-thinking"><span class="spinner"></span> AI 正在分析 ${hotTopics.length} 个爆款选题的特征...</div>
    `;
    $("btnCloseAnalysis").addEventListener("click", () => box.classList.add("hidden"));

    try {
      const sample = hotTopics.slice(0, 20).map(t => ({
        title: t.title,
        platform: PLATFORM_LABELS[t.platform] || t.platform,
        track: t.track,
        keywords: t.keywords || [],
        source: t.source,
      }));

      const prompt = `以下是 ${hotTopics.length} 个标记为「爆款」的选题。请分析它们的共性特征，输出：\n1. 标题规律（句式、关键词、情绪点）\n2. 高频赛道和主题\n3. 切入角度分析\n4. 基于这些规律，再生成 5 个新的爆款选题建议（标题 + 简述）\n\n爆款选题数据：\n${JSON.stringify(sample, null, 2)}\n\n请用中文输出，格式清晰。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是自媒体爆款选题分析专家，擅长从选题数据中提炼规律。",
        maxTokens: 2500,
      });

      box.innerHTML = `
        <div class="card-title">
          <span>AI 爆款分析</span>
          <div class="row gap-sm">
            <button class="btn btn-ghost btn-sm" id="btnCopyAnalysis">复制</button>
            <button class="btn btn-ghost btn-sm" id="btnCloseAnalysis">关闭</button>
          </div>
        </div>
        <div class="ai-output" style="white-space:pre-wrap; line-height:1.8;">${escapeHtml(text)}</div>
      `;
      $("btnCopyAnalysis").addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => toast("已复制"));
      });
      $("btnCloseAnalysis").addEventListener("click", () => box.classList.add("hidden"));
    } catch (e) {
      box.innerHTML = `<div class="text-danger text-sm">分析失败: ${e.message}</div>`;
    }
  }

  // ========== AI 选题推荐引擎 ==========

  function openRecommendModal() {
    showModal(`
      <div class="modal-head">
        <h3>AI 选题推荐</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">输入赛道和关键词，AI 将生成 8 个选题建议，可勾选后一键导入选题库</p>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">赛道 *</label>
          <input id="recTrack" class="input" placeholder="如：职场/育儿/科技/美食" />
        </div>
        <div class="field">
          <label class="field-label">目标平台</label>
          <select id="recPlatform" class="select">
            ${Object.entries(PLATFORM_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">关键词（逗号分隔，可选）</label>
        <input id="recKeywords" class="input" placeholder="补充关键词让推荐更精准" />
      </div>
      <div class="field">
        <label class="field-label">补充说明（可选）</label>
        <input id="recExtra" class="input" placeholder="如：面向新手、偏实用干货、轻松搞笑..." />
      </div>
      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnGenRecommend">生成选题建议</button>
        <span id="recStatus" class="text-xs muted"></span>
      </div>
      <div id="recResults"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
        <button class="btn btn-primary hidden" id="btnImportSelected">导入选中（0）</button>
      </div>
    `);

    $("btnGenRecommend").addEventListener("click", generateRecommendations);
    $("btnImportSelected").addEventListener("click", importSelectedTopics);
  }

  let recCache = [];

  async function generateRecommendations() {
    const track = $("recTrack").value.trim();
    if (!track) { toast("请填写赛道"); return; }
    const platform = $("recPlatform").value;
    const keywords = $("recKeywords").value.trim();
    const extra = $("recExtra").value.trim();
    const platformLabel = PLATFORM_LABELS[platform] || "全域";

    const status = $("recStatus");
    const results = $("recResults");
    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 正在生成选题...</span>';
    results.innerHTML = "";
    $("btnImportSelected").classList.add("hidden");

    try {
      // 收集已有选题标题，避免重复推荐
      const existingTitles = listData.map(t => t.title).slice(0, 50);

      const prompt = `你是自媒体选题策划专家。请为以下配置生成 8 个高质量选题建议。\n\n赛道：${track}\n目标平台：${platformLabel}\n关键词：${keywords || "无"}\n补充说明：${extra || "无"}\n\n已有选题（避免重复）：\n${existingTitles.join("\n")}\n\n要求：\n1. 每个选题包含标题、简述、切入角度、预估热度（1-10）\n2. 标题要有吸引力，符合${platformLabel}平台调性\n3. 切入角度要差异化，避免同质化\n4. 热度评估基于当前平台趋势和用户兴趣\n\n严格按以下 JSON 数组格式输出：\n${JSON.stringify([{ title: "", description: "", angle: "", heat: 8, keywords: ["关键词1"] }], null, 2)}\n\n只输出 JSON 数组，不要其他说明。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是资深自媒体选题策划师，精通小红书、抖音、B站、公众号的内容趋势和选题方法论。输出必须严格符合 JSON 格式。",
        maxTokens: 2500,
      });

      const parsed = tryParseJson(text);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        status.innerHTML = '<span class="text-danger">生成失败，请重试</span>';
        return;
      }

      recCache = parsed;
      status.innerHTML = `<span class="text-ok">✓ 已生成 ${parsed.length} 个选题建议</span>`;
      renderRecResults(parsed);
      $("btnImportSelected").classList.remove("hidden");
    } catch (e) {
      status.innerHTML = `<span class="text-danger">生成失败: ${escapeHtml(e.message)}</span>`;
    }
  }

  function renderRecResults(items) {
    const wrap = $("recResults");
    wrap.innerHTML = items.map((t, i) => `
      <div class="rec-item" data-idx="${i}">
        <label class="rec-check">
          <input type="checkbox" checked data-idx="${i}" />
          <span class="rec-heat heat-${t.heat >= 8 ? "high" : t.heat >= 5 ? "mid" : "low"}">${t.heat || "?"}</span>
        </label>
        <div class="rec-body">
          <div class="rec-title">${escapeHtml(t.title || "")}</div>
          ${t.description ? `<div class="rec-desc">${escapeHtml(t.description)}</div>` : ""}
          <div class="rec-meta">
            ${t.angle ? `<span class="tag">切入：${escapeHtml(t.angle)}</span>` : ""}
            ${(t.keywords || []).map(k => `<span class="tag">#${escapeHtml(k)}</span>`).join("")}
          </div>
        </div>
      </div>
    `).join("");

    // 更新选中数量
    const updateCount = () => {
      const checked = wrap.querySelectorAll('input[type="checkbox"]:checked').length;
      $("btnImportSelected").textContent = `导入选中（${checked}）`;
    };
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener("change", updateCount));
    updateCount();
  }

  async function importSelectedTopics() {
    const checked = $("recResults").querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length === 0) { toast("请至少选择一个选题"); return; }

    const track = $("recTrack").value.trim();
    const platform = $("recPlatform").value;
    const keywordsInput = $("recKeywords").value.trim();
    const baseKeywords = keywordsInput ? keywordsInput.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];

    const btn = $("btnImportSelected");
    btn.disabled = true;
    btn.textContent = "导入中...";

    let okCount = 0;
    for (const cb of checked) {
      const idx = parseInt(cb.dataset.idx);
      const t = recCache[idx];
      if (!t) continue;
      try {
        await Db.create("topics", {
          title: t.title || "",
          description: t.description || "",
          platform,
          track,
          keywords: [...baseKeywords, ...(t.keywords || [])],
          status: "idea",
          source: "AI推荐",
          is_hot: (t.heat || 0) >= 8,
        });
        okCount++;
      } catch (e) {
        console.error("导入失败", t.title, e);
      }
    }

    btn.disabled = false;
    toast(`成功导入 ${okCount} 个选题`);
    closeModal();
    await loadList();
  }

  // ========== 选题热度评估 ==========

  async function aiAssessTopic(topicId) {
    const topic = listData.find(t => t.id === topicId);
    if (!topic) return;
    showAiAssess(topic);
  }

  async function showAiAssess(topic) {
    showModal(`
      <div class="modal-head">
        <h3>AI 选题热度评估</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="mb-md">
        <div class="text-sm" style="font-weight:600;">${escapeHtml(topic.title)}</div>
        ${topic.description ? `<div class="text-xs muted mt-sm">${escapeHtml(topic.description)}</div>` : ""}
      </div>
      <div id="assessResult">
        <div class="ai-thinking"><span class="spinner"></span> AI 正在评估选题热度和爆款潜力...</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);

    try {
      const platformLabel = PLATFORM_LABELS[topic.platform] || "全域";
      const prompt = `你是自媒体选题评估专家。请对以下选题进行全面评估。\n\n选题标题：${topic.title}\n描述：${topic.description || "无"}\n赛道：${topic.track || "未指定"}\n平台：${platformLabel}\n关键词：${(topic.keywords || []).join("、") || "无"}\n\n请按以下 JSON 格式输出评估报告：\n${JSON.stringify({
        heat_score: 8,
        viral_potential: "高/中/低",
        target_audience: "",
        content_angle: "",
        strengths: ["优势1"],
        risks: ["风险1"],
        suggestions: ["优化建议1"],
        similar_hot: "是否有类似爆款，简述",
      })}\n\n只输出 JSON。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是自媒体选题评估专家，擅长判断选题的爆款潜力和平台适配度。",
        useReasoner: true,
        maxTokens: 1500,
      });
      const parsed = tryParseJson(text);
      if (parsed) {
        renderAssessResult(parsed);
      } else {
        $("assessResult").innerHTML = '<div class="text-danger">评估失败，请重试</div>';
      }
    } catch (e) {
      $("assessResult").innerHTML = `<div class="text-danger">评估失败: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderAssessResult(r) {
    const heatColor = r.heat_score >= 8 ? "var(--ok)" : r.heat_score >= 5 ? "var(--warn)" : "var(--danger)";
    const viralColor = r.viral_potential === "高" ? "var(--ok)" : r.viral_potential === "中" ? "var(--warn)" : "var(--danger)";
    $("assessResult").innerHTML = `
      <div class="assess-overview">
        <div class="assess-score" style="border-color:${heatColor};">
          <span style="font-size:24px; font-weight:700; color:${heatColor};">${r.heat_score || "?"}</span>
          <span class="text-xs muted">热度评分</span>
        </div>
        <div class="assess-info">
          <div class="row gap-sm mb-sm">
            <span class="risk-badge" style="background:${viralColor};">爆款潜力：${escapeHtml(r.viral_potential || "未知")}</span>
          </div>
          ${r.target_audience ? `<div class="text-xs muted">目标受众：${escapeHtml(r.target_audience)}</div>` : ""}
          ${r.content_angle ? `<div class="text-xs muted">建议角度：${escapeHtml(r.content_angle)}</div>` : ""}
        </div>
      </div>
      ${r.strengths?.length ? `
        <div class="assess-block">
          <div class="text-xs text-ok mb-sm">✓ 优势</div>
          ${r.strengths.map(s => `<div class="assess-item assess-good">${escapeHtml(s)}</div>`).join("")}
        </div>` : ""}
      ${r.risks?.length ? `
        <div class="assess-block">
          <div class="text-xs text-warm mb-sm">⚠ 风险</div>
          ${r.risks.map(s => `<div class="assess-item assess-warn">${escapeHtml(s)}</div>`).join("")}
        </div>` : ""}
      ${r.suggestions?.length ? `
        <div class="assess-block">
          <div class="text-xs muted mb-sm">优化建议</div>
          ${r.suggestions.map((s, i) => `<div class="assess-item"><span class="suggestion-num">${i + 1}</span>${escapeHtml(s)}</div>`).join("")}
        </div>` : ""}
      ${r.similar_hot ? `<div class="assess-block"><div class="text-xs muted">类似爆款：${escapeHtml(r.similar_hot)}</div></div>` : ""}
    `;
  }

  async function loadList() {
    try {
      listData = await Db.list("topics", {
        order: { col: "updated_at", ascending: false },
      });
      renderHotStats();
      renderList();
    } catch (e) {
      $("topicList").innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function renderList() {
    const wrap = $("topicList");
    let filtered = listData;

    if (filterStatus !== "all") {
      filtered = filtered.filter(t => t.status === filterStatus);
    }
    if (filterPlatform !== "all") {
      filtered = filtered.filter(t => t.platform === filterPlatform || t.platform === "all");
    }
    if (filterHot) {
      filtered = filtered.filter(t => t.is_hot);
    }
    if (searchKw) {
      filtered = filtered.filter(t => {
        const title = (t.title || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        const kws = (t.keywords || []).join(" ").toLowerCase();
        return title.includes(searchKw) || desc.includes(searchKw) || kws.includes(searchKw);
      });
    }

    if (filtered.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="em-icon">📝</div>
          <div>${listData.length === 0 ? "还没有选题，点击「新建选题」开始记录灵感" : "没有符合条件的选题"}</div>
        </div>`;
      return;
    }

    wrap.innerHTML = filtered.map(t => `
      <div class="list-item" data-id="${t.id}">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(t.title)}</div>
          <div class="row gap-sm">
            <button class="btn btn-ghost btn-sm" data-assess="${t.id}" title="AI 热度评估">AI 评估</button>
            <span class="status-badge status-${t.status}">${statusLabel(t.status)}</span>
          </div>
        </div>
        ${t.description ? `<div class="list-item-desc">${escapeHtml(t.description)}</div>` : ""}
        <div class="list-item-meta">
          ${t.platform ? `<span class="tag">${PLATFORM_LABELS[t.platform] || t.platform}</span>` : ""}
          ${t.track ? `<span>· ${escapeHtml(t.track)}</span>` : ""}
          ${t.is_hot ? `<span class="tag warn">🔥 爆款</span>` : ""}
          ${t.source === "AI推荐" ? `<span class="tag" style="color:var(--brand); border-color:var(--brand);">AI推荐</span>` : ""}
          ${(t.keywords || []).slice(0, 3).map(k => `<span class="tag">#${escapeHtml(k)}</span>`).join("")}
          <span>· ${formatDate(t.updated_at)}</span>
        </div>
      </div>
    `).join("");

    wrap.querySelectorAll(".list-item").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-assess]")) return;
        const id = el.dataset.id;
        openEditor(listData.find(t => t.id === id));
      });
    });
    wrap.querySelectorAll("[data-assess]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        aiAssessTopic(btn.dataset.assess);
      });
    });
  }

  function openEditor(topic) {
    const isEdit = !!topic;
    const t = topic || {
      title: "", description: "", platform: "all", track: "",
      keywords: [], status: "idea", is_hot: false, priority: 0, source: "",
    };

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑选题" : "新建选题"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="field">
        <label class="field-label">标题 *</label>
        <input id="tTitle" class="input" value="${escapeAttr(t.title)}" placeholder="一句话描述选题" />
      </div>
      <div class="field">
        <label class="field-label">描述</label>
        <textarea id="tDesc" class="textarea" placeholder="详细描述灵感、目标受众、切入角度...">${escapeHtml(t.description || "")}</textarea>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">平台</label>
          <select id="tPlatform" class="select">
            ${Object.entries(PLATFORM_LABELS).map(([k, v]) => `<option value="${k}" ${t.platform === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">赛道</label>
          <input id="tTrack" class="input" value="${escapeAttr(t.track || "")}" placeholder="如：职场/育儿/科技" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">关键词（逗号分隔）</label>
        <input id="tKeywords" class="input" value="${escapeAttr((t.keywords || []).join(", "))}" placeholder="关键词1, 关键词2" />
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">状态</label>
          <select id="tStatus" class="select">
            ${STATUS_FLOW.map(s => `<option value="${s.key}" ${t.status === s.key ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">来源</label>
          <input id="tSource" class="input" value="${escapeAttr(t.source || "")}" placeholder="灵感/对标/爆款库" />
        </div>
      </div>
      <div class="row">
        <label class="row gap-sm">
          <input type="checkbox" id="tHot" ${t.is_hot ? "checked" : ""} />
          <span class="text-sm">标记为爆款选题</span>
        </label>
      </div>
      <div class="modal-foot">
        ${isEdit ? `<button class="btn btn-warm" id="btnToContent">转为内容创作 →</button>` : ""}
        ${isEdit && t.status !== "abandoned" ? `<button class="btn btn-ghost" id="btnAbandon">废弃</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveTopic">保存</button>
      </div>
    `);

    $("btnSaveTopic").addEventListener("click", () => saveTopic(isEdit ? t.id : null));
    if (isEdit) {
      $("btnToContent").addEventListener("click", () => convertToContent(t.id));
      const abandonBtn = $("btnAbandon");
      if (abandonBtn) {
        abandonBtn.addEventListener("click", () => updateStatus(t.id, "abandoned"));
      }
    }
  }

  async function saveTopic(id) {
    const title = $("tTitle").value.trim();
    if (!title) { toast("请填写标题"); return; }

    const payload = {
      title,
      description: $("tDesc").value.trim(),
      platform: $("tPlatform").value,
      track: $("tTrack").value.trim(),
      keywords: $("tKeywords").value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      status: $("tStatus").value,
      source: $("tSource").value.trim(),
      is_hot: $("tHot").checked,
    };

    try {
      if (id) {
        await Db.update("topics", id, payload);
        toast("已更新");
      } else {
        await Db.create("topics", payload);
        toast("已创建");
      }
      closeModal();
      await loadList();
    } catch (e) {
      toast("保存失败: " + e.message, 3000);
    }
  }

  async function updateStatus(id, status) {
    try {
      await Db.update("topics", id, { status });
      toast(`已${status === "abandoned" ? "废弃" : "更新"}`);
      closeModal();
      await loadList();
    } catch (e) {
      toast("操作失败: " + e.message);
    }
  }

  async function convertToContent(topicId) {
    const topic = listData.find(t => t.id === topicId);
    if (!topic) return;
    try {
      // 创建草稿内容
      const content = await Db.create("contents", {
        topic_id: topicId,
        title: topic.title,
        body: topic.description || "",
        status: "draft",
        tags: topic.keywords || [],
      });
      // 选题状态 → 创作中
      await Db.update("topics", topicId, { status: "creating" });
      toast("已创建内容草稿，跳转到创作中心");
      closeModal();
      await loadList();
      // 切换到内容创作页，再打开草稿编辑器
      await window.switchPage("content");
      ContentEditor.open(content.id);
    } catch (e) {
      toast("创建失败: " + e.message);
    }
  }

  function statusLabel(s) {
    return STATUS_FLOW.find(x => x.key === s)?.label || s;
  }

  return { render, loadList };
  })();
  return Topics;
});
