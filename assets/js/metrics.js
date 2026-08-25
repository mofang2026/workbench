/**
 * 数据复盘中心 · 模块
 * 功能：单篇数据录入 + 爆款/踩坑标记 + 维度统计 + 优质/低效筛选 + AI 周月报告
 */

const Metrics = (function () {
  const PLATFORMS = { xhs: "小红书", douyin: "抖音", bilibili: "B站", wechat: "公众号", shipinhao: "视频号", kuaishou: "快手", weibo: "微博", toutiao: "今日头条" };
  let cache = [];
  let contentsMap = {};
  let activeView = "list"; // list | stats

  async function render() {
    const wrap = $("page-metrics");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">METRICS · 数据复盘中心</p>
        <h1>数据复盘中心</h1>
        <p class="sub">单篇数据录入 · 维度统计 · AI 报告生成</p>
      </div>

      <div class="tab-bar mb-md">
        <button class="tab ${activeView === "list" ? "active" : ""}" data-view="list">数据列表</button>
        <button class="tab ${activeView === "stats" ? "active" : ""}" data-view="stats">维度统计</button>
      </div>

      <div id="metricsContent"></div>
    `;

    wrap.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => {
        activeView = el.dataset.view;
        wrap.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === activeView));
        destroyCharts();
        if (activeView === "list") renderList();
        else renderStats();
      });
    });

    await loadData();
  }

  async function loadData() {
    const wrap = $("metricsContent");
    wrap.innerHTML = `<div class="empty-state"><div class="ai-thinking"><span class="spinner"></span> 加载中...</div></div>`;
    try {
      cache = await window.Db.list("metrics", {
        select: "id, content_id, platform, views, likes, favorites, comments, shares, followers_gained, is_viral, is_flop, review_notes, recorded_at",
        order: { col: "recorded_at", ascending: false },
        limit: 500,
      });
      // 批量加载内容标题
      const ids = [...new Set(cache.map(m => m.content_id).filter(Boolean))];
      if (ids.length > 0) {
        const contents = await window.Db.listByIds("contents", ids, { select: "id, title, tags, topic_id" });
        contents.forEach(c => { contentsMap[c.id] = c; });
      }
      if (activeView === "list") renderList();
      else renderStats();
    } catch (e) {
      wrap.innerHTML = `<div class="card empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  // ========== 数据列表 ==========

  function renderList() {
    const wrap = $("metricsContent");
    const hasData = cache.length > 0;

    wrap.innerHTML = `
      <div class="card mb-md">
        <div class="row gap-md" style="flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary btn-sm" id="btnNewMetric">+ 录入数据</button>
          <button class="btn btn-ghost btn-sm" id="btnImportCsv">导入数据</button>
          <button class="btn btn-ghost btn-sm" id="btnDownloadTpl">下载模板</button>
          <span class="text-xs muted">${cache.length} 条记录</span>
          <span class="text-xs muted">|</span>
          <span class="text-xs">爆款 <b class="text-warm">${cache.filter(m => m.is_viral).length}</b></span>
          <span class="text-xs">踩坑 <b class="text-danger">${cache.filter(m => m.is_flop).length}</b></span>
          <button class="btn btn-ghost btn-sm" id="btnExportCsv" style="margin-left:auto;">导出 CSV</button>
        </div>
      </div>

      ${hasData ? `
        <div class="card">
          <table class="data-table">
            <thead>
              <tr>
                <th>内容</th>
                <th>平台</th>
                <th>阅读</th>
                <th>点赞</th>
                <th>收藏</th>
                <th>评论</th>
                <th>转发</th>
                <th>涨粉</th>
                <th>互动率</th>
                <th>标记</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${cache.map(m => {
                const title = m.content_id ? (contentsMap[m.content_id]?.title || "未关联") : "未关联";
                const eng = m.views > 0 ? ((m.likes + m.comments + m.favorites) / m.views * 100).toFixed(1) + "%" : "—";
                return `
                <tr>
                  <td><div class="text-sm" title="${escapeAttr(title)}">${escapeHtml(title.slice(0, 20))}${title.length > 20 ? "..." : ""}</div></td>
                  <td><span class="tag" style="color:var(--${m.platform}); border-color:var(--${m.platform});">${PLATFORMS[m.platform] || m.platform}</span></td>
                  <td>${formatNum(m.views)}</td>
                  <td>${formatNum(m.likes)}</td>
                  <td>${formatNum(m.favorites)}</td>
                  <td>${formatNum(m.comments)}</td>
                  <td>${formatNum(m.shares)}</td>
                  <td>${formatNum(m.followers_gained)}</td>
                  <td>${eng}</td>
                  <td>
                    ${m.is_viral ? '<span class="tag warn">🔥爆款</span>' : ""}
                    ${m.is_flop ? '<span class="tag danger">踩坑</span>' : ""}
                  </td>
                  <td>
                    <button class="btn btn-ghost btn-sm" data-edit="${m.id}">编辑</button>
                    <button class="btn btn-ghost btn-sm" data-review="${m.id}">复盘</button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="card empty-state">
          <div class="em-icon">📊</div>
          <div>还没有数据，点击「录入数据」开始记录</div>
        </div>
      `}
    `;

    $("btnNewMetric")?.addEventListener("click", () => openEditor(null));
    $("btnExportCsv")?.addEventListener("click", exportCsv);
    $("btnImportCsv")?.addEventListener("click", openImport);
    $("btnDownloadTpl")?.addEventListener("click", downloadTemplate);
    wrap.querySelectorAll("[data-edit]").forEach(el => {
      el.addEventListener("click", () => openEditor(cache.find(m => m.id === el.dataset.edit)));
    });
    wrap.querySelectorAll("[data-review]").forEach(el => {
      el.addEventListener("click", () => openReview(cache.find(m => m.id === el.dataset.review)));
    });
  }

  // ========== 维度统计 ==========

  function renderStats() {
    const wrap = $("metricsContent");
    if (cache.length === 0) {
      wrap.innerHTML = `<div class="card empty-state"><div class="em-icon">📊</div><div>暂无数据可统计</div></div>`;
      return;
    }

    // 按平台统计
    const byPlatform = {};
    cache.forEach(m => {
      if (!byPlatform[m.platform]) byPlatform[m.platform] = { count: 0, views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, followers: 0, viral: 0 };
      const p = byPlatform[m.platform];
      p.count++;
      p.views += m.views || 0;
      p.likes += m.likes || 0;
      p.favorites += m.favorites || 0;
      p.comments += m.comments || 0;
      p.shares += m.shares || 0;
      p.followers += m.followers_gained || 0;
      if (m.is_viral) p.viral++;
    });

    // 按赛道统计（从 contentsMap.tags 提取）
    const byTrack = {};
    cache.forEach(m => {
      const tags = m.content_id ? (contentsMap[m.content_id]?.tags || []) : [];
      tags.forEach(tg => {
        if (!byTrack[tg]) byTrack[tg] = { count: 0, views: 0, viral: 0 };
        byTrack[tg].count++;
        byTrack[tg].views += m.views || 0;
        if (m.is_viral) byTrack[tg].viral++;
      });
    });

    // 优质内容 Top5（按互动率）
    const ranked = cache.map(m => ({
      ...m,
      title: m.content_id ? (contentsMap[m.content_id]?.title || "未关联") : "未关联",
      engRate: m.views > 0 ? (m.likes + m.comments + m.favorites) / m.views : 0,
    })).sort((a, b) => b.engRate - a.engRate);
    const top5 = ranked.slice(0, 5);
    const bottom5 = ranked.slice(-5).reverse();

    // 全局汇总指标
    const totalViews = cache.reduce((s, m) => s + (m.views || 0), 0);
    const totalLikes = cache.reduce((s, m) => s + (m.likes || 0), 0);
    const totalFav = cache.reduce((s, m) => s + (m.favorites || 0), 0);
    const totalComments = cache.reduce((s, m) => s + (m.comments || 0), 0);
    const totalFollowers = cache.reduce((s, m) => s + (m.followers_gained || 0), 0);
    const viralCount = cache.filter(m => m.is_viral).length;
    const avgEng = totalViews > 0 ? ((totalLikes + totalComments + totalFav) / totalViews * 100).toFixed(1) : "0.0";
    const viralRate = cache.length > 0 ? (viralCount / cache.length * 100).toFixed(1) : "0.0";

    wrap.innerHTML = `
      <!-- 可视化看板：关键指标卡片 -->
      <div class="metrics-dashboard mb-md">
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:var(--brand);">${formatNum(totalViews)}</div>
          <div class="metric-kpi-label">总阅读量</div>
        </div>
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:var(--ok);">${formatNum(totalLikes + totalFav + totalComments)}</div>
          <div class="metric-kpi-label">总互动数</div>
        </div>
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:var(--accent);">${avgEng}%</div>
          <div class="metric-kpi-label">平均互动率</div>
        </div>
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:var(--wechat);">${formatNum(totalFollowers)}</div>
          <div class="metric-kpi-label">总涨粉</div>
        </div>
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:var(--warn);">${viralCount}</div>
          <div class="metric-kpi-label">爆款数</div>
        </div>
        <div class="metric-kpi-card">
          <div class="metric-kpi-num" style="color:${viralRate >= 20 ? "var(--ok)" : "var(--muted)"};">${viralRate}%</div>
          <div class="metric-kpi-label">爆款率</div>
        </div>
      </div>

      <!-- 图表区：趋势 + 平台对比 -->
      <div class="grid grid-2 mb-md">
        <div class="card">
          <div class="card-title"><span>📈 发布数据趋势</span><span class="text-xs muted">按日期</span></div>
          <div class="chart-wrap"><canvas id="chartTrend"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title"><span>📊 分平台对比</span><span class="text-xs muted">阅读/互动/涨粉</span></div>
          <div class="chart-wrap"><canvas id="chartPlatform"></canvas></div>
        </div>
      </div>

      <!-- 图表区：互动率分布 + 标签阅读量 -->
      <div class="grid grid-2 mb-md">
        <div class="card">
          <div class="card-title"><span>🍩 互动类型分布</span><span class="text-xs muted">点赞/收藏/评论</span></div>
          <div class="chart-wrap"><canvas id="chartEngagement"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title"><span>🏷️ 标签阅读量 Top 7</span></div>
          <div class="chart-wrap"><canvas id="chartTags"></canvas></div>
        </div>
      </div>

      <!-- 按平台统计 -->
      <div class="card mb-md">
        <div class="card-title"><span>分平台数据汇总</span></div>
        <table class="data-table">
          <thead>
            <tr><th>平台</th><th>篇数</th><th>总阅读</th><th>总点赞</th><th>总收藏</th><th>总评论</th><th>总转发</th><th>涨粉</th><th>爆款数</th><th>平均互动率</th></tr>
          </thead>
          <tbody>
            ${Object.entries(byPlatform).map(([pf, d]) => {
              const avgEng = d.views > 0 ? ((d.likes + d.comments + d.favorites) / d.views * 100).toFixed(1) + "%" : "—";
              return `<tr>
                <td><span class="tag" style="color:var(--${pf}); border-color:var(--${pf});">${PLATFORMS[pf]}</span></td>
                <td>${d.count}</td>
                <td>${formatNum(d.views)}</td>
                <td>${formatNum(d.likes)}</td>
                <td>${formatNum(d.favorites)}</td>
                <td>${formatNum(d.comments)}</td>
                <td>${formatNum(d.shares)}</td>
                <td>${formatNum(d.followers)}</td>
                <td>${d.viral}</td>
                <td>${avgEng}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <!-- 按赛道/标签统计 -->
      <div class="grid grid-2 mb-md">
        <div class="card">
          <div class="card-title"><span>按标签统计</span></div>
          ${Object.entries(byTrack).sort((a, b) => b[1].views - a[1].views).slice(0, 10).map(([tag, d]) => `
            <div class="list-item">
              <div class="list-item-head">
                <div class="list-item-title">#${escapeHtml(tag)}</div>
                <span class="text-xs muted">${d.count} 篇 · ${d.viral} 爆款</span>
              </div>
              <div class="list-item-meta"><span>总阅读 ${formatNum(d.views)}</span></div>
            </div>
          `).join("") || '<div class="empty-state">暂无标签数据</div>'}
        </div>

        <!-- 优质内容 Top5 -->
        <div class="card">
          <div class="card-title"><span>🔥 优质内容 Top 5</span><span class="text-xs muted">按互动率</span></div>
          ${top5.map((m, i) => `
            <div class="list-item">
              <div class="list-item-head">
                <div class="list-item-title">${i + 1}. ${escapeHtml(m.title.slice(0, 25))}</div>
                <span class="tag" style="color:var(--${m.platform}); border-color:var(--${m.platform});">${PLATFORMS[m.platform]}</span>
              </div>
              <div class="list-item-meta">
                <span>阅读 ${formatNum(m.views)}</span>
                <span>互动率 ${(m.engRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- 低效内容 -->
      <div class="card mb-md">
        <div class="card-title"><span>⚠️ 低效内容 Bottom 5</span><span class="text-xs muted">需复盘改进</span></div>
        ${bottom5.map((m, i) => `
          <div class="list-item">
            <div class="list-item-head">
              <div class="list-item-title">${i + 1}. ${escapeHtml(m.title.slice(0, 25))}</div>
              <span class="tag" style="color:var(--${m.platform}); border-color:var(--${m.platform});">${PLATFORMS[m.platform]}</span>
            </div>
            <div class="list-item-meta">
              <span>阅读 ${formatNum(m.views)}</span>
              <span>互动率 ${(m.engRate * 100).toFixed(1)}%</span>
              ${m.is_flop ? '<span class="tag danger">踩坑</span>' : ""}
            </div>
          </div>
        `).join("")}
      </div>

      <!-- AI 报告 -->
      <div class="card">
        <div class="card-title">
          <span>AI 复盘报告</span>
          <button class="btn btn-primary btn-sm" id="btnGenReport">生成报告</button>
        </div>
        <div id="aiReport">
          <p class="text-xs muted">点击「生成报告」，AI 将根据你的数据生成周度/月度复盘报告</p>
        </div>
      </div>
    `;

    $("btnGenReport").addEventListener("click", generateReport);

    // 渲染图表（延迟确保 canvas 已挂载）
    setTimeout(() => {
      renderTrendChart(cache);
      renderPlatformChart(byPlatform);
      renderEngagementChart(totalLikes, totalFav, totalComments);
      renderTagsChart(byTrack);
    }, 50);
  }

  // ========== 图表渲染 ==========

  let chartInstances = {};

  function destroyCharts() {
    Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch (e) {} });
    chartInstances = {};
  }

  function renderTrendChart(data) {
    const ctx = document.getElementById("chartTrend");
    if (!ctx || !window.Chart) return;

    // 按日期聚合
    const byDate = {};
    data.forEach(m => {
      const d = formatDate(m.recorded_at).slice(0, 10);
      if (!byDate[d]) byDate[d] = { views: 0, eng: 0 };
      byDate[d].views += m.views || 0;
      byDate[d].eng += (m.likes || 0) + (m.comments || 0) + (m.favorites || 0);
    });
    const dates = Object.keys(byDate).sort();
    const views = dates.map(d => byDate[d].views);
    const eng = dates.map(d => byDate[d].eng);

    chartInstances.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: [
          { label: "阅读量", data: views, borderColor: "#59c4ff", backgroundColor: "rgba(89,196,255,0.12)", tension: 0.35, fill: true, yAxisID: "y" },
          { label: "互动数", data: eng, borderColor: "#ffb25a", backgroundColor: "rgba(255,178,90,0.12)", tension: 0.35, fill: true, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: "#9ab7d4", font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: "#6e89a3", font: { size: 10 } }, grid: { color: "rgba(149,193,226,0.1)" } },
          y: { type: "linear", position: "left", ticks: { color: "#59c4ff", font: { size: 10 } }, grid: { color: "rgba(149,193,226,0.1)" } },
          y1: { type: "linear", position: "right", ticks: { color: "#ffb25a", font: { size: 10 } }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function renderPlatformChart(byPlatform) {
    const ctx = document.getElementById("chartPlatform");
    if (!ctx || !window.Chart) return;

    const labels = Object.keys(byPlatform).map(k => PLATFORMS[k] || k);
    const platformColors = { xhs: "#ff2442", douyin: "#25f4ee", bilibili: "#fb7299", wechat: "#07c160", shipinhao: "#fa9d3b", kuaishou: "#ff6900", weibo: "#e6162d", toutiao: "#f04142" };
    const colors = Object.keys(byPlatform).map(k => platformColors[k] || "#59c4ff");

    chartInstances.platform = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "阅读量", data: Object.values(byPlatform).map(d => d.views), backgroundColor: colors.map(c => c + "cc"), borderRadius: 6 },
          { label: "互动数", data: Object.values(byPlatform).map(d => d.likes + d.comments + d.favorites), backgroundColor: colors.map(c => c + "66"), borderRadius: 6 },
          { label: "涨粉", data: Object.values(byPlatform).map(d => d.followers), backgroundColor: colors.map(c => c + "33"), borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#9ab7d4", font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: "#9ab7d4", font: { size: 11 } }, grid: { color: "rgba(149,193,226,0.1)" } },
          y: { ticks: { color: "#6e89a3", font: { size: 10 } }, grid: { color: "rgba(149,193,226,0.1)" } },
        },
      },
    });
  }

  function renderEngagementChart(likes, fav, comments) {
    const ctx = document.getElementById("chartEngagement");
    if (!ctx || !window.Chart) return;

    chartInstances.engagement = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["点赞", "收藏", "评论"],
        datasets: [{
          data: [likes, fav, comments],
          backgroundColor: ["#59c4ff", "#ffb25a", "#71d9ab"],
          borderColor: "#0a1326",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#9ab7d4", font: { size: 11 }, padding: 12 } },
        },
        cutout: "62%",
      },
    });
  }

  function renderTagsChart(byTrack) {
    const ctx = document.getElementById("chartTags");
    if (!ctx || !window.Chart) return;

    const sorted = Object.entries(byTrack).sort((a, b) => b[1].views - a[1].views).slice(0, 7);
    if (sorted.length === 0) return;

    chartInstances.tags = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map(([t]) => t),
        datasets: [{
          label: "阅读量",
          data: sorted.map(([, d]) => d.views),
          backgroundColor: "rgba(89,196,255,0.5)",
          borderColor: "#59c4ff",
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#6e89a3", font: { size: 10 } }, grid: { color: "rgba(149,193,226,0.1)" } },
          y: { ticks: { color: "#9ab7d4", font: { size: 11 } }, grid: { color: "rgba(149,193,226,0.1)" } },
        },
      },
    });
  }

  // ========== 数据录入/编辑 ==========

  async function openEditor(metric) {
    const isEdit = !!metric;
    const m = metric || {
      content_id: null,
      platform: "xhs",
      views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, followers_gained: 0,
      is_viral: false, is_flop: false, review_notes: "",
    };

    // 加载已发布内容列表供选择
    let contents = [];
    try {
      contents = await window.Db.list("contents", {
        select: "id, title, status",
        eq: { status: "published" },
        order: { col: "updated_at", ascending: false },
        limit: 100,
      });
    } catch { }

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑数据" : "录入数据"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">关联内容</label>
          <select id="mContent" class="select">
            <option value="">不关联</option>
            ${contents.map(c => `<option value="${c.id}" ${m.content_id === c.id ? "selected" : ""}>${escapeHtml(c.title || "无标题")}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">平台 *</label>
          <select id="mPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, n]) => `<option value="${k}" ${m.platform === k ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid grid-3">
        <div class="field">
          <label class="field-label">阅读/播放</label>
          <input id="mViews" class="input" type="number" value="${m.views || 0}" />
        </div>
        <div class="field">
          <label class="field-label">点赞</label>
          <input id="mLikes" class="input" type="number" value="${m.likes || 0}" />
        </div>
        <div class="field">
          <label class="field-label">收藏</label>
          <input id="mFavorites" class="input" type="number" value="${m.favorites || 0}" />
        </div>
        <div class="field">
          <label class="field-label">评论</label>
          <input id="mComments" class="input" type="number" value="${m.comments || 0}" />
        </div>
        <div class="field">
          <label class="field-label">转发</label>
          <input id="mShares" class="input" type="number" value="${m.shares || 0}" />
        </div>
        <div class="field">
          <label class="field-label">涨粉</label>
          <input id="mFollowers" class="input" type="number" value="${m.followers_gained || 0}" />
        </div>
      </div>
      <div class="row gap-md mt-sm">
        <label class="row gap-sm">
          <input type="checkbox" id="mViral" ${m.is_viral ? "checked" : ""} />
          <span class="text-sm">🔥 爆款标记</span>
        </label>
        <label class="row gap-sm">
          <input type="checkbox" id="mFlop" ${m.is_flop ? "checked" : ""} />
          <span class="text-sm">⚠️ 踩坑标记</span>
        </label>
      </div>
      <div class="field mt-sm">
        <label class="field-label">复盘笔记</label>
        <textarea id="mNotes" class="textarea" rows="3" placeholder="记录这篇内容的经验教训">${escapeHtml(m.review_notes || "")}</textarea>
      </div>
      <div class="modal-foot">
        ${isEdit ? `<button class="btn btn-ghost" id="btnDeleteM" style="margin-right:auto;">删除</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveM">保存</button>
      </div>
    `);

    $("btnSaveM").addEventListener("click", () => save(isEdit ? m.id : null));
    if (isEdit) {
      $("btnDeleteM").addEventListener("click", async () => {
        const ok = await confirm("确定删除该条数据？");
        if (!ok) return;
        await window.Db.remove("metrics", m.id);
        toast("已删除");
        closeModal();
        await loadData();
      });
    }
  }

  async function save(id) {
    const payload = {
      content_id: $("mContent").value || null,
      platform: $("mPlatform").value,
      views: parseInt($("mViews").value) || 0,
      likes: parseInt($("mLikes").value) || 0,
      favorites: parseInt($("mFavorites").value) || 0,
      comments: parseInt($("mComments").value) || 0,
      shares: parseInt($("mShares").value) || 0,
      followers_gained: parseInt($("mFollowers").value) || 0,
      is_viral: $("mViral").checked,
      is_flop: $("mFlop").checked,
      review_notes: $("mNotes").value.trim(),
      recorded_at: new Date().toISOString(),
    };
    try {
      if (id) {
        await window.Db.update("metrics", id, payload);
      } else {
        await window.Db.create("metrics", payload);
      }
      toast("已保存");
      closeModal();
      await loadData();
    } catch (e) {
      toast("保存失败: " + e.message);
    }
  }

  // ========== 复盘笔记 ==========

  function openReview(metric) {
    if (!metric) return;
    const title = metric.content_id ? (contentsMap[metric.content_id]?.title || "未关联") : "未关联";
    showModal(`
      <div class="modal-head">
        <h3>复盘笔记</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="mb-md">
        <div class="text-sm" style="font-weight:600;">${escapeHtml(title)}</div>
        <div class="list-item-meta">
          <span class="tag" style="color:var(--${metric.platform}); border-color:var(--${metric.platform});">${PLATFORMS[metric.platform]}</span>
          <span>阅读 ${formatNum(metric.views)}</span>
          <span>点赞 ${formatNum(metric.likes)}</span>
          <span>互动率 ${metric.views > 0 ? ((metric.likes + metric.comments + metric.favorites) / metric.views * 100).toFixed(1) + "%" : "—"}</span>
        </div>
      </div>
      <div class="field">
        <label class="field-label">复盘笔记</label>
        <textarea id="rvNotes" class="textarea" rows="6" placeholder="记录经验教训：什么做得好？什么需要改进？">${escapeHtml(metric.review_notes || "")}</textarea>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveReview">保存复盘</button>
      </div>
    `);
    $("btnSaveReview").addEventListener("click", async () => {
      try {
        await window.Db.update("metrics", metric.id, { review_notes: $("rvNotes").value.trim() });
        metric.review_notes = $("rvNotes").value.trim();
        toast("复盘已保存");
        closeModal();
      } catch (e) {
        toast("保存失败: " + e.message);
      }
    });
  }

  // ========== AI 报告生成 ==========

  async function generateReport() {
    const wrap = $("aiReport");
    wrap.innerHTML = `<div class="ai-thinking"><span class="spinner"></span> AI 正在分析数据生成报告...</div>`;
    try {
      // 构建数据摘要
      const byPlatform = {};
      cache.forEach(m => {
        if (!byPlatform[m.platform]) byPlatform[m.platform] = { count: 0, views: 0, likes: 0, viral: 0 };
        const p = byPlatform[m.platform];
        p.count++; p.views += m.views || 0; p.likes += m.likes || 0;
        if (m.is_viral) p.viral++;
      });

      const topContent = cache
        .map(m => ({ title: m.content_id ? (contentsMap[m.content_id]?.title || "") : "", platform: m.platform, views: m.views, engRate: m.views > 0 ? (m.likes + m.comments + m.favorites) / m.views : 0 }))
        .filter(m => m.title)
        .sort((a, b) => b.engRate - a.engRate)
        .slice(0, 3);

      const prompt = `请根据以下自媒体运营数据，生成一份简洁的复盘报告，包含：1. 整体表现总结 2. 分平台表现分析 3. 优质内容共性 4. 改进建议 5. 下一步方向。\n\n数据摘要：\n总记录数：${cache.length}\n分平台数据：${JSON.stringify(byPlatform)}\nTop3 优质内容：${JSON.stringify(topContent)}\n\n请用中文输出，格式清晰，500字以内。`;

      const text = await window.AiGateway.generate(prompt, {
        system: "你是自媒体运营数据分析专家，擅长从数据中发现规律并给出可执行建议。",
        maxTokens: 2000,
      });

      wrap.innerHTML = `<div class="ai-output" style="white-space:pre-wrap; line-height:1.8;">${escapeHtml(text)}</div>
        <div class="row gap-sm mt-sm">
          <button class="btn btn-ghost btn-sm" id="btnCopyReport">复制报告</button>
          <button class="btn btn-ghost btn-sm" id="btnRegenReport">重新生成</button>
        </div>`;
      $("btnCopyReport").addEventListener("click", () => {
        navigator.clipboard.writeText(text).then(() => toast("已复制"));
      });
      $("btnRegenReport").addEventListener("click", generateReport);
    } catch (e) {
      wrap.innerHTML = `<div class="text-danger text-sm">报告生成失败: ${e.message}</div>`;
    }
  }

  // ========== CSV 导出 ==========

  function exportCsv() {
    const headers = ["内容", "平台", "阅读", "点赞", "收藏", "评论", "转发", "涨粉", "互动率", "爆款", "踩坑", "复盘笔记", "记录时间"];
    const rows = cache.map(m => {
      const title = m.content_id ? (contentsMap[m.content_id]?.title || "") : "";
      const eng = m.views > 0 ? ((m.likes + m.comments + m.favorites) / m.views * 100).toFixed(1) + "%" : "";
      return [title, PLATFORMS[m.platform] || m.platform, m.views, m.likes, m.favorites, m.comments, m.shares, m.followers_gained, eng, m.is_viral ? "是" : "", m.is_flop ? "是" : "", (m.review_notes || "").replace(/[\n\r]/g, " "), formatDate(m.recorded_at)];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `数据复盘_${formatDate(new Date().toISOString())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出");
  }

  // ========== CSV 导入 / 模板 ==========

  const IMPORT_HEADERS = ["内容标题", "平台", "阅读", "点赞", "收藏", "评论", "转发", "涨粉", "爆款", "踩坑", "复盘笔记", "记录时间"];

  // 下载导入模板（与导出格式一致，方便导出后编辑再导入）
  function downloadTemplate() {
    const sample = ["一篇示例内容标题", "小红书", "120", "35", "12", "8", "3", "15", "是", "", "示例：标题清晰，首图吸睛", "2026-08-01"];
    const csv = [IMPORT_HEADERS, sample].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "数据导入模板.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("模板已下载");
  }

  // 打开导入对话框
  async function openImport() {
    // 预加载已发布内容，用于按标题匹配 content_id
    let published = [];
    try {
      published = await window.Db.list("contents", {
        select: "id, title",
        eq: { status: "published" },
        order: { col: "updated_at", ascending: false },
        limit: 500,
      });
    } catch (e) { }

    const titleToId = {};
    published.forEach(c => { if (c.title) titleToId[c.title.trim()] = c.id; });

    showModal(`
      <div class="modal-head">
        <h3>导入数据</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted" style="margin:0 0 12px; line-height:1.6;">
        支持从「导出 CSV」导出的文件，或下载模板后填写。标题会尝试自动匹配已发布内容。<br/>
        平台支持：小红书 / 抖音 / B站 / 公众号；爆款/踩坑填「是」或留空。
      </p>
      <div class="field">
        <label class="field-label">选择 CSV 文件</label>
        <input type="file" id="impFile" class="input" accept=".csv,.txt" />
      </div>
      <div id="impResult" class="mt-sm"></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnDoImport" disabled>确认导入</button>
      </div>
    `);

    // 保存解析状态供确认导入使用
    let parsedRecords = [];
    let parseWarnings = [];

    $("impFile").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      const box = $("impResult");
      if (!file) { box.innerHTML = ""; return; }

      const text = await file.text().catch(() => "");
      const parsed = parseImportCsv(text);
      parseWarnings = parsed.warnings;
      parsedRecords = parsed.rows.map(r => ({ ...r, content_id: r.title && titleToId[r.title.trim()] ? titleToId[r.title.trim()] : null }));

      const ok = parsedRecords.filter(r => !r._skip);
      const btn = $("btnDoImport");
      if (ok.length === 0) {
        box.innerHTML = `<div class="text-danger text-sm">未解析到有效数据行${parseWarnings.length ? `（${parseWarnings.length} 处标记）` : ""}</div>`;
        btn.disabled = true;
        return;
      }
      btn.disabled = false;
      box.innerHTML = `
        <div class="text-sm" style="margin-bottom:8px;">
          已解析 <b>${ok.length}</b> 条有效记录
          ${parseWarnings.length ? `，<span class="text-warn">${parseWarnings.length} 处跳过</span>` : ""}
        </div>
        <div class="card" style="max-height:220px; overflow:auto; padding:8px 12px;">
          <table class="data-table">
            <thead><tr><th>标题</th><th>平台</th><th>阅读</th><th>互动</th><th>匹配内容</th></tr></thead>
            <tbody>
              ${ok.slice(0, 30).map(r => `
                <tr>
                  <td>${escapeHtml((r.title || "").slice(0, 15))}</td>
                  <td>${PLATFORMS[r.platform] || r.platform}</td>
                  <td>${r.views}</td>
                  <td>${(r.likes || 0) + (r.favorites || 0) + (r.comments || 0)}</td>
                  <td>${r.content_id ? '<span class="tag ok">已匹配</span>' : '<span class="text-xs muted">未匹配</span>'}</td>
                </tr>`).join("")}
              ${ok.length > 30 ? `<tr><td colspan="5" class="text-xs muted">...等 ${ok.length} 条</td></tr>` : ""}
            </tbody>
          </table>
        </div>
      `;
    });

    $("btnDoImport").addEventListener("click", async () => {
      const list = parsedRecords.filter(r => !r._skip);
      if (list.length === 0) return;
      const confirmed = await confirm(`确认导入 ${list.length} 条数据？导入后将立即生效。`);
      if (!confirmed) return;
      const btn = $("btnDoImport");
      btn.disabled = true;
      btn.textContent = "导入中...";
      try {
        // 需要显式写入 recorded_at；空标题行跳过
        await window.Db.createMany("metrics", list.map(r => ({
          content_id: r.content_id || null,
          platform: r.platform,
          views: r.views || 0,
          likes: r.likes || 0,
          favorites: r.favorites || 0,
          comments: r.comments || 0,
          shares: r.shares || 0,
          followers_gained: r.followers_gained || 0,
          is_viral: !!r.is_viral,
          is_flop: !!r.is_flop,
          review_notes: r.review_notes || "",
          recorded_at: r.recorded_at || new Date().toISOString(),
        })));
        toast(`成功导入 ${list.length} 条数据`);
        closeModal();
        await loadData();
      } catch (err) {
        toast("导入失败: " + err.message);
        btn.disabled = false;
        btn.textContent = "确认导入";
      }
    });
  }

  // 简易 CSV 解析（支持引号、逗号、BOM、utf8 中文、分号分隔兜底）
  function parseImportCsv(text) {
    const warnings = [];
    const rows = [];

    let content = (text || "").replace(/^\uFEFF/, "").trim();
    if (!content) { return { rows, warnings }; }

    // 分隔符猜测：优先逗号，含分号无数逗号时用分号
    let delimiter = ",";
    const firstLine = content.split(/\r?\n/, 1)[0] || "";
    if (!firstLine.includes(",") && firstLine.includes(";")) delimiter = ";";

    const rawLines = content.split(/\r?\n/);
    const records = [];
    for (let li = 0; li < rawLines.length; li++) {
      const line = rawLines[li];
      const row = [];
      let field = "";
      let inQuote = false;
      const chars = line.split("");
      let i = 0;
      while (i < chars.length) {
        const ch = chars[i];
        if (inQuote) {
          if (ch === '"') {
            if (chars[i + 1] === '"') { field += '"'; i += 2; continue; }
            inQuote = false; i++; continue;
          }
          field += ch; i++; continue;
        }
        if (ch === '"') { inQuote = true; i++; continue; }       // 字段以引号开头
        else if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
        field += ch; i++;
      }
      row.push(field); // 行尾提交最后一个字段
      if (!inQuote) {
        if (row.some(c => (c || "").trim() !== "")) records.push(row);
      } else {
        // 跨行引号字段：合并到上一行记录
        if (records.length === 0) records.push([]);
        const last = records[records.length - 1];
        if (last.length === 0) last.push(field);
        else last[last.length - 1] += "\n" + field;
      }
    }
    if (records.length === 0) return { rows, warnings };

    // 表头解析（规范化匹配列）
    const headerMap = {};
    records[0].forEach((h, idx) => {
      const key = (h || "").trim().toLowerCase().replace(/[\s_-\uFF1A:：]/g, "");
      if (key.includes("标题")) headerMap.title = idx;
      else if (key.includes("平台")) headerMap.platform = idx;
      else if (key.includes("阅读")) headerMap.views = idx;
      else if (key.includes("点赞")) headerMap.likes = idx;
      else if (key.includes("收藏")) headerMap.favorites = idx;
      else if (key.includes("评论")) headerMap.comments = idx;
      else if (key.includes("转发")) headerMap.shares = idx;
      else if (key.includes("涨粉")) headerMap.followers = idx;
      else if (key.includes("爆款")) headerMap.viral = idx;
      else if (key.includes("踩坑")) headerMap.flop = idx;
      else if (key.includes("复盘") || key.includes("笔记")) headerMap.notes = idx;
      else if (key.includes("记录") && key.includes("时间")) headerMap.date = idx;
      // 兼容英文表头
      else if (key === "title" || key === "内容") headerMap.title = idx;
      else if (key === "platform") headerMap.platform = idx;
      else if (key === "views") headerMap.views = idx;
      else if (key === "likes") headerMap.likes = idx;
      else if (key === "favorites") headerMap.favorites = idx;
      else if (key === "comments") headerMap.comments = idx;
      else if (key === "shares") headerMap.shares = idx;
      else if (key === "followers" || key === "followersgained" || key === "涨粉数") headerMap.followers = idx;
      else if (key === "viral" || key === "isviral" || key === "爆款") headerMap.viral = idx;
      else if (key === "flop" || key === "isflop") headerMap.flop = idx;
      else if (key === "notes" || key === "reviewnotes") headerMap.notes = idx;
      else if (key === "date" || key === "recordedat" || key === "记录时间") headerMap.date = idx;
    });

    const cell = (row, key) => (key !== undefined && row[key] !== undefined) ? String(row[key]).trim() : "";

    for (let r = 1; r < records.length; r++) {
      const row = records[r];
      const rec = {
        title: cell(row, headerMap.title),
        platform: mapPlatform(cell(row, headerMap.platform)),
        views: parseNum(cell(row, headerMap.views)),
        likes: parseNum(cell(row, headerMap.likes)),
        favorites: parseNum(cell(row, headerMap.favorites)),
        comments: parseNum(cell(row, headerMap.comments)),
        shares: parseNum(cell(row, headerMap.shares)),
        followers_gained: parseNum(cell(row, headerMap.followers)),
        is_viral: parseBool(cell(row, headerMap.viral)),
        is_flop: parseBool(cell(row, headerMap.flop)),
        review_notes: cell(row, headerMap.notes),
        recorded_at: parseDate(cell(row, headerMap.date)),
        _skip: false,
      };
      // 跳过完全空行
      if (!rec.title && !rec.views && !rec.likes) { rec._skip = true; continue; }
      // 平台校验（缺失时跳过并标记）
      if (!rec.platform) { rec._skip = true; warnings.push(`第 ${r + 1} 行：平台无效或缺失`); continue; }
      rows.push(rec);
    }

    return { rows, warnings };
  }

  // 平台别名 → 标准 key
  function mapPlatform(p) {
    const s = (p || "").trim().toLowerCase();
    const map = {
      xhs: "xhs", 小红书: "xhs", rednote: "xhs",
      douyin: "douyin", 抖音: "douyin", tiktok: "douyin",
      bilibili: "bilibili", b站: "bilibili", bzhan: "bilibili", 哔哩哔哩: "bilibili",
      wechat: "wechat", 公众号: "wechat", 微信: "wechat", weixin: "wechat",
    };
    return map[s] || null;
  }

  // 数字解析（去逗号、非数字）
  function parseNum(v) {
    const n = parseInt(String(v || "").replace(/[^\d-]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }

  // 布尔解析：是/否、true/false、1/0
  function parseBool(v) {
    const s = String(v || "").trim().toLowerCase();
    return s === "是" || s === "y" || s === "true" || s === "1" || s === "有";
  }

  // 日期解析：YYYY-MM-DD 或 YYYY-MM-DD HH:mm，空则返回 null（用当前时间）
  function parseDate(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  return { render };
})();

window.Metrics = Metrics;
