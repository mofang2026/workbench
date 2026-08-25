/**
 * 热点话题雷达 · 独立模块
 * - AI 热点趋势分析：输入赛道 + 平台，AI 生成结构化热点话题列表（含热度/趋势/选题角度）
 * - 全平台热点直通车：微博/知乎/抖音/百度/小红书/B站/头条 一键直达官方热榜
 * - 热点收藏与转化：一键收录到选题灵感库，或跳转内容创作
 *
 * 说明：AI 分析基于模型知识库（覆盖至训练截止时间的热点趋势），
 * 实时热点请通过「平台直通车」查看官方热榜。
 */

const HotRadar = (function () {
  // 全平台热点直通车入口
  const HOTPORTALS = [
    { id: "weibo", name: "微博热搜", url: "https://s.weibo.com/top/summary", color: "#e6162d", icon: "🔥", desc: "实时热搜榜" },
    { id: "zhihu", name: "知乎热榜", url: "https://www.zhihu.com/hot", color: "#0084ff", icon: "💡", desc: "热门话题" },
    { id: "douyin", name: "抖音热点", url: "https://www.douyin.com/hot", color: "#161823", icon: "🎵", desc: "抖音热榜" },
    { id: "baidu", name: "百度热搜", url: "https://top.baidu.com/board?tab=realtime", color: "#2932e1", icon: "📊", desc: "实时热点" },
    { id: "xhs", name: "小红书热点", url: "https://www.xiaohongshu.com/explore", color: "#ff2442", icon: "📕", desc: "探索发现" },
    { id: "bili", name: "B站热门", url: "https://www.bilibili.com/v/popular/all", color: "#fb7299", icon: "📺", desc: "热门视频" },
    { id: "toutiao", name: "头条热点", url: "https://www.toutiao.com/hot-event/", color: "#f04142", icon: "📰", desc: "今日头条" },
    { id: "kuaishou", name: "快手热榜", url: "https://www.kuaishou.com/", color: "#ff5000", icon: "⚡", desc: "快手热门" },
  ];

  // 常见赛道预设（便于快速选择）
  const TRACK_PRESETS = [
    "职场成长", "情感心理", "理财搞钱", "母婴育儿", "美妆护肤",
    "美食探店", "健身减脂", "旅行出游", "数码科技", "读书学习",
    "家居生活", "宠物萌宠", "穿搭时尚", "影视娱乐", "知识科普",
  ];

  const PLATFORM_OPTS = [
    { key: "all", label: "全域" },
    { key: "xhs", label: "小红书" },
    { key: "douyin", label: "抖音" },
    { key: "bilibili", label: "B站" },
    { key: "wechat", label: "公众号" },
    { key: "shipinhao", label: "视频号" },
    { key: "kuaishou", label: "快手" },
    { key: "weibo", label: "微博" },
    { key: "toutiao", label: "今日头条" },
  ];

  let lastResults = []; // 最近一次 AI 分析结果（内存缓存，供收藏使用）

  async function render() {
    const wrap = $("page-hot-radar");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">RADAR · 热点话题雷达</p>
        <h1>热点话题雷达</h1>
        <p class="sub">AI 热点趋势分析 · 全平台热榜直通车 · 一键转选题</p>
      </div>

      <!-- AI 热点分析 -->
      <div class="card mb-md">
        <div class="card-title">
          <span>AI 热点趋势分析</span>
          <span class="ai-badge">AI 辅助</span>
        </div>
        <div class="field">
          <label class="field-label">赛道 / 行业 *</label>
          <div class="hr-track-presets" id="hrTrackPresets"></div>
          <input id="hrTrack" class="input" placeholder="如：职场成长 / 理财搞钱 / 自定义赛道" style="margin-top:8px;" />
        </div>
        <div class="grid grid-2">
          <div class="field">
            <label class="field-label">目标平台</label>
            <select id="hrPlatform" class="select">
              ${PLATFORM_OPTS.map(p => `<option value="${p.key}">${p.label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label class="field-label">补充关键词（可选，逗号分隔）</label>
            <input id="hrKeywords" class="input" placeholder="如：自律, 副业, 时间管理" />
          </div>
        </div>
        <div class="row gap-sm">
          <button class="btn btn-warm" id="btnHrAnalyze">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>
            开始雷达扫描
          </button>
          <span id="hrStatus" class="text-xs muted"></span>
        </div>
        <div id="hrResults" class="mt-md"></div>
      </div>

      <!-- 平台直通车 -->
      <div class="card">
        <div class="card-title">
          <span>全平台热点直通车</span>
          <span class="muted text-xs">点击直达官方热榜（新窗口）</span>
        </div>
        <div class="hr-portal-grid" id="hrPortals"></div>
      </div>
    `;

    // 渲染赛道预设
    $("hrTrackPresets").innerHTML = TRACK_PRESETS.map(t =>
      `<button class="hr-track-chip" data-track="${t}">${t}</button>`
    ).join("");
    $("hrTrackPresets").querySelectorAll(".hr-track-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        $("hrTrack").value = btn.dataset.track;
      });
    });

    // 渲染平台直通车
    $("hrPortals").innerHTML = HOTPORTALS.map(p => `
      <a class="hr-portal-card" href="${p.url}" target="_blank" rel="noopener" style="--portal-color:${p.color};">
        <div class="hr-portal-icon">${p.icon}</div>
        <div class="hr-portal-name">${p.name}</div>
        <div class="hr-portal-desc">${p.desc}</div>
      </a>
    `).join("");

    $("btnHrAnalyze").addEventListener("click", doAnalyze);
  }

  async function doAnalyze() {
    const track = $("hrTrack").value.trim();
    const platform = $("hrPlatform").value;
    const keywords = $("hrKeywords").value.trim();

    if (!track) { toast("请填写或选择赛道"); return; }

    const platformLabel = PLATFORM_OPTS.find(p => p.key === platform)?.label || "全域";
    const status = $("hrStatus");
    const results = $("hrResults");
    const btn = $("btnHrAnalyze");

    btn.disabled = true;
    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 正在扫描热点趋势...</span>';
    results.innerHTML = "";

    try {
      const prompt = `你是资深自媒体热点分析师。请基于你的知识库，针对以下赛道生成当前最具热度的爆款话题选题。

赛道：${track}
目标平台：${platformLabel}
补充关键词：${keywords || "无"}

要求：
1. 生成 8 个差异化热点话题，覆盖不同内容角度（教程/盘点/故事/观点/对比等）
2. 每个话题必须贴近${platformLabel}平台调性和用户偏好
3. 热度评分（1-100）反映该话题在该赛道的传播潜力
4. 趋势：up（上升）/ flat（平稳）/ down（衰减）
5. 选题角度要具体可执行，不是泛泛而谈

严格按以下 JSON 格式输出（只输出 JSON，不要额外文字）：
${JSON.stringify({
        track: track,
        platform: platformLabel,
        summary: "本赛道近期热点趋势一句话总结",
        topics: [
          {
            title: "话题标题（10-20字，有吸引力）",
            angle: "选题角度/切入点（具体说明从哪个角度做内容）",
            heat: 85,
            trend: "up",
            keywords: ["关键词1", "关键词2"],
            reason: "为什么这个话题会火（一句话）",
            content_type: "教程/盘点/故事/观点/对比 之一"
          }
        ],
      }, null, 2)}

只输出 JSON，topics 数组必须包含 8 个话题。`;

      const text = await window.AiGateway.generate(prompt, {
        system: "你是资深自媒体热点分析师和内容策划专家，擅长挖掘热点趋势并给出可执行的选题角度。",
        maxTokens: 2500,
      });
      const parsed = tryParseJson(text);

      if (!parsed || !parsed.topics || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
        status.innerHTML = '<span class="text-danger">分析失败，请重试</span>';
        return;
      }

      lastResults = parsed.topics;
      status.innerHTML = `<span class="text-ok">✓ 扫描完成，发现 ${parsed.topics.length} 个热点话题</span>`;
      renderResults(parsed, track, platform);
    } catch (e) {
      status.innerHTML = `<span class="text-danger">分析失败: ${escapeHtml(e.message)}</span>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderResults(parsed, track, platform) {
    const wrap = $("hrResults");
    const trendIcon = { up: "📈", flat: "➡️", down: "📉" };
    const trendLabel = { up: "上升", flat: "平稳", down: "衰减" };
    const trendClass = { up: "up", flat: "flat", down: "down" };

    wrap.innerHTML = `
      ${parsed.summary ? `
        <div class="hr-summary-box mb-md">
          <span class="text-xs muted">📌 趋势总结</span>
          <p class="hr-summary-text">${escapeHtml(parsed.summary)}</p>
        </div>
      ` : ""}

      <div class="hr-topics-head mb-sm">
        <span class="text-sm" style="font-weight:600;">热点话题（${parsed.topics.length}）</span>
        <button class="btn btn-ghost btn-sm" id="btnHrCollectAll">全部收录到选题库</button>
      </div>

      <div class="hr-topic-list">
        ${parsed.topics.map((t, i) => `
          <div class="hr-topic-card" data-idx="${i}">
            <div class="hr-topic-main">
              <div class="hr-topic-head">
                <span class="hr-topic-rank">#${i + 1}</span>
                <span class="hr-topic-title">${escapeHtml(t.title)}</span>
                <span class="hr-trend ${trendClass[t.trend] || "flat"}">${trendIcon[t.trend] || "➡️"} ${trendLabel[t.trend] || "平稳"}</span>
              </div>
              <div class="hr-topic-angle">
                <span class="text-xs muted">🎯 选题角度：</span>${escapeHtml(t.angle || "")}
              </div>
              ${t.reason ? `<div class="hr-topic-reason"><span class="text-xs muted">💡 爆火原因：</span>${escapeHtml(t.reason)}</div>` : ""}
              <div class="hr-topic-meta">
                ${t.content_type ? `<span class="tag">${escapeHtml(t.content_type)}</span>` : ""}
                ${(t.keywords || []).map(k => `<span class="tag tag-soft">${escapeHtml(k)}</span>`).join("")}
              </div>
            </div>
            <div class="hr-topic-side">
              <div class="hr-heat" title="热度评分">
                <div class="hr-heat-num">${t.heat || 0}</div>
                <div class="hr-heat-bar"><div class="hr-heat-fill" style="width:${Math.min(100, t.heat || 0)}%;"></div></div>
                <div class="text-xs muted">热度</div>
              </div>
              <div class="hr-topic-actions">
                <button class="btn btn-ghost btn-sm" data-collect="${i}">收录</button>
                <button class="btn btn-primary btn-sm" data-create="${i}">转创作</button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    // 收录单个
    wrap.querySelectorAll("[data-collect]").forEach(el => {
      el.addEventListener("click", () => collectTopic(parseInt(el.dataset.collect), track, platform));
    });
    // 转创作
    wrap.querySelectorAll("[data-create]").forEach(el => {
      el.addEventListener("click", () => createContentFromTopic(parseInt(el.dataset.create), track, platform));
    });
    // 全部收录
    $("btnHrCollectAll")?.addEventListener("click", () => collectAll(track, platform));
  }

  // 收录单个热点到选题灵感库
  async function collectTopic(idx, track, platform) {
    const t = lastResults[idx];
    if (!t) return;
    try {
      await window.Db.create("topics", {
        title: t.title,
        description: t.angle || t.reason || "",
        platform: platform,
        track: track,
        keywords: t.keywords || [],
        status: "idea",
        source: "热点雷达",
        is_hot: true,
      });
      toast(`「${t.title}」已收录到选题库`);
    } catch (e) {
      toast("收录失败: " + e.message, 3000);
    }
  }

  // 全部收录
  async function collectAll(track, platform) {
    if (lastResults.length === 0) return;
    const btn = $("btnHrCollectAll");
    btn.disabled = true;
    btn.textContent = "收录中...";
    let ok = 0;
    for (const t of lastResults) {
      try {
        await window.Db.create("topics", {
          title: t.title,
          description: t.angle || t.reason || "",
          platform: platform,
          track: track,
          keywords: t.keywords || [],
          status: "idea",
          source: "热点雷达",
          is_hot: true,
        });
        ok++;
      } catch (e) {
        // 单条失败继续
      }
    }
    btn.disabled = false;
    btn.textContent = "全部收录到选题库";
    toast(`已收录 ${ok}/${lastResults.length} 个话题到选题库`);
  }

  // 转内容创作：先收录到选题库，创建内容草稿，再跳转内容创作页
  async function createContentFromTopic(idx, track, platform) {
    const t = lastResults[idx];
    if (!t) return;
    try {
      // 1. 收录到选题库（状态设为创作中）
      const topic = await window.Db.create("topics", {
        title: t.title,
        description: t.angle || t.reason || "",
        platform: platform,
        track: track,
        keywords: t.keywords || [],
        status: "creating",
        source: "热点雷达",
        is_hot: true,
      });
      // 2. 创建内容草稿并关联选题
      const content = await window.Db.create("contents", {
        topic_id: topic.id,
        title: t.title,
        body: t.angle || t.reason || "",
        status: "draft",
        tags: t.keywords || [],
      });
      toast("已创建内容草稿，跳转创作中心");
      // 3. 跳转内容创作页并打开草稿编辑器
      await window.switchPage("content");
      window.ContentEditor.open(content.id);
    } catch (e) {
      toast("操作失败: " + e.message, 3000);
    }
  }

  return { render };
})();

window.HotRadar = HotRadar;
