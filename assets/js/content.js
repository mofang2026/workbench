/**
 * 内容创作中心 · 一稿多平台
 * - 通用原稿区（标题/正文/大纲/观点）
 * - 八大平台独立适配面板（小红书/抖音/B站/公众号）
 * - AI 跨平台一键改写
 * - AI 内容打分 + 质检清单
 */

WB.define("ContentEditor", ["Topics", "Keywords", "Db", "WorkbenchConfig", "AiGateway", "Calendar"], (Topics, Keywords, Db, WorkbenchConfig, AiGateway, Calendar) => {
  const ContentEditor = (function () {
  const PLATFORMS = {
    xhs: {
      name: "小红书",
      charLimit: 1000,
      fields: ["title", "body", "tags", "cover_text", "summary"],
      fieldLabels: { title: "标题（≤20字）", body: "正文", tags: "话题标签", cover_text: "首图文案", summary: "笔记摘要" },
      rewritePrompt: "改写为小红书风格：标题吸睛带emoji、段落短句化、正文口语化、3-5个话题标签、首图文案简洁有力、笔记摘要30字内。",
    },
    douyin: {
      name: "抖音",
      charLimit: 2000,
      fields: ["title", "body", "shot_split", "duration", "top_comment", "hot_words"],
      fieldLabels: { title: "视频标题", body: "口播文案", shot_split: "镜头拆分", duration: "时长配置", top_comment: "置顶评论", hot_words: "话题热词" },
      rewritePrompt: "改写为抖音短视频脚本：口播文案节奏感强、镜头拆分按时间轴、时长配置合理、置顶评论引导互动、话题热词3-5个。",
    },
    bilibili: {
      name: "B站",
      charLimit: 2000,
      fields: ["title", "body", "cover_text", "danmaku_keywords", "top_text", "partition"],
      fieldLabels: { title: "视频标题", body: "长简介", cover_text: "封面文案", danmaku_keywords: "弹幕关键词", top_text: "置顶文案", partition: "分区选择" },
      rewritePrompt: "改写为B站风格：标题有梗、长简介详尽、封面文案醒目、弹幕关键词3-5个、置顶文案互动、分区选择合适。",
    },
    wechat: {
      name: "公众号",
      charLimit: 5000,
      fields: ["title", "body", "subtitle", "ending", "original_decl", "cover_text"],
      fieldLabels: { title: "标题", body: "正文", subtitle: "小标题优化", ending: "首尾引导", original_decl: "原创声明", cover_text: "封面图配置" },
      rewritePrompt: "改写为公众号风格：标题有信息量、正文长文排版、小标题层次清晰、首尾引导关注、原创声明规范、封面图配置说明。",
    },
    shipinhao: {
      name: "视频号",
      charLimit: 1500,
      fields: ["title", "body", "shot_split", "duration", "hot_words"],
      fieldLabels: { title: "视频标题", body: "口播文案", shot_split: "镜头拆分", duration: "时长配置", hot_words: "话题热词" },
      rewritePrompt: "改写为视频号风格：接地气口语化、开头3秒抓眼球、镜头拆分清晰、时长合理、配合正能量话题热词3-5个。",
    },
    kuaishou: {
      name: "快手",
      charLimit: 1500,
      fields: ["title", "body", "shot_split", "duration", "cover_text"],
      fieldLabels: { title: "视频标题", body: "口播文案", shot_split: "镜头拆分", duration: "时长配置", cover_text: "封面文案" },
      rewritePrompt: "改写为快手风格：老铁口语化、真实感强、开头冲突前置、镜头拆分接地气、封面文案吸睛。",
    },
    weibo: {
      name: "微博",
      charLimit: 2000,
      fields: ["title", "body", "tags", "at_list", "summary"],
      fieldLabels: { title: "博文标题", body: "博文正文", tags: "话题标签", at_list: "@提及", summary: "导语摘要" },
      rewritePrompt: "改写为微博风格：简洁犀利有观点、开头抓热点、用2-3个#话题#、引导转发评论、@相关账号。",
    },
    toutiao: {
      name: "今日头条",
      charLimit: 3000,
      fields: ["title", "body", "subtitle", "summary", "cover_text"],
      fieldLabels: { title: "标题", body: "正文", subtitle: "小标题优化", summary: "摘要", cover_text: "封面图配置" },
      rewritePrompt: "改写为今日头条风格：标题说清楚价值、正文信息密度高、小标题分层、摘要概括核心点、符合头条推荐机制。",
    },
  };

  const STATUS_FLOW = [
    { key: "draft", label: "草稿" },
    { key: "creating", label: "创作中" },
    { key: "qa_passed", label: "质检完成" },
    { key: "pending_publish", label: "待发布" },
    { key: "published", label: "已发布" },
    { key: "reviewed", label: "已复盘" },
  ];

  let currentContent = null;
  let activePlatform = "xhs";

  async function render() {
    const wrap = $("page-content");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">CONTENT · 内容创作中心</p>
        <h1>内容创作中心</h1>
        <p class="sub">一次原稿，八大平台智能适配 · <span class="ai-badge">AI 辅助</span></p>
      </div>

      <div class="card">
        <div class="toolbar">
          <input id="contentSearch" class="input" placeholder="搜索标题..." style="flex:1; min-width:200px;" />
          <select id="contentFilterStatus" class="select">
            <option value="all">全部状态</option>
            ${STATUS_FLOW.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
            <option value="archived">已归档</option>
          </select>
          <button id="btnNewContent" class="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            新建文稿
          </button>
        </div>
        <!-- U4 批量操作栏 -->
        <div id="batchBar" class="toolbar hidden" style="border-top:1px solid var(--line); margin-top:8px; padding-top:8px;">
          <span class="text-xs muted" id="batchCount">已选 0 项</span>
          <span class="text-xs muted">|</span>
          <span class="text-xs muted">批量改状态：</span>
          <select id="batchStatus" class="select" style="width:auto;">
            ${STATUS_FLOW.map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
            <option value="archived">归档</option>
          </select>
          <button class="btn btn-ghost btn-sm" id="btnBatchApply">应用</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchArchive">归档</button>
          <button class="btn btn-ghost btn-sm" id="btnBatchDelete">删除</button>
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" id="btnBatchClear">取消选择</button>
        </div>
        <div id="contentList"></div>
      </div>

      <!-- 合并：选题灵感库 -->
      <h3 class="section-title mt-lg">选题灵感库</h3>
      <div id="contentTopics"></div>

      <!-- 合并：关键词库 -->
      <h3 class="section-title mt-lg">关键词库</h3>
      <div id="contentKeywords"></div>
    `;

    $("contentSearch").addEventListener("input", () => loadList());
    $("contentFilterStatus").addEventListener("change", () => loadList());
    $("btnNewContent").addEventListener("click", () => openEditor(null));

    // U4 批量操作事件
    $("btnBatchApply").addEventListener("click", () => batchUpdate("status", $("batchStatus").value));
    $("btnBatchArchive").addEventListener("click", () => batchUpdate("status", "archived"));
    $("btnBatchDelete").addEventListener("click", batchDelete);
    $("btnBatchClear").addEventListener("click", clearSelection);

    await loadList();

    // 合并渲染：选题灵感库 + 关键词库（内容页编辑器下方）
    if (Topics) await Topics.render({ wrapper: $("contentTopics"), noHero: true });
    if (Keywords) await Keywords.render({ wrapper: $("contentKeywords"), noHero: true });
  }

  // U4 批量选择
  let selectedIds = new Set();

  function toggleSelect(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBatchBar();
  }

  function updateBatchBar() {
    const bar = $("batchBar");
    if (!bar) return;
    bar.classList.toggle("hidden", selectedIds.size === 0);
    const cnt = $("batchCount");
    if (cnt) cnt.textContent = `已选 ${selectedIds.size} 项`;
    // 同步 checkbox 状态（不含全选）
    document.querySelectorAll('.batch-check[data-id]').forEach(el => {
      el.checked = selectedIds.has(el.dataset.id);
    });
    const allBox = $("batchSelectAll");
    if (allBox) {
      const visibleIds = [...document.querySelectorAll('.batch-check[data-id]')].map(el => el.dataset.id);
      allBox.checked = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
      allBox.indeterminate = visibleIds.some(id => selectedIds.has(id)) && !allBox.checked;
    }
  }

  function clearSelection() {
    selectedIds.clear();
    updateBatchBar();
  }

  async function batchUpdate(field, value) {
    if (selectedIds.size === 0) { toast("请先勾选内容"); return; }
    const ids = [...selectedIds];
    const ok = await confirm(`确定将选中的 ${ids.length} 项${field === "status" ? `状态改为「${statusLabel(value)}」` : ""}？`);
    if (!ok) return;
    try {
      await Db.updateMany("contents", ids, { [field]: value });
      toast(`已更新 ${ids.length} 项`);
      clearSelection();
      await loadList();
    } catch (e) {
      toast("批量操作失败: " + e.message);
    }
  }

  async function batchDelete() {
    if (selectedIds.size === 0) { toast("请先勾选内容"); return; }
    const ids = [...selectedIds];
    const ok = await confirm(`确定删除选中的 ${ids.length} 项内容？此操作不可恢复！`);
    if (!ok) return;
    try {
      const c = WorkbenchConfig.getSupabase();
      const { error } = await c.from("contents").delete().in("id", ids);
      if (error) throw new Error(error.message);
      toast(`已删除 ${ids.length} 项`);
      clearSelection();
      await loadList();
    } catch (e) {
      toast("删除失败: " + e.message);
    }
  }

  async function loadList() {
    const searchKw = ($("contentSearch")?.value || "").trim().toLowerCase();
    const filterStatus = $("contentFilterStatus")?.value || "all";
    try {
      const list = await Db.list("contents", {
        select: "id, title, status, tags, ai_score, ai_checkpassed, updated_at, topic_id",
        order: { col: "updated_at", ascending: false },
      });

      let filtered = list;
      if (filterStatus !== "all") filtered = filtered.filter(c => c.status === filterStatus);
      if (searchKw) filtered = filtered.filter(c => (c.title || "").toLowerCase().includes(searchKw));

      const wrap = $("contentList");
      if (filtered.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="em-icon">✍️</div>
            <div>${list.length === 0 ? "还没有文稿，点击「新建文稿」开始创作" : "没有符合条件的文稿"}</div>
          </div>`;
        return;
      }

      // U4：表头全选 + 列表项 checkbox
      const headerRow = `
        <div class="list-item" style="border:none; background:var(--surface-soft); padding:8px 12px; margin-bottom:4px;">
          <div class="row gap-sm" style="align-items:center;">
            <input type="checkbox" id="batchSelectAll" class="batch-check-all" ${[...selectedIds].length > 0 && filtered.every(c => selectedIds.has(c.id)) ? "checked" : ""} />
            <span class="text-xs muted">全选当前页（${filtered.length} 项）</span>
          </div>
        </div>
      `;

      wrap.innerHTML = headerRow + filtered.map(c => {
        const score = c.ai_score?.total;
        const platforms = Object.keys(c.adaptations || {});
        const platformTags = platforms.map(p => PLATFORMS[p]?.name).filter(Boolean).join("/");
        const checked = selectedIds.has(c.id);
        return `
          <div class="list-item row gap-sm" data-id="${c.id}" style="align-items:flex-start;">
            <input type="checkbox" class="batch-check" data-id="${c.id}" ${checked ? "checked" : ""} style="margin-top:4px;" />
            <div style="flex:1; min-width:0;">
              <div class="list-item-head">
                <div class="list-item-title">${escapeHtml(c.title || "无标题")}</div>
                <span class="status-badge status-${c.status}">${statusLabel(c.status)}</span>
              </div>
              <div class="list-item-meta">
                ${c.ai_checkpassed ? `<span class="tag ok">质检通过</span>` : ""}
                ${score ? `<span class="tag brand">AI评分 ${score}</span>` : ""}
                ${platformTags ? `<span class="tag">${escapeHtml(platformTags)}</span>` : ""}
                ${(c.tags || []).slice(0, 3).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}
                <span>· ${formatDate(c.updated_at)}</span>
              </div>
            </div>
          </div>
        `;
      }).join("");

      // 全选事件
      $("batchSelectAll").addEventListener("change", (e) => {
        filtered.forEach(c => {
          if (e.target.checked) selectedIds.add(c.id);
          else selectedIds.delete(c.id);
        });
        updateBatchBar();
      });

      // 单项 checkbox
      wrap.querySelectorAll(".batch-check[data-id]").forEach(el => {
        el.addEventListener("click", (e) => e.stopPropagation());
        el.addEventListener("change", (e) => toggleSelect(el.dataset.id, e.target.checked));
      });

      // 点击行 → 打开编辑器（checkbox 区域已 stopPropagation）
      wrap.querySelectorAll(".list-item[data-id]").forEach(el => {
        el.addEventListener("click", () => openEditor(el.dataset.id));
      });

      updateBatchBar();
    } catch (e) {
      $("contentList").innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  async function openEditor(id) {
    if (id) {
      try {
        currentContent = await Db.get("contents", id);
      } catch (e) {
        toast("加载失败: " + e.message);
        return;
      }
    } else {
      currentContent = {
        id: null, title: "", body: "", outline: "", key_points: "",
        adaptations: {}, status: "draft", tags: [], ai_score: null, ai_checkpassed: false,
        qa_snapshot: {},
      };
    }

    activePlatform = "xhs";
    renderEditor();
  }

  function renderEditor() {
    const c = currentContent;
    const wrap = $("page-content");
    wrap.innerHTML = `
      <div class="hero">
        <div class="row-between">
          <div>
            <p class="eyebrow muted-2 text-xs">CONTENT EDITOR</p>
            <h1>${c.id ? "编辑文稿" : "新建文稿"}</h1>
          </div>
          <div class="row gap-sm">
            <button class="btn btn-ghost" id="btnBackToList">← 返回列表</button>
            <button class="btn btn-primary" id="btnSaveContent">保存</button>
          </div>
        </div>
      </div>

      <div class="editor-layout">
        <!-- 左：通用原稿 -->
        <div>
          <div class="editor-section mb-md">
            <div class="editor-section-title">
              <span>通用原稿</span>
              <span class="status-badge status-${c.status}">${statusLabel(c.status)}</span>
            </div>
            <div class="field">
              <label class="field-label">
                <span>标题 *</span>
                <button class="btn btn-warm btn-sm" id="btnTitleLab" type="button" style="float:right; padding:2px 10px;">AI 标题工坊</button>
              </label>
              <input id="cTitle" class="input" value="${escapeAttr(c.title)}" placeholder="内容主标题" />
            </div>
            <div class="field">
              <label class="field-label">核心观点</label>
              <textarea id="cKeyPoints" class="textarea" placeholder="一句话概括核心观点">${escapeHtml(c.key_points || "")}</textarea>
            </div>
            <div class="field">
              <label class="field-label">内容大纲</label>
              <textarea id="cOutline" class="textarea" placeholder="大纲结构...">${escapeHtml(c.outline || "")}</textarea>
            </div>
            <div class="field">
              <label class="field-label">
                <span>正文</span>
                <span class="md-toolbar">
                  <button class="btn btn-ghost btn-sm active" id="btnMdEdit" type="button">编辑</button>
                  <button class="btn btn-ghost btn-sm" id="btnMdPreview" type="button">预览</button>
                  <button class="btn btn-ghost btn-sm" id="btnMdExport" type="button">导出 HTML</button>
                  <button class="btn btn-ghost btn-sm" id="btnMdCopy" type="button">复制富文本</button>
                </span>
              </label>
              <textarea id="cBody" class="textarea" style="min-height:200px;" placeholder="完整正文（支持 Markdown 语法）...">${escapeHtml(c.body || "")}</textarea>
              <div id="cBodyPreview" class="md-preview hidden"></div>
              <div class="char-count" id="cBodyCount"></div>
            </div>
            <!-- U9 一键插入素材 -->
            <div class="row gap-sm" style="flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" id="btnInsertAsset" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                插入素材
              </button>
              <span class="text-xs muted" id="linkedAssetsInfo">${(c.material_ids || []).length ? `已关联 ${(c.material_ids).length} 个素材` : ""}</span>
            </div>
            <div class="field">
              <label class="field-label">标签（逗号分隔）</label>
              <input id="cTags" class="input" value="${escapeAttr((c.tags || []).join(", "))}" placeholder="标签1, 标签2" />
            </div>
          </div>

          <!-- AI 工具区 -->
          <div class="editor-section">
            <div class="editor-section-title">
              <span>AI 辅助</span>
              <span class="ai-badge">DeepSeek</span>
            </div>
            <div class="col gap-sm">
              <button class="btn btn-warm" id="btnAiRewriteAll">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/></svg>
                一键跨平台改写（八大平台）
              </button>
              <div class="grid grid-2">
                <button class="btn btn-ghost btn-sm" id="btnAiTitle">优化标题</button>
                <button class="btn btn-ghost btn-sm" id="btnAiRefine">精简正文</button>
                <button class="btn btn-ghost btn-sm" id="btnAiExpand">扩写正文</button>
                <button class="btn btn-ghost btn-sm" id="btnAiQuote">金句润色</button>
              </div>
              <button class="btn btn-primary" id="btnAiScore">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 5-3 7.5-7 9-4-1.5-7-4-7-9V6z"/></svg>
                AI 内容打分 + 风险检测
              </button>
              <button class="btn btn-danger" id="btnAiCompliance">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                AI 违规自检（敏感词 / 限流风险）
              </button>
            </div>
            <div id="aiOutput" class="ai-output mt-md"></div>
          </div>
        </div>

        <!-- 右：八大平台适配 + 评分 + 质检 -->
        <div>
          <!-- 平台 Tab -->
          <div class="platform-tabs">
            ${Object.entries(PLATFORMS).map(([k, p]) => `
              <div class="platform-tab ${k} ${activePlatform === k ? "active" : ""}" data-platform="${k}">${p.name}</div>
            `).join("")}
          </div>

          <!-- 适配编辑区 -->
          <div class="editor-section mb-md" id="adaptPanel"></div>

          <!-- AI 评分 -->
          ${c.ai_score ? renderScoreCard(c.ai_score) : ""}

          <!-- AI 违规自检报告 -->
          ${c.compliance_report ? renderComplianceReport(c.compliance_report) : ""}

          <!-- 质检清单 -->
          <div class="editor-section mt-md">
            <div class="editor-section-title">
              <span>发布前质检清单</span>
              <span class="text-xs muted" id="qaProgress">0/0</span>
            </div>
            <div id="qaList"></div>
            <button class="btn btn-primary btn-sm mt-md" id="btnQaPass" style="width:100%; justify-content:center;">
              全部自检完成 → 标记质检通过
            </button>
          </div>

          <!-- 状态流转 + 排期 -->
          <div class="editor-section mt-md">
            <div class="editor-section-title">状态与排期</div>
            <div class="field">
              <label class="field-label">内容状态</label>
              <select id="cStatus" class="select">
                ${STATUS_FLOW.map(s => `<option value="${s.key}" ${c.status === s.key ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </div>
            <button class="btn btn-warm" id="btnToSchedule" style="width:100%; justify-content:center;">
              创建排期 →
            </button>
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    $("btnBackToList").addEventListener("click", backToList);
    $("btnSaveContent").addEventListener("click", saveContent);
    // U9 插入素材
    $("btnInsertAsset").addEventListener("click", openAssetPicker);

    $("cBody").addEventListener("input", updateBodyCount);
    updateBodyCount();

    // Markdown 工具栏
    $("btnMdEdit").addEventListener("click", () => toggleMdMode("edit"));
    $("btnMdPreview").addEventListener("click", () => toggleMdMode("preview"));
    $("btnMdExport").addEventListener("click", exportBodyHtml);
    $("btnMdCopy").addEventListener("click", copyBodyRichText);

    // 平台 Tab
    document.querySelectorAll(".platform-tab").forEach(el => {
      el.addEventListener("click", () => {
        activePlatform = el.dataset.platform;
        document.querySelectorAll(".platform-tab").forEach(t => t.classList.remove("active"));
        el.classList.add("active");
        renderAdaptPanel();
      });
    });

    // AI 按钮
    $("btnAiRewriteAll").addEventListener("click", aiRewriteAll);
    $("btnAiTitle").addEventListener("click", () => aiSingleAction("title", "优化标题，使其更有吸引力和信息量，输出3个候选标题。"));
    $("btnTitleLab").addEventListener("click", openTitleLab);
    $("btnAiRefine").addEventListener("click", () => aiSingleAction("refine", "精简正文，去除冗余，保持核心信息。"));
    $("btnAiExpand").addEventListener("click", () => aiSingleAction("expand", "扩写正文，补充细节和案例，保持原意。"));
    $("btnAiQuote").addEventListener("click", () => aiSingleAction("quote", "从正文中提取或润色3句金句，便于传播。"));
    $("btnAiScore").addEventListener("click", aiScore);
    $("btnAiCompliance").addEventListener("click", aiComplianceCheck);

    $("btnQaPass").addEventListener("click", markQaPassed);
    $("btnToSchedule").addEventListener("click", createSchedule);

    // 自检报告"应用到正文"按钮（条件渲染）
    const btnApplyRevised = $("btnApplyRevised");
    if (btnApplyRevised) {
      btnApplyRevised.addEventListener("click", () => {
        const revised = currentContent.compliance_report?.revised_body;
        if (revised) {
          $("cBody").value = revised;
          updateBodyCount();
          toast("已应用 AI 修改后的正文");
        }
      });
    }

    renderAdaptPanel();
    renderQaList();
  }

  function renderAdaptPanel() {
    const p = PLATFORMS[activePlatform];
    const adaptations = currentContent.adaptations || {};
    const data = adaptations[activePlatform] || {};

    const panel = $("adaptPanel");
    panel.innerHTML = `
      <div class="editor-section-title">
        <span>${p.name} 专属适配</span>
        <button class="btn btn-warm btn-sm" id="btnRewriteOne">
          AI 改写本平台 →
        </button>
      </div>
      ${p.fields.map(f => `
        <div class="field">
          <label class="field-label">
            ${f === "body" ? `<span>${p.fieldLabels[f] || f}</span><span class="md-toolbar"><button class="btn btn-ghost btn-sm active" data-adapt-md="edit">编辑</button><button class="btn btn-ghost btn-sm" data-adapt-md="preview">预览</button></span>` : (p.fieldLabels[f] || f)}
          </label>
          <textarea id="adapt_${f}" class="textarea" ${f === "tags" || f === "hot_words" || f === "danmaku_keywords" ? 'style="min-height:60px;"' : ""} placeholder="${p.fieldLabels[f] || f}">${escapeHtml(data[f] || "")}</textarea>
          ${f === "body" ? `<div id="adapt_body_preview" class="md-preview hidden"></div><div class="char-count" id="adapt_${f}_count"></div>` : ""}
        </div>
      `).join("")}
    `;

    $("btnRewriteOne").addEventListener("click", () => aiRewriteOne(activePlatform));

    // 字数计数
    const bodyField = $(`adapt_body`);
    if (bodyField) {
      bodyField.addEventListener("input", () => updateAdaptCount(activePlatform));
      updateAdaptCount(activePlatform);
    }

    // 平台适配 body 的预览切换
    panel.querySelectorAll("[data-adapt-md]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.adaptMd;
        const ta = $("adapt_body");
        const pv = $("adapt_body_preview");
        if (!ta || !pv) return;
        if (mode === "preview") {
          pv.innerHTML = renderMarkdown(ta.value);
          pv.classList.remove("hidden");
          ta.classList.add("hidden");
        } else {
          pv.classList.add("hidden");
          ta.classList.remove("hidden");
        }
        panel.querySelectorAll("[data-adapt-md]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function renderScoreCard(score) {
    const total = score.total || 0;
    const deg = (total / 100) * 360;
    const items = [
      { key: "completeness", label: "完整度" },
      { key: "adaptability", label: "适配度" },
      { key: "viral_potential", label: "爆款潜力" },
      { key: "compliance", label: "合规性" },
    ];

    return `
      <div class="editor-section">
        <div class="editor-section-title">
          <span>AI 评分</span>
          <span class="text-xs muted">${score.risk_level || ""}</span>
        </div>
        <div class="score-card">
          <div class="score-total" style="background: conic-gradient(var(--brand) ${deg}deg, var(--surface-soft) 0deg);">
            <span>${total}</span>
          </div>
          <div class="score-bars">
            ${items.map(it => {
              const v = score[it.key] || 0;
              return `
                <div class="score-bar">
                  <span class="score-bar-label">${it.label}</span>
                  <div class="score-bar-track"><div class="score-bar-fill" style="width:${v}%"></div></div>
                  <span class="score-bar-val">${v}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
        ${score.risk_warnings?.length ? `
          <div class="mt-md">
            <div class="text-xs text-warm mb-sm">⚠ 风险提示</div>
            ${score.risk_warnings.map(w => `<div class="alert-item"><span class="alert-dot warn"></span><span>${escapeHtml(w)}</span></div>`).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  const QA_ITEMS = [
    { cat: "封面", text: "封面图已准备，尺寸符合平台要求" },
    { cat: "标题", text: "标题无违规词，长度合适" },
    { cat: "标签", text: "话题标签已添加，数量合适" },
    { cat: "敏感词", text: "已自查敏感词，无违规风险" },
    { cat: "排版", text: "排版规范，段落清晰" },
  ];

  function renderQaList() {
    const snapshot = currentContent.qa_snapshot || {};
    const platform = activePlatform;
    const checked = snapshot[platform] || [];
    const wrap = $("qaList");
    wrap.innerHTML = QA_ITEMS.map((item, i) => `
      <div class="qa-item ${checked.includes(i) ? "checked" : ""}" data-idx="${i}">
        <span class="qa-check">${checked.includes(i) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 13 4 4 10-10"/></svg>' : ""}</span>
        <span class="qa-text">${item.text}</span>
        <span class="qa-cat">${item.cat}</span>
      </div>
    `).join("");

    wrap.querySelectorAll(".qa-item").forEach(el => {
      el.addEventListener("click", () => toggleQa(parseInt(el.dataset.idx)));
    });

    $("qaProgress").textContent = `${checked.length}/${QA_ITEMS.length}`;
  }

  function toggleQa(idx) {
    const snapshot = currentContent.qa_snapshot || {};
    const platform = activePlatform;
    const checked = snapshot[platform] || [];
    const i = checked.indexOf(idx);
    if (i >= 0) checked.splice(i, 1);
    else checked.push(idx);
    snapshot[platform] = checked;
    currentContent.qa_snapshot = snapshot;
    renderQaList();
  }

  function updateBodyCount() {
    const len = $("cBody").value.length;
    const el = $("cBodyCount");
    el.textContent = `${len} 字`;
    el.className = "char-count" + (len > 5000 ? " danger" : len > 3000 ? " warn" : "");
  }

  // ========== Markdown 排版预览 ==========

  function renderMarkdown(text) {
    if (!text) return '<p class="muted text-sm">暂无内容，请先在编辑模式输入正文</p>';
    try {
      if (window.marked) {
        window.marked.setOptions({ breaks: true, gfm: true });
        return window.marked.parse(text);
      }
      return `<pre>${escapeHtml(text)}</pre>`;
    } catch (e) {
      return `<pre>${escapeHtml(text)}</pre>`;
    }
  }

  function toggleMdMode(mode) {
    const ta = $("cBody");
    const pv = $("cBodyPreview");
    const btnEdit = $("btnMdEdit");
    const btnPv = $("btnMdPreview");
    if (mode === "preview") {
      pv.innerHTML = renderMarkdown(ta.value);
      pv.classList.remove("hidden");
      ta.classList.add("hidden");
      btnPv.classList.add("active");
      btnEdit.classList.remove("active");
    } else {
      pv.classList.add("hidden");
      ta.classList.remove("hidden");
      btnEdit.classList.add("active");
      btnPv.classList.remove("active");
    }
  }

  function buildStandaloneHtml(title, bodyHtml) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || "无标题")}</title>
<style>
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#222;line-height:1.8;}
  h1{font-size:1.8em;border-bottom:2px solid #eee;padding-bottom:.3em;}
  h2{font-size:1.4em;border-bottom:1px solid #eee;padding-bottom:.3em;}
  h3{font-size:1.2em;}
  blockquote{border-left:4px solid #59c4ff;background:#f0f8ff;padding:10px 16px;margin:1em 0;color:#555;border-radius:0 6px 6px 0;}
  code{background:#f5f5f5;padding:2px 6px;border-radius:4px;font-family:"JetBrains Mono",monospace;font-size:.9em;color:#c7254e;}
  pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;}
  pre code{background:none;color:inherit;padding:0;}
  img{max-width:100%;border-radius:8px;}
  table{border-collapse:collapse;width:100%;margin:1em 0;}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;}
  th{background:#f8f9fa;}
  a{color:#59c4ff;}
  hr{border:none;border-top:2px solid #eee;margin:2em 0;}
</style>
</head>
<body>
<h1>${escapeHtml(title || "无标题")}</h1>
${bodyHtml}
</body>
</html>`;
  }

  function exportBodyHtml() {
    const text = $("cBody").value;
    const title = $("cTitle").value;
    const html = buildStandaloneHtml(title, renderMarkdown(text));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "正文").replace(/[\\/:*?"<>|]/g, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("已导出 HTML 文件");
  }

  async function copyBodyRichText() {
    const text = $("cBody").value;
    const title = $("cTitle").value;
    const bodyHtml = renderMarkdown(text);
    const fullHtml = `<h1>${escapeHtml(title || "无标题")}</h1>${bodyHtml}`;
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const blob = new Blob([fullHtml], { type: "text/html" });
        const item = new ClipboardItem({ "text/html": blob });
        await navigator.clipboard.write([item]);
        toast("已复制富文本到剪贴板，可直接粘贴到公众号/知乎");
      } else {
        throw new Error("浏览器不支持富文本复制");
      }
    } catch (e) {
      // 降级：复制纯文本
      try {
        await navigator.clipboard.writeText(text);
        toast("已复制纯文本（浏览器不支持富文本复制）");
      } catch (e2) {
        toast("复制失败: " + e2.message);
      }
    }
  }

  function updateAdaptCount(platform) {
    const field = $(`adapt_body`);
    if (!field) return;
    const len = field.value.length;
    const limit = PLATFORMS[platform].charLimit;
    const el = $(`adapt_body_count`);
    if (!el) return;
    el.textContent = `${len} / ${limit} 字`;
    el.className = "char-count" + (len > limit ? " danger" : len > limit * 0.9 ? " warn" : "");
  }

  // ========== U9 素材插入 ==========

  async function openAssetPicker() {
    let assets = [];
    try {
      assets = await Db.list("assets", {
        select: "id, type, title, url, content, tags, platform, is_favorite, created_at",
        order: { col: "created_at", ascending: false },
        limit: 200,
      });
    } catch (e) {
      toast("加载素材失败: " + e.message);
      return;
    }

    if (assets.length === 0) {
      toast("素材库为空，请先在「素材资源库」添加");
      return;
    }

    const TYPES = { cover: "🖼️", image: "📷", sticker: "😊", video_clip: "🎬", bgm: "🎵", quote: "✍️" };
    const linked = new Set(currentContent.material_ids || []);

    showModal(`
      <div class="modal-head">
        <h3>插入素材</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="row gap-sm mb-sm" style="flex-wrap:wrap;">
        <input id="apSearch" class="input" style="flex:1; min-width:160px;" placeholder="搜索标题/标签/文案..." />
        <select id="apType" class="select" style="width:auto;">
          <option value="all">全部类型</option>
          ${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v} ${k}</option>`).join("")}
        </select>
        <button class="btn btn-warm btn-sm" id="btnApAiRecommend" title="根据正文内容智能推荐素材">AI 智能推荐</button>
      </div>
      <div id="apList" style="max-height:380px; overflow-y:auto;"></div>
      <div class="modal-foot">
        <span class="text-xs muted">已选 <b id="apSelected">0</b> 项</span>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnApInsert">插入到正文光标处</button>
      </div>
    `);

    let picked = new Set();
    let filteredAssets = assets;

    function renderList() {
      const wrap = $("apList");
      if (filteredAssets.length === 0) {
        wrap.innerHTML = `<div class="empty-state">无匹配素材</div>`;
        return;
      }
      wrap.innerHTML = filteredAssets.map(a => {
        const t = TYPES[a.type] || "📦";
        const isLinked = linked.has(a.id);
        const isPicked = picked.has(a.id);
        return `
          <div class="list-item row gap-sm" data-id="${a.id}" style="align-items:flex-start; cursor:pointer; ${isPicked ? "border-color:var(--brand);" : ""}">
            <input type="checkbox" class="ap-check" data-id="${a.id}" ${isPicked ? "checked" : ""} style="margin-top:4px;" />
            <div style="flex:1; min-width:0;">
              <div class="list-item-head">
                <div class="list-item-title">${t} ${escapeHtml(a.title || "未命名")}</div>
                ${isLinked ? '<span class="tag ok">已关联</span>' : ""}
                ${a.is_favorite ? '<span class="tag warn">⭐</span>' : ""}
              </div>
              ${a.content ? `<div class="list-item-desc">${escapeHtml(a.content.slice(0, 80))}</div>` : ""}
              <div class="list-item-meta">
                ${a.url ? `<a href="${escapeAttr(a.url)}" target="_blank" class="text-xs brand">链接 →</a>` : ""}
                <span>· ${a.platform || "通用"}</span>
              </div>
            </div>
          </div>
        `;
      }).join("");

      wrap.querySelectorAll(".list-item[data-id]").forEach(el => {
        el.addEventListener("click", (e) => {
          if (e.target.tagName === "A") return;
          const id = el.dataset.id;
          if (picked.has(id)) picked.delete(id);
          else picked.add(id);
          renderList();
          updateSelectedCount();
        });
      });
    }

    function updateSelectedCount() {
      const el = $("apSelected");
      if (el) el.textContent = picked.size;
    }

    function applyFilter() {
      const kw = ($("apSearch").value || "").trim().toLowerCase();
      const type = $("apType").value;
      filteredAssets = assets.filter(a => {
        if (type !== "all" && a.type !== type) return false;
        if (kw) {
          const txt = `${a.title || ""} ${a.content || ""} ${(a.tags || []).join(" ")}`.toLowerCase();
          if (!txt.includes(kw)) return false;
        }
        return true;
      });
      renderList();
    }

    $("apSearch").addEventListener("input", applyFilter);
    $("apType").addEventListener("change", applyFilter);

    // AI 智能推荐：根据正文内容推荐相关素材
    $("btnApAiRecommend").addEventListener("click", async () => {
      const body = readOriginal();
      if (!body.body) { toast("请先填写正文"); return; }
      if (assets.length === 0) { toast("素材库为空"); return; }

      const btn = $("btnApAiRecommend");
      btn.disabled = true;
      btn.textContent = "AI 分析中...";

      try {
        const assetBriefs = assets.slice(0, 80).map((a, i) => `${i + 1}. [${a.type}] ${a.title || ""} | ${(a.content || "").slice(0, 30)} | ${(a.tags || []).join("/")}`).join("\n");

        const prompt = `你是内容创作助手。请根据正文内容，从素材库中推荐最相关的 5 个素材。\n\n正文标题：${body.title || "无"}\n正文摘要：${body.body.slice(0, 500)}\n\n素材库：\n${assetBriefs}\n\n请输出最相关的 5 个素材的序号，按相关性排序。\n严格按 JSON 数组格式输出，如 [1, 5, 12, 23, 30]\n只输出 JSON 数组。`;

        const text = await AiGateway.generate(prompt, {
          system: "你是内容创作素材推荐专家。",
          maxTokens: 200,
        });
        const parsed = tryParseJson(text);

        if (Array.isArray(parsed) && parsed.length > 0) {
          // 选中推荐的素材
          picked.clear();
          parsed.forEach(num => {
            const idx = parseInt(num) - 1;
            if (idx >= 0 && idx < assets.length) {
              picked.add(assets[idx].id);
            }
          });
          // 筛选显示推荐的素材
          filteredAssets = assets.filter(a => picked.has(a.id));
          renderList();
          updateSelectedCount();
          toast(`AI 推荐了 ${picked.size} 个相关素材`);
        } else {
          toast("AI 推荐失败，请重试");
        }
      } catch (e) {
        toast("AI 推荐失败: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "AI 智能推荐";
      }
    });

    renderList();

    $("btnApInsert").addEventListener("click", () => {
      if (picked.size === 0) { toast("请先勾选要插入的素材"); return; }
      const selected = assets.filter(a => picked.has(a.id));
      // 拼接插入文本：金句→content；其他→[标题](url) 或 标题
      const text = selected.map(a => {
        if (a.type === "quote" && a.content) return a.content;
        if (a.url) return `[${a.title || a.type}](${a.url})`;
        return a.title || "";
      }).filter(Boolean).join("\n\n");

      // 插入到正文光标处
      const body = $("cBody");
      if (body) {
        const start = body.selectionStart;
        const end = body.selectionEnd;
        const before = body.value.slice(0, start);
        const after = body.value.slice(end);
        const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
        body.value = before + prefix + text + "\n" + after;
        body.focus();
        const pos = (before + prefix + text).length;
        body.setSelectionRange(pos, pos);
        updateBodyCount();
      }

      // 同时建立 material_ids 关联（去重）
      const existing = new Set(currentContent.material_ids || []);
      selected.forEach(a => existing.add(a.id));
      currentContent.material_ids = [...existing];

      // 更新提示
      const info = $("linkedAssetsInfo");
      if (info) info.textContent = `已关联 ${existing.size} 个素材`;

      toast(`已插入 ${selected.length} 个素材到正文`);
      closeModal();
    });
  }

  // ========== AI 操作 ==========

  async function aiRewriteAll() {
    const body = readOriginal();
    if (!body.body && !body.title) { toast("请先填写原稿"); return; }

    const adaptations = currentContent.adaptations || {};
    const entries = Object.entries(PLATFORMS);
    let successCount = 0;
    let doneCount = 0;

    // 串行改写，每完成一个更新进度（G5 修复）
    for (const [key, p] of entries) {
      showAiOutput(`正在生成${p.name}版本（${doneCount + 1}/${entries.length}）...`);
      try {
        const prompt = `原稿标题：${body.title}\n原稿正文：${body.body}\n\n请按以下要求改写：${p.rewritePrompt}\n\n严格按字段输出，格式为 JSON：\n${JSON.stringify(Object.fromEntries(p.fields.map(f => [f, ""])))}\n\n只输出 JSON，不要其他说明。`;
        const text = await AiGateway.generate(prompt, {
          system: "你是专业的多平台内容运营专家，精通小红书/抖音/B站/公众号的内容风格。",
          maxTokens: 2000,
        });
        const parsed = tryParseJson(text);
        if (parsed) {
          adaptations[key] = parsed;
          successCount++;
          // 完成一个就刷新当前平台面板，让用户看到进度
          currentContent.adaptations = adaptations;
          if (activePlatform === key) renderAdaptPanel();
        }
      } catch (e) {
        console.error(`${key} 改写失败`, e);
      }
      doneCount++;
    }

    currentContent.adaptations = adaptations;
    hideAiOutput();
    renderAdaptPanel();
    toast(`八大平台改写完成（${successCount}/${entries.length} 成功）`);
  }

  async function aiRewriteOne(platform) {
    const body = readOriginal();
    if (!body.body && !body.title) { toast("请先填写原稿"); return; }

    const p = PLATFORMS[platform];
    showAiOutput(`正在生成${p.name}版本...`);

    try {
      const prompt = `原稿标题：${body.title}\n原稿正文：${body.body}\n\n请按以下要求改写：${p.rewritePrompt}\n\n严格按字段输出，格式为 JSON：\n${JSON.stringify(Object.fromEntries(p.fields.map(f => [f, ""])))}\n\n只输出 JSON，不要其他说明。`;
      const text = await AiGateway.generate(prompt, {
        system: "你是专业的多平台内容运营专家。",
        maxTokens: 2000,
      });
      const parsed = tryParseJson(text);
      if (parsed) {
        const adaptations = currentContent.adaptations || {};
        adaptations[platform] = parsed;
        currentContent.adaptations = adaptations;
        renderAdaptPanel();
        toast(`${p.name}版本已生成`);
      } else {
        toast("AI 返回格式异常，请重试");
      }
      hideAiOutput();
    } catch (e) {
      hideAiOutput();
      toast("改写失败: " + e.message, 3000);
    }
  }

  // ========== AI 爆款标题工坊 ==========

  const TITLE_FORMULAS = [
    { id: "num", name: "数字清单型", template: "{数字}个{主题}技巧，第{数字}个最关键", example: "7个高效学习技巧，第3个最关键" },
    { id: "question", name: "疑问悬念型", template: "为什么{目标人群}都{行为}？真相出乎意料", example: "为什么学霸都用这个方法？真相出乎意料" },
    { id: "contrast", name: "对比反差型", template: "{A} vs {B}：差别到底有多大？", example: "自律 vs 摆烂：差别到底有多大？" },
    { id: "pain", name: "痛点共鸣型", template: "{痛点}？{数字}个方法帮你解决", example: "总是拖延？5个方法帮你解决" },
    { id: "secret", name: "揭秘型", template: "揭秘{领域}不为人知的{数字}个真相", example: "揭秘职场不为人知的3个真相" },
    { id: "story", name: "故事型", template: "从{低谷}到{高峰}，我只用了{时间}", example: "从月薪3千到年入百万，我只用了2年" },
    { id: "warning", name: "警示型", template: "千万别{行为}！后果比你想象的严重", example: "千万别熬夜！后果比你想象的严重" },
    { id: "benefit", name: "利益驱动型", template: "学会这{数字}招，{目标}轻松实现", example: "学会这3招，涨粉轻松破万" },
    { id: "emoji", name: "Emoji吸睛型", template: "{emoji} {主题}｜{亮点}", example: "🔥 自律指南｜每天早起改变人生" },
    { id: "list", name: "盘点型", template: "{年份}{领域}最全盘点，{数字}个必看", example: "2026职场技能最全盘点，5个必看" },
  ];

  function openTitleLab() {
    const currentTitle = $("cTitle").value;
    const currentBody = $("cBody").value.slice(0, 300);

    showModal(`
      <div class="modal-head">
        <h3>AI 爆款标题工坊</h3>
        <button class="modal-close" data-close>×</button>
      </div>

      <div class="tab-bar" id="titleLabTabs">
        <button class="tab active" data-tab="gen">AI 生成</button>
        <button class="tab" data-tab="formula">标题公式</button>
        <button class="tab" data-tab="score">标题评分</button>
        <button class="tab" data-tab="abtest">A/B 测试</button>
      </div>

      <div id="tlGen" class="tl-panel">
        <div class="grid grid-2">
          <div class="field">
            <label class="field-label">内容主题 *</label>
            <input id="tlTopic" class="input" value="${escapeAttr(currentTitle)}" placeholder="如：高效学习方法" />
          </div>
          <div class="field">
            <label class="field-label">目标平台</label>
            <select id="tlPlatform" class="select">
              <option value="all">通用</option>
              <option value="xhs">小红书</option>
              <option value="douyin">抖音</option>
              <option value="bilibili">B站</option>
              <option value="wechat">公众号</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">内容简述（可选，帮助 AI 更精准）</label>
          <input id="tlDesc" class="input" value="${escapeAttr(currentBody)}" placeholder="正文前300字自动填入" />
        </div>
        <div class="row gap-sm mb-md">
          <span class="text-xs muted">生成数量</span>
          <select id="tlCount" class="select" style="width:auto;">
            <option value="5">5 个</option>
            <option value="8" selected>8 个</option>
            <option value="10">10 个</option>
          </select>
          <button class="btn btn-warm" id="btnTlGen">生成标题</button>
          <span id="tlGenStatus" class="text-xs muted"></span>
        </div>
        <div id="tlGenResult"></div>
      </div>

      <div id="tlFormula" class="tl-panel hidden">
        <p class="text-xs muted mb-md">点击公式可套用生成，标题会自动填入上方输入框</p>
        <div id="tlFormulaList">
          ${TITLE_FORMULAS.map(f => `
            <div class="list-item" data-formula="${f.id}">
              <div class="list-item-head">
                <div class="list-item-title">${f.name}</div>
                <button class="btn btn-ghost btn-sm" data-use="${f.id}">套用</button>
              </div>
              <div class="text-xs muted">公式：${escapeHtml(f.template)}</div>
              <div class="text-xs muted-2 mt-xs">示例：${escapeHtml(f.example)}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div id="tlScore" class="tl-panel hidden">
        <div class="field">
          <label class="field-label">待评分标题</label>
          <input id="tlScoreTitle" class="input" value="${escapeAttr(currentTitle)}" placeholder="输入要评分的标题" />
        </div>
        <div class="row gap-sm mb-md">
          <button class="btn btn-warm" id="btnTlScore">AI 评分</button>
          <span id="tlScoreStatus" class="text-xs muted"></span>
        </div>
        <div id="tlScoreResult"></div>
      </div>

      <div id="tlAbtest" class="tl-panel hidden">
        <p class="text-xs muted mb-md">记录不同标题的实际数据，对比找出爆款规律</p>
        <div class="row gap-sm mb-md">
          <input id="abTitle" class="input" style="flex:1;" placeholder="输入标题..." />
          <select id="abPlatform" class="select" style="width:auto;">
            <option value="xhs">小红书</option>
            <option value="douyin">抖音</option>
            <option value="bilibili">B站</option>
            <option value="wechat">公众号</option>
          </select>
          <input id="abViews" class="input" type="number" style="width:90px;" placeholder="阅读" />
          <input id="abEng" class="input" type="number" style="width:90px;" placeholder="互动" />
          <button class="btn btn-primary btn-sm" id="btnAbAdd">记录</button>
        </div>
        <div id="abList"></div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);

    // Tab 切换
    document.querySelectorAll("#titleLabTabs .tab").forEach(t => {
      t.addEventListener("click", () => {
        document.querySelectorAll("#titleLabTabs .tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        document.querySelectorAll(".tl-panel").forEach(p => p.classList.add("hidden"));
        $(`tl${t.dataset.tab.charAt(0).toUpperCase() + t.dataset.tab.slice(1)}`).classList.remove("hidden");
      });
    });

    $("btnTlGen").addEventListener("click", doTitleGen);
    $("btnTlScore").addEventListener("click", doTitleScore);
    $("btnAbAdd").addEventListener("click", addAbRecord);
    document.querySelectorAll("[data-use]").forEach(btn => {
      btn.addEventListener("click", () => useFormula(btn.dataset.use));
    });
    renderAbList();
  }

  async function doTitleGen() {
    const topic = $("tlTopic").value.trim();
    const platform = $("tlPlatform").value;
    const desc = $("tlDesc").value.trim();
    const count = parseInt($("tlCount").value) || 8;
    if (!topic) { toast("请填写内容主题"); return; }

    const platformName = { all: "通用", xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号" }[platform];
    const status = $("tlGenStatus");
    const result = $("tlGenResult");
    const btn = $("btnTlGen");

    btn.disabled = true;
    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 生成中...</span>';
    result.innerHTML = "";

    try {
      const prompt = `你是爆款标题设计专家。请为主题「${topic}」生成 ${count} 个高点击率标题。\n\n平台：${platformName}\n内容简述：${desc || "无"}\n\n要求：\n1. 每个标题风格不同（数字型/疑问型/对比型/悬念型/痛点型/利益型等）\n2. 符合${platformName}平台的调性和字数习惯\n3. 有强烈点击欲望，但不标题党\n4. 长度控制在 15-30 字\n\n严格按 JSON 数组输出，每个元素含 title 和 type 两个字段：\n[{"title":"标题内容","type":"数字型"}]\n只输出 JSON。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是爆款标题设计专家，擅长为不同平台生成高点击率标题。",
        maxTokens: 1200,
      });
      const parsed = tryParseJson(text);

      if (!parsed || !Array.isArray(parsed)) {
        status.innerHTML = '<span class="text-danger">生成失败，请重试</span>';
        return;
      }

      status.innerHTML = `<span class="text-ok">✓ 已生成 ${parsed.length} 个标题，点击可填入</span>`;
      result.innerHTML = parsed.map((item, i) => `
        <div class="rec-item" data-title="${escapeAttr(item.title || "")}">
          <span class="rec-heat ${i < 3 ? "heat-high" : "heat-mid"}">${i + 1}</span>
          <div class="rec-body">
            <div class="rec-title">${escapeHtml(item.title || "")}</div>
            <span class="tag">${escapeHtml(item.type || "")}</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-fill="${escapeAttr(item.title || "")}">填入</button>
        </div>
      `).join("");

      result.querySelectorAll("[data-fill]").forEach(el => {
        el.addEventListener("click", () => {
          $("cTitle").value = el.dataset.fill;
          toast("已填入标题");
          closeModal();
        });
      });
    } catch (e) {
      status.innerHTML = `<span class="text-danger">生成失败: ${escapeHtml(e.message)}</span>`;
    } finally {
      btn.disabled = false;
    }
  }

  function useFormula(id) {
    const f = TITLE_FORMULAS.find(x => x.id === id);
    if (!f) return;
    const topic = $("tlTopic").value.trim() || "你的主题";
    showModal(`
      <div class="modal-head">
        <h3>套用公式：${f.name}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">公式：${escapeHtml(f.template)}</p>
      <div class="field">
        <label class="field-label">主题/关键词</label>
        <input id="fTopic" class="input" value="${escapeAttr(topic)}" />
      </div>
      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnFormulaGen">AI 套用生成</button>
        <span id="fStatus" class="text-xs muted"></span>
      </div>
      <div id="fResult"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);
    $("btnFormulaGen").addEventListener("click", async () => {
      const t = $("fTopic").value.trim();
      if (!t) { toast("请填写主题"); return; }
      $("fStatus").innerHTML = '<span class="ai-thinking"><span class="spinner"></span> 生成中...</span>';
      try {
        const prompt = `请根据标题公式「${f.template}」和主题「${t}」，生成 5 个不同的标题变体。\n示例：${f.example}\n\n要求：\n1. 严格遵循公式结构但内容灵活\n2. 符合自媒体爆款特征\n3. 15-30字\n\n直接输出 5 个标题，每行一个，不要序号和其他说明。`;
        const text = await AiGateway.generate(prompt, {
          system: "你是爆款标题设计专家。",
          maxTokens: 600,
        });
        const titles = text.trim().split("\n").map(s => s.replace(/^\d+[.、]\s*/, "").trim()).filter(Boolean);
        $("fStatus").innerHTML = `<span class="text-ok">✓ 生成 ${titles.length} 个</span>`;
        $("fResult").innerHTML = titles.map((title, i) => `
          <div class="rec-item">
            <span class="rec-heat heat-mid">${i + 1}</span>
            <div class="rec-body"><div class="rec-title">${escapeHtml(title)}</div></div>
            <button class="btn btn-ghost btn-sm" data-fill2="${escapeAttr(title)}">填入</button>
          </div>
        `).join("");
        $("fResult").querySelectorAll("[data-fill2]").forEach(el => {
          el.addEventListener("click", () => {
            $("cTitle").value = el.dataset.fill2;
            toast("已填入标题");
            closeModal();
          });
        });
      } catch (e) {
        $("fStatus").innerHTML = `<span class="text-danger">失败: ${escapeHtml(e.message)}</span>`;
      }
    });
  }

  async function doTitleScore() {
    const title = $("tlScoreTitle").value.trim();
    if (!title) { toast("请输入标题"); return; }

    const status = $("tlScoreStatus");
    const result = $("tlScoreResult");

    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 评分中...</span>';
    result.innerHTML = "";

    try {
      const prompt = `请对以下自媒体标题进行专业评分和分析。\n\n标题：${title}\n\n请从以下维度评分（0-100），并给出分析：\n1. 吸引力度（点击欲望）\n2. 信息量（是否传达核心价值）\n3. 情感共鸣（是否触动目标受众）\n4. 平台适配（泛平台通用性）\n5. 合规安全（无违规风险）\n\n严格按 JSON 输出：\n${JSON.stringify({ scores: { attract: 0, info: 0, emotion: 0, platform: 0, compliance: 0 }, total: 0, level: "S/A/B/C", analysis: "", suggestions: [] }, null, 2)}\n只输出 JSON。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是内容运营专家，擅长标题效果评估。",
        maxTokens: 800,
      });
      const parsed = tryParseJson(text);

      if (!parsed || !parsed.scores) {
        status.innerHTML = '<span class="text-danger">评分失败，请重试</span>';
        return;
      }

      status.innerHTML = '<span class="text-ok">✓ 评分完成</span>';
      const s = parsed.scores;
      const levelColor = { S: "var(--ok)", A: "var(--brand)", B: "var(--warn)", C: "var(--danger)" }[parsed.level] || "var(--muted)";

      result.innerHTML = `
        <div class="title-score-overview">
          <div class="title-score-level" style="color:${levelColor}; border-color:${levelColor};">${parsed.level || "B"}</div>
          <div class="title-score-total">
            <div class="title-score-num">${parsed.total || 0}</div>
            <div class="text-xs muted">总分 / 100</div>
          </div>
        </div>
        <div class="title-score-bars">
          ${Object.entries({ attract: "吸引力度", info: "信息量", emotion: "情感共鸣", platform: "平台适配", compliance: "合规安全" }).map(([k, label]) => {
            const v = s[k] || 0;
            const color = v >= 80 ? "var(--ok)" : v >= 60 ? "var(--brand)" : v >= 40 ? "var(--warn)" : "var(--danger)";
            return `<div class="score-bar-item">
              <span class="text-xs muted">${label}</span>
              <div class="score-bar"><div class="score-bar-fill" style="width:${v}%; background:${color};"></div></div>
              <span class="text-xs" style="color:${color}; min-width:28px; text-align:right;">${v}</span>
            </div>`;
          }).join("")}
        </div>
        ${parsed.analysis ? `<div class="field"><label class="field-label">分析</label><p class="text-sm">${escapeHtml(parsed.analysis)}</p></div>` : ""}
        ${parsed.suggestions && parsed.suggestions.length > 0 ? `
          <div class="field">
            <label class="field-label">优化建议</label>
            ${parsed.suggestions.map((sug, i) => `<div class="rec-item"><span class="rec-heat heat-mid">${i + 1}</span><div class="rec-body"><div class="rec-title">${escapeHtml(sug)}</div></div></div>`).join("")}
          </div>
        ` : ""}
      `;
    } catch (e) {
      status.innerHTML = `<span class="text-danger">评分失败: ${escapeHtml(e.message)}</span>`;
    }
  }

  // A/B 测试记录（localStorage）
  function getAbRecords() {
    try { return JSON.parse(localStorage.getItem("workbench-title-abtest") || "[]"); } catch { return []; }
  }
  function saveAbRecords(list) {
    localStorage.setItem("workbench-title-abtest", JSON.stringify(list));
  }

  function addAbRecord() {
    const title = $("abTitle").value.trim();
    const platform = $("abPlatform").value;
    const views = parseInt($("abViews").value) || 0;
    const eng = parseInt($("abEng").value) || 0;
    if (!title) { toast("请输入标题"); return; }

    const list = getAbRecords();
    list.unshift({ id: Date.now(), title, platform, views, eng, engRate: views > 0 ? (eng / views * 100).toFixed(1) : "0.0", date: new Date().toISOString() });
    saveAbRecords(list);
    $("abTitle").value = "";
    $("abViews").value = "";
    $("abEng").value = "";
    toast("已记录");
    renderAbList();
  }

  function renderAbList() {
    const list = getAbRecords();
    const wrap = $("abList");
    if (!wrap) return;
    if (list.length === 0) {
      wrap.innerHTML = '<div class="empty-state text-xs muted">暂无记录，添加标题和数据开始对比</div>';
      return;
    }
    const sorted = [...list].sort((a, b) => parseFloat(b.engRate) - parseFloat(a.engRate));
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>排名</th><th>标题</th><th>平台</th><th>阅读</th><th>互动</th><th>互动率</th><th></th></tr></thead>
        <tbody>
          ${sorted.map((r, i) => `
            <tr>
              <td>${i === 0 ? '<span class="tag ok">冠军</span>' : i + 1}</td>
              <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.title)}</td>
              <td><span class="tag" style="color:var(--${r.platform}); border-color:var(--${r.platform});">${{ xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条" }[r.platform]}</span></td>
              <td>${r.views}</td>
              <td>${r.eng}</td>
              <td style="color:${parseFloat(r.engRate) >= 5 ? "var(--ok)" : parseFloat(r.engRate) >= 2 ? "var(--warn)" : "var(--muted)"};">${r.engRate}%</td>
              <td><button class="btn btn-ghost btn-sm text-danger" data-abdel="${r.id}">删除</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-abdel]").forEach(btn => {
      btn.addEventListener("click", () => {
        const list = getAbRecords().filter(r => r.id !== parseInt(btn.dataset.abdel));
        saveAbRecords(list);
        renderAbList();
      });
    });
  }

  async function aiSingleAction(type, instruction) {
    const body = readOriginal();
    const target = type === "title" ? body.title : body.body;
    if (!target) { toast("请先填写原稿"); return; }

    showAiOutput("AI 处理中...");
    try {
      const text = await AiGateway.generate(`${instruction}\n\n原文：\n${target}`, {
        system: "你是专业的内容编辑，输出简洁直接。",
        maxTokens: 1500,
      });
      hideAiOutput();
      // 提供应用按钮
      showAiOutput(text, true, () => {
        if (type === "title") {
          $("cTitle").value = text.split("\n")[0].replace(/^\d+[.、]\s*/, "");
        } else {
          $("cBody").value = text;
          updateBodyCount();
        }
        hideAiOutput();
      });
    } catch (e) {
      hideAiOutput();
      toast("操作失败: " + e.message);
    }
  }

  async function aiScore() {
    const body = readOriginal();
    if (!body.body) { toast("请先填写正文"); return; }

    showAiOutput("AI 评分中...");
    try {
      const prompt = `请对以下内容进行评分和风险检测。\n\n标题：${body.title}\n正文：${body.body}\n\n请按以下 JSON 格式输出评分（0-100）：\n${JSON.stringify({ total: 0, completeness: 0, adaptability: 0, viral_potential: 0, compliance: 0, risk_level: "低/中/高", risk_warnings: [] })}\n\n只输出 JSON。`;
      const text = await AiGateway.generate(prompt, {
        system: "你是严格的内容审核专家，按平台规则评估内容质量。",
        useReasoner: true,
        maxTokens: 1000,
      });
      const parsed = tryParseJson(text);
      if (parsed) {
        // 先保存当前输入，避免 renderEditor 清空
        Object.assign(currentContent, readOriginal(), { adaptations: readAdaptations() });
        currentContent.ai_score = parsed;
        renderEditor(); // 重新渲染显示评分卡
        toast(`评分完成：${parsed.total} 分`);
      } else {
        hideAiOutput();
        toast("评分格式异常，请重试");
      }
    } catch (e) {
      hideAiOutput();
      toast("评分失败: " + e.message);
    }
  }

  // ========== AI 违规自检（第二批） ==========

  // 八大平台差异化检测重点
  const COMPLIANCE_RULES = {
    xhs: {
      name: "小红书",
      checks: ["标题是否含夸张/极限词（最/第一/绝对等）", "正文是否含导流信息（微信号/二维码描述）", "是否含医疗/金融等需资质话题", "图片描述是否涉及版权问题", "话题标签是否合规无违禁词"],
    },
    douyin: {
      name: "抖音",
      checks: ["口播文案是否含敏感政治词", "是否含低俗/擦边球内容描述", "话题热词是否含违禁词", "是否含未标注的广告/营销内容", "视频描述是否涉及版权风险"],
    },
    bilibili: {
      name: "B站",
      checks: ["标题/简介是否含引战内容", "是否含未经授权的转载声明", "弹幕关键词是否含违规词", "分区选择是否与内容匹配", "是否含过度营销内容"],
    },
    wechat: {
      name: "公众号",
      checks: ["标题是否含标题党/夸大宣传", "正文是否含未标注的广告", "是否涉及时政/金融等需资质内容", "是否含诱导分享/关注的话术", "原创声明是否合规"],
    },
    shipinhao: {
      name: "视频号",
      checks: ["标题是否含夸张/极限词", "口播文案是否含诱导关注/导流", "是否涉及时政/医疗等需资质内容", "是否含搬运/版权争议内容", "话题标签是否含违禁词"],
    },
    kuaishou: {
      name: "快手",
      checks: ["口播文案是否含低俗/擦边球内容", "是否含未标注的广告/营销内容", "标题是否含夸大/虚构承诺", "是否含涉黄/暴力等违规内容", "视频描述是否涉及版权风险"],
    },
    weibo: {
      name: "微博",
      checks: ["博文是否含敏感时政内容", "是否含人身攻击/引战言论", "#话题#是否含违禁词", "是否含造谣/不实信息", "是否含未标注的广告植入"],
    },
    toutiao: {
      name: "今日头条",
      checks: ["标题是否含标题党/夸大宣传", "正文信息是否真实可查证", "是否涉及时政/金融等需资质内容", "是否含搬运/洗稿内容", "是否含诱导点击/误导性描述"],
    },
  };

  async function aiComplianceCheck() {
    const body = readOriginal();
    if (!body.body) { toast("请先填写正文"); return; }

    showAiOutput("AI 违规自检中（敏感词 + 八大平台合规 + 限流风险）...");
    try {
      // 构建八大平台差异化检测指令
      const platformRules = Object.entries(COMPLIANCE_RULES)
        .map(([k, r]) => `${r.name}：${r.checks.join("；")}`).join("\n");

      const prompt = `你是一位严格的内容合规审核专家，精通小红书、抖音、B站、公众号、视频号、快手、微博、今日头条的平台规则。\n\n请对以下内容进行全面违规自检。\n\n标题：${body.title}\n正文：${body.body}\n\n八大平台检测重点：\n${platformRules}\n\n请按以下 JSON 格式输出自检报告：\n${JSON.stringify({
        overall_risk: "低/中/高",
        risk_score: 0,
        sensitive_words: [{ word: "敏感词", reason: "违规原因", severity: "高/中/低" }],
        platform_results: {
          xhs: { status: "通过/警告/违规", issues: ["问题1"] },
          douyin: { status: "通过/警告/违规", issues: ["问题1"] },
          bilibili: { status: "通过/警告/违规", issues: ["问题1"] },
          wechat: { status: "通过/警告/违规", issues: ["问题1"] },
          shipinhao: { status: "通过/警告/违规", issues: ["问题1"] },
          kuaishou: { status: "通过/警告/违规", issues: ["问题1"] },
          weibo: { status: "通过/警告/违规", issues: ["问题1"] },
          toutiao: { status: "通过/警告/违规", issues: ["问题1"] },
        },
        limit_risks: ["限流风险点1"],
        suggestions: ["修改建议1"],
        revised_body: "修改后的正文（如无重大问题可原样返回）",
      })}\n\n只输出 JSON，不要其他说明。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是严格的内容合规审核专家，精通国内各大内容平台的审核规则和限流机制。检测结果要客观、具体、可操作。",
        useReasoner: true,
        maxTokens: 2500,
      });
      const parsed = tryParseJson(text);
      if (parsed) {
        Object.assign(currentContent, readOriginal(), { adaptations: readAdaptations() });
        currentContent.compliance_report = parsed;
        renderEditor();
        toast(`自检完成：${parsed.overall_risk || "未知"}风险`);
      } else {
        hideAiOutput();
        toast("自检报告格式异常，请重试");
      }
    } catch (e) {
      hideAiOutput();
      toast("自检失败: " + e.message);
    }
  }

  function renderComplianceReport(report) {
    const riskColor = report.overall_risk === "高" ? "var(--danger)" : report.overall_risk === "中" ? "var(--warn)" : "var(--ok)";
    const platformIcons = { xhs: "📕", douyin: "🎵", bilibili: "📺", wechat: "💬", shipinhao: "▶️", kuaishou: "📱", weibo: "🧣", toutiao: "📰" };

    return `
      <div class="editor-section compliance-report">
        <div class="editor-section-title">
          <span>AI 违规自检报告</span>
          <span class="risk-badge" style="background:${riskColor};">${escapeHtml(report.overall_risk || "未知")}风险</span>
        </div>

        <!-- 总览 -->
        <div class="compliance-overview">
          <div class="compliance-score" style="border-color:${riskColor};">
            <span class="compliance-score-num" style="color:${riskColor};">${report.risk_score ?? 0}</span>
            <span class="compliance-score-label">风险评分</span>
          </div>
          <div class="compliance-summary">
            ${report.sensitive_words?.length ? `<span class="text-xs text-warm">⚠ 检出 ${report.sensitive_words.length} 个敏感词</span>` : `<span class="text-xs" style="color:var(--ok);">✓ 未检出明显敏感词</span>`}
            ${report.limit_risks?.length ? `<span class="text-xs text-warm">⚠ ${report.limit_risks.length} 个限流风险点</span>` : ""}
          </div>
        </div>

        <!-- 敏感词列表 -->
        ${report.sensitive_words?.length ? `
          <div class="compliance-block">
            <div class="compliance-block-title">敏感词检测</div>
            ${report.sensitive_words.map(w => `
              <div class="sensitive-word-item">
                <span class="sensitive-word">${escapeHtml(w.word || "")}</span>
                <span class="sensitive-severity severity-${(w.severity || "中").toLowerCase()}">${escapeHtml(w.severity || "中")}</span>
                <span class="sensitive-reason">${escapeHtml(w.reason || "")}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <!-- 八大平台合规检测 -->
        <div class="compliance-block">
          <div class="compliance-block-title">八大平台合规检测</div>
          <div class="platform-compliance-grid">
            ${Object.entries(COMPLIANCE_RULES).map(([k, r]) => {
              const result = report.platform_results?.[k] || {};
              const status = result.status || "未检测";
              const statusClass = status === "通过" ? "ok" : status === "警告" ? "warn" : status === "违规" ? "danger" : "muted";
              return `
                <div class="platform-compliance-card">
                  <div class="platform-compliance-header">
                    <span>${platformIcons[k]} ${r.name}</span>
                    <span class="platform-status status-${statusClass}">${escapeHtml(status)}</span>
                  </div>
                  ${result.issues?.length ? `
                    <div class="platform-issues">
                      ${result.issues.map(i => `<div class="platform-issue">• ${escapeHtml(i)}</div>`).join("")}
                    </div>
                  ` : `<div class="platform-issue muted">无问题</div>`}
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- 限流风险点 -->
        ${report.limit_risks?.length ? `
          <div class="compliance-block">
            <div class="compliance-block-title">限流风险点</div>
            ${report.limit_risks.map(r => `<div class="alert-item"><span class="alert-dot warn"></span><span>${escapeHtml(r)}</span></div>`).join("")}
          </div>
        ` : ""}

        <!-- 修改建议 -->
        ${report.suggestions?.length ? `
          <div class="compliance-block">
            <div class="compliance-block-title">修改建议</div>
            ${report.suggestions.map((s, i) => `<div class="suggestion-item"><span class="suggestion-num">${i + 1}</span><span>${escapeHtml(s)}</span></div>`).join("")}
          </div>
        ` : ""}

        <!-- 一键应用修改后正文 -->
        ${report.revised_body && report.revised_body.trim() !== (currentContent.body || "").trim() ? `
          <div class="compliance-block">
            <div class="compliance-block-title">AI 修改后正文（预览）</div>
            <div class="revised-preview">${escapeHtml(report.revised_body).slice(0, 500)}${report.revised_body.length > 500 ? "..." : ""}</div>
            <button class="btn btn-primary btn-sm mt-sm" id="btnApplyRevised">应用到正文</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  async function markQaPassed() {
    const snapshot = currentContent.qa_snapshot || {};
    const allPassed = Object.keys(PLATFORMS).every(p => {
      const checked = snapshot[p] || [];
      return checked.length === QA_ITEMS.length;
    });
    if (!allPassed) {
      toast("请先完成所有平台的自检", 3000);
      return;
    }
    currentContent.ai_checkpassed = true;
    currentContent.status = "qa_passed";
    // 同步 DOM select，避免 saveContent 读到旧状态
    const statusSelect = $("cStatus");
    if (statusSelect) statusSelect.value = "qa_passed";
    await saveContent(true);
    toast("质检通过，可进入排期");
  }

  async function createSchedule() {
    if (!currentContent.id) {
      toast("请先保存内容");
      return;
    }
    await saveContent(true);
    Calendar.openCreateModal(currentContent);
  }

  // ========== 数据读写 ==========

  function readOriginal() {
    return {
      title: $("cTitle")?.value?.trim() || currentContent.title || "",
      key_points: $("cKeyPoints")?.value?.trim() || "",
      outline: $("cOutline")?.value?.trim() || "",
      body: $("cBody")?.value?.trim() || currentContent.body || "",
      tags: ($("cTags")?.value || "").split(/[,，]/).map(s => s.trim()).filter(Boolean),
    };
  }

  function readAdaptations() {
    const adaptations = {};
    for (const [key, p] of Object.entries(PLATFORMS)) {
      const data = {};
      p.fields.forEach(f => {
        const el = $(`adapt_${f}`);
        if (el) data[f] = el.value.trim();
      });
      // 只保存有内容的字段
      if (Object.values(data).some(v => v)) {
        adaptations[key] = data;
      } else if (currentContent.adaptations?.[key]) {
        adaptations[key] = currentContent.adaptations[key];
      }
    }
    return adaptations;
  }

  async function saveContent(silent = false) {
    const orig = readOriginal();
    if (!orig.title) {
      if (!silent) toast("请填写标题");
      return;
    }

    const payload = {
      title: orig.title,
      key_points: orig.key_points,
      outline: orig.outline,
      body: orig.body,
      tags: orig.tags,
      adaptations: readAdaptations(),
      qa_snapshot: currentContent.qa_snapshot || {},
      ai_score: currentContent.ai_score,
      ai_checkpassed: currentContent.ai_checkpassed,
      compliance_report: currentContent.compliance_report || null,
      status: $("cStatus")?.value || currentContent.status || "draft",
      material_ids: currentContent.material_ids || [],
    };

    try {
      if (currentContent.id) {
        await Db.update("contents", currentContent.id, payload);
        currentContent = { ...currentContent, ...payload };
      } else {
        const created = await Db.create("contents", payload);
        currentContent = created;
      }
      if (!silent) toast("已保存");
    } catch (e) {
      toast("保存失败: " + e.message, 3000);
    }
  }

  function backToList() {
    currentContent = null;
    render();
  }

  function showAiOutput(text, withApply = false, applyFn = null) {
    const el = $("aiOutput");
    if (!el) return;
    if (withApply) {
      // 显示结果 + 应用按钮
      el.innerHTML = `
        <div class="ai-output" style="min-height:auto; background:var(--surface-soft); border-color:var(--line);">${escapeHtml(text)}</div>
        <div class="row gap-sm mt-sm">
          <button class="btn btn-primary btn-sm" id="btnApplyAi">应用到表单</button>
          <button class="btn btn-ghost btn-sm" id="btnDiscardAi">丢弃</button>
        </div>`;
      $("btnApplyAi").addEventListener("click", () => {
        applyFn?.();
      });
      $("btnDiscardAi").addEventListener("click", () => {
        el.innerHTML = "";
      });
    } else {
      // 处理中状态（带 spinner）
      el.innerHTML = `<div class="ai-thinking"><span class="spinner"></span> ${escapeHtml(text)}</div>`;
    }
  }

  function hideAiOutput() {
    const el = $("aiOutput");
    if (el && el.querySelector(".ai-thinking")) {
      el.innerHTML = "";
    }
  }

  function statusLabel(s) {
    if (s === "archived") return "已归档";
    return STATUS_FLOW.find(x => x.key === s)?.label || s;
  }

  return {
    render,
    open: openEditor,
  };
  })();
  return ContentEditor;
});
