/**
 * 全域自媒体工作台 · 主应用逻辑
 * - 登录/注册流程
 * - 页面导航
 * - 仪表盘统计渲染
 * - 快捷操作
 */

const $ = (id) => document.getElementById(id);

const PLATFORM_META = {
  xhs:      { name: "小红书",   color: "xhs",      url: "https://creator.xiaohongshu.com" },
  douyin:   { name: "抖音",     color: "douyin",   url: "https://creator.douyin.com" },
  bilibili: { name: "B站",      color: "bilibili", url: "https://member.bilibili.com" },
  wechat:   { name: "公众号",   color: "wechat",   url: "https://mp.weixin.qq.com" },
  shipinhao:{ name: "视频号",   color: "shipinhao",url: "https://channels.weixin.qq.com/platform/post/create" },
  kuaishou: { name: "快手",     color: "kuaishou", url: "https://cp.kuaishou.com/article/publish" },
  weibo:    { name: "微博",     color: "weibo",    url: "https://weibo.com/compose/newwrite" },
  toutiao:  { name: "今日头条", color: "toutiao",  url: "https://mp.toutiao.com/profile_v4/graphic/publish" },
};

// ========== Toast ==========
function toast(msg, duration = 2200) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add("hidden"), duration);
}

// ========== 登录流程 ==========
function initAuth() {
  const configured = window.WorkbenchConfig.isConfigured();
  if (configured) {
    $("authStepConfig").classList.add("hidden");
    $("authStepLogin").classList.remove("hidden");
  }

  $("btnSaveConfig").addEventListener("click", () => {
    const url = $("cfgSupabaseUrl").value.trim();
    const key = $("cfgSupabaseKey").value.trim();
    if (!url || !key) {
      showAuthError("请填写 Supabase URL 和 Anon Key");
      return;
    }
    if (!url.startsWith("https://") || !url.includes("supabase.co")) {
      showAuthError("URL 格式不对，应为 https://xxxxx.supabase.co");
      return;
    }
    window.WorkbenchConfig.saveConfig({ supabaseUrl: url, supabaseAnonKey: key });
    toast("配置已保存，请登录");
    // 刷新页面让 Supabase 客户端重新初始化
    location.reload();
  });

  $("btnLogin").addEventListener("click", handleLogin);

  $("btnLogout").addEventListener("click", async () => {
    const c = window.WorkbenchConfig.getSupabase();
    if (c) await c.auth.signOut();
    window.WorkbenchConfig.clearCurrentUser();
    $("authMask").classList.remove("hidden");
    $("userBadge").classList.add("hidden");
    $("btnLogout").classList.add("hidden");
  });
}

function showAuthError(msg) {
  const el = $("authError");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

async function handleLogin() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if (!email || !password) {
    showAuthError("请输入邮箱和密码");
    return;
  }
  if (password.length < 6) {
    showAuthError("密码至少 6 位");
    return;
  }

  const btn = $("btnLogin");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 登录中...';

  try {
    const c = window.WorkbenchConfig.getSupabase();
    if (!c) {
      showAuthError("Supabase 未初始化，请检查配置");
      return;
    }

    // 先尝试登录
    let { data, error } = await c.auth.signInWithPassword({ email, password });

    if (error && error.message.toLowerCase().includes("invalid login")) {
      // 登录失败 → 尝试注册新账号
      const reg = await c.auth.signUp({ email, password });
      if (reg.error) throw reg.error;

      if (reg.data.session) {
        // 注册成功且已自动登录（邮箱确认已关闭的情况）
        data = reg.data;
        toast("账号已创建，已自动登录");
      } else if (reg.data.user) {
        // 注册成功但需要邮箱确认
        showAuthError("账号已创建！请前往邮箱点击确认链接，然后再回来登录");
        return;
      }
    } else if (error) {
      throw error;
    }

    // 确保有有效 session 才进入应用
    if (data.user && data.session) {
      await enterApp(data.user);
    } else if (data.user) {
      // 有 user 但无 session，可能 session 过期
      showAuthError("登录会话异常，请重新输入邮箱密码登录");
    }
  } catch (e) {
    showAuthError(e.message || "登录失败");
  } finally {
    btn.disabled = false;
    btn.textContent = "登录 / 注册";
  }
}

async function enterApp(user) {
  $("authMask").classList.add("hidden");
  $("userBadge").textContent = user.email.split("@")[0];
  $("userBadge").classList.remove("hidden");
  $("btnLogout").classList.remove("hidden");

  // 问候语
  const hour = new Date().getHours();
  let greeting = "你好";
  if (hour < 6) greeting = "夜深了";
  else if (hour < 11) greeting = "早上好";
  else if (hour < 14) greeting = "中午好";
  else if (hour < 18) greeting = "下午好";
  else greeting = "晚上好";
  $("greeting").textContent = `${greeting}，${user.email.split("@")[0]}`;

  await renderDashboard();

  // 启动定时提醒（发布到期 / 逾期未发布），若已配置
  if (window.Reminders) window.Reminders.start();
}

// ========== 仪表盘渲染 ==========
async function renderDashboard() {
  try {
    const stats = await window.Db.getDashboardStats();
    renderPlatformCards(stats.accounts, stats.monthPublishedByPlatform);
    renderStats(stats);
    renderAlerts();
    await Promise.all([renderRecentViral(), renderRecentPending()]);
  } catch (e) {
    toast("数据加载失败: " + e.message, 4000);
    console.error(e);
  }
}

// 近期爆款（G2 修复）
async function renderRecentViral() {
  const wrap = $("recentViral");
  if (!wrap) return;
  try {
    const items = await window.Db.list("metrics", {
      select: "id, content_id, platform, views, likes, favorites, comments, is_viral, recorded_at",
      eq: { is_viral: true },
      order: { col: "recorded_at", ascending: false },
      limit: 5,
    });
    if (items.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="em-icon">🔥</div>
          <div>暂无爆款记录</div>
        </div>`;
      return;
    }
    // 批量加载内容标题
    const contentIds = [...new Set(items.map(m => m.content_id).filter(Boolean))];
    const contents = contentIds.length > 0
      ? await window.Db.listByIds("contents", contentIds, { select: "id, title" })
      : [];
    const titleMap = {};
    contents.forEach(c => { titleMap[c.id] = c.title; });

    wrap.innerHTML = items.map(m => `
      <div class="list-item">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(titleMap[m.content_id] || "未关联内容")}</div>
          <span class="tag" style="color:var(--${m.platform}); border-color:var(--${m.platform});">${PLATFORM_META[m.platform]?.name || m.platform}</span>
        </div>
        <div class="list-item-meta">
          <span>👁 ${formatNum(m.views)}</span>
          <span>❤ ${formatNum(m.likes)}</span>
          <span>⭐ ${formatNum(m.favorites)}</span>
          <span>💬 ${formatNum(m.comments)}</span>
          <span>· ${formatDate(m.recorded_at)}</span>
        </div>
      </div>
    `).join("");
  } catch (e) {
    wrap.innerHTML = `<div class="text-xs muted-2">爆款加载失败</div>`;
  }
}

// 近期待发布（G2 修复）
async function renderRecentPending() {
  const wrap = $("recentPending");
  if (!wrap) return;
  try {
    const now = new Date().toISOString();
    const items = await window.Db.list("schedules", {
      select: "id, content_id, platform, scheduled_at, actual_published_at",
      gte: { scheduled_at: now },
      order: { col: "scheduled_at", ascending: true },
      limit: 5,
    });
    if (items.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="em-icon">📅</div>
          <div>暂无待发布任务</div>
        </div>`;
      return;
    }
    // 批量加载内容标题
    const contentIds = [...new Set(items.map(s => s.content_id).filter(Boolean))];
    const contents = contentIds.length > 0
      ? await window.Db.listByIds("contents", contentIds, { select: "id, title" })
      : [];
    const titleMap = {};
    contents.forEach(c => { titleMap[c.id] = c.title; });

    wrap.innerHTML = items.map(s => `
      <div class="list-item">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(titleMap[s.content_id] || "未关联内容")}</div>
          <span class="tag" style="color:var(--${s.platform}); border-color:var(--${s.platform});">${PLATFORM_META[s.platform]?.name || s.platform}</span>
        </div>
        <div class="list-item-meta">
          <span>⏰ ${formatDateTime(s.scheduled_at)}</span>
          ${s.actual_published_at ? '<span class="tag ok">已发布</span>' : '<span class="tag warn">待发布</span>'}
        </div>
      </div>
    `).join("");
  } catch (e) {
    wrap.innerHTML = `<div class="text-xs muted-2">待发布加载失败</div>`;
  }
}

function renderStats(stats) {
  // 总粉丝数（从 accounts.config.fans 读取，若未填则 0）
  const totalFans = stats.accounts.reduce(
    (sum, a) => sum + (a.config?.fans || 0),
    0
  );
  $("statTotalFans").textContent = formatNum(totalFans);
  $("statMonthPublished").textContent = stats.monthPublished || 0;
  $("statAvgEngagement").textContent = stats.avgEngagement || "0%";
  $("statViralCount").textContent = stats.viralCount || 0;
  $("todayPending").textContent = stats.todayPending || 0;
  $("monthPublished").textContent = stats.monthPublished || 0;
}

function renderPlatformCards(accounts, monthPublishedByPlatform = {}) {
  const wrap = $("platformCards");
  wrap.innerHTML = "";

  const byPlatform = {};
  accounts.forEach((a) => {
    byPlatform[a.platform] = a;
  });

  Object.entries(PLATFORM_META).forEach(([key, meta]) => {
    const acc = byPlatform[key];
    const status = acc?.status || "inactive";
    const fans = acc?.config?.fans || 0;
    // N1 修复：从 schedules 表聚合的本月发布数，而非手动填的 config.monthPublished
    const monthPub = monthPublishedByPlatform[key] || 0;

    const card = document.createElement("div");
    card.className = `platform-card ${meta.color}`;
    card.innerHTML = `
      <div class="platform-head">
        <span class="platform-name">${meta.name}</span>
        <span class="platform-status ${status === "active" ? "" : status}">${
      status === "active" ? "在线" : status === "warning" ? "待检测" : "未绑定"
    }</span>
      </div>
      <div class="platform-stats">
        <div>
          <div>粉丝</div>
          <div class="v">${formatNum(fans)}</div>
        </div>
        <div>
          <div>本月</div>
          <div class="v">${monthPub} 篇</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      if (acc?.account_url) {
        window.open(acc.account_url, "_blank");
      } else {
        window.open(meta.url, "_blank");
      }
    });
    wrap.appendChild(card);
  });
}

async function renderAlerts() {
  const wrap = $("alertList");
  const alertCountEl = $("alertCount");
  try {
    const alerts = await window.Db.getAlerts();
    const items = [];

    alerts.draftStale.forEach((d) => {
      items.push({
        level: "warn",
        text: `草稿「${d.title || "无标题"}」超过 7 天未更新`,
      });
    });
    alerts.pendingOverdue.forEach((p) => {
      items.push({
        level: "danger",
        text: `${PLATFORM_META[p.platform]?.name || p.platform} 计划发布已超时`,
      });
    });
    if (alerts.needReview.length > 0) {
      items.push({
        level: "info",
        text: `${alerts.needReview.length} 篇已发布内容待复盘`,
      });
    }

    if (items.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="em-icon">·</div>
          <div>暂无预警</div>
        </div>`;
      alertCountEl.textContent = "0 条";
      return;
    }

    wrap.innerHTML = items
      .map(
        (it) => `
      <div class="alert-item">
        <span class="alert-dot ${it.level}"></span>
        <span>${it.text}</span>
      </div>`
      )
      .join("");
    alertCountEl.textContent = `${items.length} 条`;
  } catch (e) {
    wrap.innerHTML = `<div class="text-xs muted-2">预警加载失败</div>`;
  }
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n || 0);
}

// ========== 导航 ==========
function initNav() {
  document.querySelectorAll(".nav-link, [data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const page = el.dataset.page;
      if (!page) return;
      switchPage(page);
    });
  });
}

async function switchPage(pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  const target = $(`page-${pageName}`);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach((n) => {
    n.classList.toggle("active", n.dataset.page === pageName);
  });

  // 模块懒加载渲染
  try {
    if (pageName === "hot-radar" && window.HotRadar) {
      await window.HotRadar.render();
    } else if (pageName === "content" && window.ContentEditor) {
      await window.ContentEditor.render();
    } else if (pageName === "calendar" && window.Calendar) {
      await window.Calendar.render();
    } else if (pageName === "assets" && window.Assets) {
      await window.Assets.render();
    } else if (pageName === "metrics" && window.Metrics) {
      await window.Metrics.render();
    } else if (pageName === "templates" && window.Templates) {
      await window.Templates.render();
    } else if (pageName === "card-design" && window.CardDesign) {
      await window.CardDesign.render();
    } else if (pageName === "video-script" && window.VideoScript) {
      await window.VideoScript.render();
    } else if (pageName === "rules" && window.Rules) {
      await window.Rules.render();
    } else if (pageName === "settings" && window.Settings) {
      await window.Settings.render();
    } else if (pageName === "dashboard") {
      await renderDashboard();
    }
  } catch (e) {
    console.error(`渲染 ${pageName} 失败`, e);
  }
}

// ========== 快捷操作 ==========
// 暴露 switchPage 供其他模块调用（如选题转内容跳页）
window.switchPage = switchPage;

function initQuickActions() {
  document.querySelectorAll(".quick-action").forEach((el) => {
    el.addEventListener("click", async () => {
      const action = el.dataset.action;
      switch (action) {
        case "new-topic":
          await switchPage("content");
          $("btnNewTopic")?.click();
          break;
        case "new-content":
          await switchPage("content");
          $("btnNewContent")?.click();
          break;
        case "ai-rewrite":
          await switchPage("content");
          $("btnNewContent")?.click();
          toast("填写原稿后点击「一键跨平台改写」");
          break;
        case "ai-check":
          // G9 修复：跳转到内容创作页，让用户在编辑器内做真实质检
          await switchPage("content");
          toast("选择内容后点击「AI 内容打分」做风险检测");
          break;
      }
    });
  });
}

// ========== AI 连接测试 ==========
async function testAiConnection(testPrompt) {
  toast("正在调用 AI...", 1500);
  try {
    const text = await window.AiGateway.generate(testPrompt, {
      system: "你是专业的内容运营助手，简洁回复。",
      maxTokens: 200,
    });
    toast("AI 连接成功: " + text.slice(0, 30) + "...");
    console.log("[AI 测试]", text);
  } catch (e) {
    toast("AI 连接失败: " + e.message, 4000);
    console.error(e);
  }
}

// ========== 启动 ==========
async function boot() {
  initAuth();
  initNav();
  initQuickActions();

  // 若已配置且已登录，直接进入应用
  if (window.WorkbenchConfig.isConfigured()) {
    const user = await window.WorkbenchConfig.getCurrentUser();
    if (user) {
      await enterApp(user);
    }
  }
}

document.addEventListener("DOMContentLoaded", boot);
