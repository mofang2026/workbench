/**
 * 内容日历排期 · 模块
 * - 月视图日历展示
 * - 创建/编辑排期
 * - 一键跳转平台发布（半自动）
 * - 标记已发布
 */

WB.define("Calendar", ["Db"], (Db) => {
  const Calendar = (function () {
  const PLATFORMS = {
    xhs: { name: "小红书", url: "https://creator.xiaohongshu.com/publish/publish" },
    douyin: { name: "抖音", url: "https://creator.douyin.com/creator-micro/content/upload" },
    bilibili: { name: "B站", url: "https://member.bilibili.com/platform/upload/text/edit" },
    wechat: { name: "公众号", url: "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=add&type=10" },
    shipinhao: { name: "视频号", url: "https://channels.weixin.qq.com/platform/post/create" },
    kuaishou: { name: "快手", url: "https://cp.kuaishou.com/article/publish" },
    weibo: { name: "微博", url: "https://weibo.com/compose/newwrite" },
    toutiao: { name: "今日头条", url: "https://mp.toutiao.com/profile_v4/graphic/publish" },
  };

  const WEEK_HEADS = ["日", "一", "二", "三", "四", "五", "六"];

  // U12：各平台专属发布参数预设（默认值 + 字段定义）
  const PLATFORM_PUBLISH_PARAMS = {
    xhs: {
      fields: [
        { key: "tag_count", label: "话题标签数", type: "number", default: 5, hint: "建议 3-5 个" },
        { key: "cover_ratio", label: "封面比例", type: "select", default: "3:4", options: ["3:4", "1:1", "16:9"] },
        { key: "is_original", label: "原创声明", type: "checkbox", default: true },
        { key: "publish_position", label: "发布位置", type: "text", default: "", hint: "地理位置（可选）" },
      ],
    },
    douyin: {
      fields: [
        { key: "duration", label: "视频时长", type: "text", default: "60s", hint: "如 15s/60s/3min" },
        { key: "cover_frame", label: "封面帧", type: "text", default: "00:03", hint: "截取时间点" },
        { key: "hot_words_count", label: "话题热词数", type: "number", default: 3 },
        { key: "allow_download", label: "允许下载", type: "checkbox", default: false },
        { key: "ad_review", label: "广告审查", type: "checkbox", default: true },
      ],
    },
    bilibili: {
      fields: [
        { key: "partition", label: "分区", type: "select", default: "知识", options: ["知识", "科技", "生活", "美食", "动画", "游戏", "音乐"] },
        { key: "duration", label: "视频时长", type: "text", default: "5-10min" },
        { key: "danmaku_seeding", label: "弹幕预埋", type: "checkbox", default: true },
        { key: "is_original", label: "原创声明", type: "checkbox", default: true },
        { key: "charge", label: "充电开启", type: "checkbox", default: false },
      ],
    },
    wechat: {
      fields: [
        { key: "cover_template", label: "封面模板", type: "select", default: "大图", options: ["大图", "小图", "无封面"] },
        { key: "abstract", label: "摘要字数", type: "number", default: 54, hint: "建议 54 字内" },
        { key: "is_original", label: "原创声明", type: "checkbox", default: true },
        { key: "allow_repost", label: "允许转载", type: "checkbox", default: false },
        { key: "top_position", label: "首条位置", type: "checkbox", default: false, hint: "是否群发首条" },
      ],
    },
    shipinhao: {
      fields: [
        { key: "duration", label: "视频时长", type: "text", default: "60s", hint: "如 15s/60s/3min" },
        { key: "cover_ratio", label: "封面比例", type: "select", default: "16:9", options: ["16:9", "1:1", "4:3"] },
        { key: "visible", label: "可见范围", type: "select", default: "公开", options: ["公开", "仅粉丝", "仅自己"] },
        { key: "photo", label: "同步图片", type: "checkbox", default: false, hint: "是否同步发图片动态" },
      ],
    },
    kuaishou: {
      fields: [
        { key: "duration", label: "视频时长", type: "text", default: "60s", hint: "如 15s/60s/3min" },
        { key: "cover_frame", label: "封面帧", type: "text", default: "00:03", hint: "截取时间点" },
        { key: "is_original", label: "原创声明", type: "checkbox", default: true },
        { key: "allow_download", label: "允许下载", type: "checkbox", default: true },
        { key: "horizontal", label: "横屏视频", type: "checkbox", default: false },
      ],
    },
    weibo: {
      fields: [
        { key: "topic_count", label: "话题数", type: "number", default: 2, hint: "建议 1-3 个话题" },
        { key: "image_count", label: "配图数", type: "number", default: 1 },
        { key: "at_count", label: "@提及数", type: "number", default: 0 },
        { key: "comment_privacy", label: "评论限制", type: "select", default: "所有人", options: ["所有人", "仅粉丝", "仅自己"] },
      ],
    },
    toutiao: {
      fields: [
        { key: "category", label: "领域分类", type: "select", default: "科技", options: ["科技", "财经", "社会", "娱乐", "体育", "健康", "教育", "三农"] },
        { key: "abstract", label: "摘要字数", type: "number", default: 100, hint: "建议 60-120 字" },
        { key: "is_original", label: "原创声明", type: "checkbox", default: true },
        { key: "auto_publish", label: "定时发布", type: "checkbox", default: false },
      ],
    },
  };

  function defaultParamsFor(platform) {
    const conf = PLATFORM_PUBLISH_PARAMS[platform];
    if (!conf) return {};
    const out = {};
    conf.fields.forEach(f => { out[f.key] = f.default; });
    return out;
  }

  function renderParamsFields(platform, values) {
    const conf = PLATFORM_PUBLISH_PARAMS[platform];
    if (!conf) return "";
    const v = values || {};
    return conf.fields.map(f => {
      const val = v[f.key] !== undefined ? v[f.key] : f.default;
      if (f.type === "checkbox") {
        return `
          <label class="row gap-sm" style="padding:4px 0;">
            <input type="checkbox" id="pp_${f.key}" ${val ? "checked" : ""} />
            <span class="text-sm">${f.label}</span>
            ${f.hint ? `<span class="text-xs muted">（${f.hint}）</span>` : ""}
          </label>`;
      }
      if (f.type === "select") {
        return `
          <div class="field">
            <label class="field-label">${f.label}</label>
            <select id="pp_${f.key}" class="select">
              ${f.options.map(o => `<option value="${o}" ${val === o ? "selected" : ""}>${o}</option>`).join("")}
            </select>
          </div>`;
      }
      return `
        <div class="field">
          <label class="field-label">${f.label}</label>
          <input id="pp_${f.key}" class="input" type="${f.type === "number" ? "number" : "text"}" value="${escapeAttr(String(val))}" ${f.hint ? `placeholder="${f.hint}"` : ""} />
        </div>`;
    }).join("");
  }

  function readParamsFromForm(platform) {
    const conf = PLATFORM_PUBLISH_PARAMS[platform];
    if (!conf) return {};
    const out = {};
    conf.fields.forEach(f => {
      const el = $(`pp_${f.key}`);
      if (!el) return;
      if (f.type === "checkbox") out[f.key] = el.checked;
      else if (f.type === "number") out[f.key] = parseInt(el.value) || 0;
      else out[f.key] = el.value.trim();
    });
    return out;
  }

  let viewDate = new Date(); // 当前查看的月份
  let schedulesData = [];
  let contentsCache = {};
  let accountsCache = [];
  let calViewMode = "month"; // month | week

  // 加载当前用户的平台账号（多账号矩阵）
  async function loadAccounts() {
    try {
      accountsCache = await Db.list("accounts", {
        select: "id, platform, account_name, account_id, group_name",
        order: { col: "platform", ascending: true },
      });
    } catch (e) {
      accountsCache = [];
    }
  }

  // 生成「选择账号」下拉 option（可按平台过滤）
  function accountOptions(platform, currentId) {
    const filtered = accountsCache.filter(a => !platform || a.platform === platform);
    if (filtered.length === 0) {
      return `<option value="">未登记账号（先去设置页登记）</option>`;
    }
    return [
      `<option value="" ${currentId ? "" : "selected"}>不指定账号</option>`,
      ...filtered.map(a => `
        <option value="${a.id}" ${currentId === a.id ? "selected" : ""}>
          ${a.platform ? (PLATFORMS[a.platform]?.name || a.platform) + " · " : ""}${a.account_name}${a.group_name ? `（${a.group_name}）` : ""}
        </option>
      `),
    ].join("");
  }

  async function render() {
    const wrap = $("page-calendar");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">CALENDAR · 内容日历排期</p>
        <h1>内容日历排期</h1>
        <p class="sub">可视化日历 · 拖拽调整 · 批量排期 · 一键跳转发布</p>
      </div>

      <!-- 待发布提醒面板 -->
      <div id="calAlertPanel"></div>

      <!-- 排期统计看板 -->
      <div id="calStatsPanel" class="mb-md"></div>

      <div class="card">
        <div class="toolbar">
          <button class="btn btn-ghost" id="calPrev">‹</button>
          <h3 id="calTitle" style="margin:0; min-width:140px; text-align:center;"></h3>
          <button class="btn btn-ghost" id="calNext">›</button>
          <button class="btn btn-ghost btn-sm" id="calToday">今天</button>
          <div class="spacer"></div>
          <div class="cal-view-switch">
            <button class="btn btn-sm ${calViewMode === "month" ? "btn-primary" : "btn-ghost"}" id="calViewMonth">月视图</button>
            <button class="btn btn-sm ${calViewMode === "week" ? "btn-primary" : "btn-ghost"}" id="calViewWeek">周视图</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="btnBatchSchedule">批量排期</button>
          <button class="btn btn-ghost btn-sm" id="btnScheduleTemplate">排期模板</button>
          <button class="btn btn-primary" id="btnNewSchedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            新建排期
          </button>
        </div>
        <div id="calContainer"></div>
      </div>

      <!-- 图例 -->
      <div class="row mt-md" style="gap:14px; flex-wrap:wrap;">
        ${Object.entries(PLATFORMS).map(([k, p]) => `
          <div class="row gap-sm">
            <span class="cal-item ${k}" style="margin:0; padding:2px 8px;">&nbsp;</span>
            <span class="text-xs muted">${p.name}</span>
          </div>
        `).join("")}
      </div>
    `;

    $("calPrev").addEventListener("click", () => changePeriod(-1));
    $("calNext").addEventListener("click", () => changePeriod(1));
    $("calToday").addEventListener("click", () => { viewDate = new Date(); loadSchedules(); });
    $("btnNewSchedule").addEventListener("click", () => openCreateModal(null, null));
    $("btnBatchSchedule").addEventListener("click", openBatchScheduleModal);
    $("btnScheduleTemplate").addEventListener("click", openTemplateModal);
    $("calViewMonth").addEventListener("click", () => { calViewMode = "month"; loadSchedules(); });
    $("calViewWeek").addEventListener("click", () => { calViewMode = "week"; loadSchedules(); });

    await Promise.all([loadAccounts(), loadSchedules()]);
  }

  function changePeriod(delta) {
    if (calViewMode === "week") {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + delta * 7);
    } else {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
    }
    loadSchedules();
  }

  async function loadSchedules() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    // 计算查询范围：月视图查整月，周视图查本周（周日为周首）
    let start, end;
    if (calViewMode === "week") {
      const dow = viewDate.getDay();
      const weekStart = new Date(year, month, viewDate.getDate() - dow);
      const weekEnd = new Date(year, month, viewDate.getDate() - dow + 7);
      start = weekStart.toISOString();
      end = weekEnd.toISOString();
      $("calTitle").textContent = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate() - 1}日`;
    } else {
      start = new Date(year, month, 1).toISOString();
      end = new Date(year, month + 1, 1).toISOString();
      $("calTitle").textContent = `${year}年${month + 1}月`;
    }

    try {
      // 服务端按日期范围过滤（G7 修复：避免全量拉取）
      schedulesData = await Db.list("schedules", {
        select: "id, content_id, account_id, platform, scheduled_at, actual_published_at, publish_url, publish_params, remark",
        gte: { scheduled_at: start },
        lt: { scheduled_at: end },
        order: { col: "scheduled_at", ascending: true },
      });

      // 通过 Db Gateway 批量加载关联内容标题（G6 修复：不再直连 Supabase）
      const contentIds = [...new Set(schedulesData.map(s => s.content_id).filter(Boolean))];
      if (contentIds.length > 0) {
        const contents = await Db.listByIds("contents", contentIds, { select: "id, title" });
        contents.forEach(item => {
          contentsCache[item.id] = item.title;
        });
      }

      // 渲染提醒面板和统计看板
      renderAlertPanel();
      renderStatsPanel();

      if (calViewMode === "week") {
        renderWeekView();
      } else {
        renderCalendar();
      }
    } catch (e) {
      $("calContainer").innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month, 1).getDay(); // 0=周日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];

    // 上月填充
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, prevMonthDays - i), otherMonth: true });
    }
    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), otherMonth: false });
    }
    // 下月填充到 6 周
    const tailCount = 42 - cells.length;
    for (let d = 1; d <= tailCount; d++) {
      cells.push({ date: new Date(year, month + 1, d), otherMonth: true });
    }

    $("calContainer").innerHTML = `
      <div class="calendar-grid" id="calHead">${WEEK_HEADS.map(h => `<div class="calendar-head">${h}</div>`).join("")}</div>
      <div class="calendar-grid" id="calBody"></div>
    `;

    $("calBody").innerHTML = cells.map(cell => {
      const dateStr = cell.date.toDateString();
      const daySchedules = schedulesData.filter(s => {
        return new Date(s.scheduled_at).toDateString() === dateStr;
      });
      const isToday = cell.date.toDateString() === today.toDateString();

      return `
        <div class="calendar-cell ${cell.otherMonth ? "other-month" : ""} ${isToday ? "today" : ""}" data-date="${cell.date.toISOString()}">
          <div class="calendar-date">${cell.date.getDate()}</div>
          ${daySchedules.map(s => {
            const title = contentsCache[s.content_id] || "未关联内容";
            const published = !!s.actual_published_at;
            const overdue = !published && new Date(s.scheduled_at) < today;
            // U1：未发布的排期可拖拽
            return `
              <div class="cal-item ${s.platform}${published ? " cal-item-locked" : " cal-item-draggable"}${overdue ? " cal-item-overdue" : ""}" data-id="${s.id}" title="${escapeAttr(title)}"${published ? "" : " draggable=\"true\""}>
                ${published ? "✓ " : overdue ? "⚠ " : ""}${PLATFORMS[s.platform]?.name || s.platform}: ${escapeHtml(title.slice(0, 12))}${title.length > 12 ? "..." : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }).join("");

    // 点击单元格 → 新建该日期排期
    $("calBody").querySelectorAll(".calendar-cell").forEach(cell => {
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".cal-item")) return; // 点击的是排期项
        const date = new Date(cell.dataset.date);
        openCreateModal(null, date);
      });
      // U1：拖放目标
      cell.addEventListener("dragover", (e) => {
        if (e.target.closest(".cal-item-draggable")) return;
        e.preventDefault();
        cell.classList.add("drag-over");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/schedule-id");
        if (!id) return;
        const targetDate = new Date(cell.dataset.date);
        moveScheduleToDate(id, targetDate);
      });
    });

    // 点击排期项 → 编辑 / 拖拽
    $("calBody").querySelectorAll(".cal-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(item.dataset.id);
      });
      // U1：拖拽源
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/schedule-id", item.dataset.id);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
    });
  }

  // U1：拖拽更新排期时间——保留原时间 HH:MM，仅替换日期
  async function moveScheduleToDate(id, targetDate) {
    const s = schedulesData.find(x => x.id === id);
    if (!s) return;
    if (s.actual_published_at) {
      toast("已发布的排期不可拖拽");
      return;
    }
    const old = new Date(s.scheduled_at);
    const next = new Date(targetDate);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    // 跨月时若日历显示的是其他月，仍按目标日期落地
    try {
      await Db.update("schedules", id, { scheduled_at: next.toISOString() });
      toast(`已调整到 ${next.getMonth() + 1}月${next.getDate()}日 ${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
      await loadSchedules();
    } catch (e) {
      toast("调整失败: " + e.message);
    }
  }

  // ========== 待发布提醒面板 ==========

  function renderAlertPanel() {
    const now = new Date();
    const todayStr = now.toDateString();
    const in3Days = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

    const overdue = [];
    const todayList = [];
    const upcoming = [];

    schedulesData.forEach(s => {
      if (s.actual_published_at) return; // 已发布不提醒
      const d = new Date(s.scheduled_at);
      const ds = d.toDateString();
      if (d < now && ds !== todayStr) {
        overdue.push(s);
      } else if (ds === todayStr) {
        todayList.push(s);
      } else if (d <= in3Days) {
        upcoming.push(s);
      }
    });

    const panel = $("calAlertPanel");
    if (overdue.length === 0 && todayList.length === 0 && upcoming.length === 0) {
      panel.innerHTML = "";
      return;
    }

    const renderItem = (s) => {
      const title = contentsCache[s.content_id] || "未关联内容";
      const t = new Date(s.scheduled_at);
      return `<span class="alert-chip alert-${s.platform}" data-id="${s.id}">${PLATFORMS[s.platform]?.name || s.platform} · ${escapeHtml(title.slice(0, 14))} · ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}</span>`;
    };

    panel.innerHTML = `
      ${overdue.length > 0 ? `
        <div class="cal-alert cal-alert-danger">
          <span class="alert-icon">⚠</span>
          <span class="alert-label">已过期未发布（${overdue.length}）</span>
          <div class="alert-chips">${overdue.map(renderItem).join("")}</div>
        </div>
      ` : ""}
      ${todayList.length > 0 ? `
        <div class="cal-alert cal-alert-warn">
          <span class="alert-icon">●</span>
          <span class="alert-label">今日待发布（${todayList.length}）</span>
          <div class="alert-chips">${todayList.map(renderItem).join("")}</div>
        </div>
      ` : ""}
      ${upcoming.length > 0 ? `
        <div class="cal-alert cal-alert-info">
          <span class="alert-icon">◐</span>
          <span class="alert-label">未来 3 天排期（${upcoming.length}）</span>
          <div class="alert-chips">${upcoming.map(renderItem).join("")}</div>
        </div>
      ` : ""}
    `;
    panel.querySelectorAll(".alert-chip").forEach(el => {
      el.addEventListener("click", () => openEditModal(el.dataset.id));
    });
  }

  // ========== 排期统计看板 ==========

  function renderStatsPanel() {
    const total = schedulesData.length;
    const published = schedulesData.filter(s => s.actual_published_at).length;
    const pending = total - published;
    const byPlatform = {};
    Object.keys(PLATFORMS).forEach(k => byPlatform[k] = 0);
    schedulesData.forEach(s => { if (byPlatform[s.platform] !== undefined) byPlatform[s.platform]++; });

    $("calStatsPanel").innerHTML = `
      <div class="cal-stats">
        <div class="cal-stat-card">
          <div class="cal-stat-num" style="color:var(--brand);">${total}</div>
          <div class="cal-stat-label">本期排期</div>
        </div>
        <div class="cal-stat-card">
          <div class="cal-stat-num" style="color:var(--ok);">${published}</div>
          <div class="cal-stat-label">已发布</div>
        </div>
        <div class="cal-stat-card">
          <div class="cal-stat-num" style="color:var(--warn);">${pending}</div>
          <div class="cal-stat-label">待发布</div>
        </div>
        ${Object.entries(byPlatform).map(([k, n]) => `
          <div class="cal-stat-card">
            <div class="cal-stat-num" style="color:var(--${k});">${n}</div>
            <div class="cal-stat-label">${PLATFORMS[k].name}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // ========== 周视图 ==========

  function renderWeekView() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const dow = viewDate.getDay();
    const weekStart = new Date(year, month, viewDate.getDate() - dow);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(year, month, weekStart.getDate() + i));
    }

    const hours = [];
    for (let h = 6; h <= 23; h++) hours.push(h);

    const container = $("calContainer");
    container.innerHTML = `
      <div class="cal-week-grid">
        <div class="cal-week-corner"></div>
        ${days.map(d => {
          const isToday = d.toDateString() === today.toDateString();
          return `<div class="cal-week-dayhead ${isToday ? "today" : ""}">
            <span class="cal-week-dow">${WEEK_HEADS[d.getDay()]}</span>
            <span class="cal-week-dom">${d.getDate()}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="cal-week-body">
        ${hours.map(h => `
          <div class="cal-week-row">
            <div class="cal-week-hour">${String(h).padStart(2, "0")}:00</div>
            ${days.map(d => {
              const cellDate = new Date(d);
              cellDate.setHours(h, 0, 0, 0);
              const cellEnd = new Date(d);
              cellEnd.setHours(h + 1, 0, 0, 0);
              const items = schedulesData.filter(s => {
                const sd = new Date(s.scheduled_at);
                return sd >= cellDate && sd < cellEnd;
              });
              const isToday = d.toDateString() === today.toDateString();
              return `<div class="cal-week-cell ${isToday ? "today" : ""}" data-date="${cellDate.toISOString()}" data-hour="${h}">
                ${items.map(s => {
                  const title = contentsCache[s.content_id] || "未关联内容";
                  const published = !!s.actual_published_at;
                  const overdue = !published && new Date(s.scheduled_at) < today;
                  const t = new Date(s.scheduled_at);
                  return `<div class="cal-item ${s.platform}${published ? " cal-item-locked" : " cal-item-draggable"}${overdue ? " cal-item-overdue" : ""}" data-id="${s.id}" title="${escapeAttr(title)}"${published ? "" : " draggable=\"true\""}>${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")} ${escapeHtml(title.slice(0,10))}${title.length>10?"...":""}</div>`;
                }).join("")}
              </div>`;
            }).join("")}
          </div>
        `).join("")}
      </div>
    `;

    // 拖放 + 点击事件
    container.querySelectorAll(".cal-week-cell").forEach(cell => {
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".cal-item")) return;
        const date = new Date(cell.dataset.date);
        openCreateModal(null, date);
      });
      cell.addEventListener("dragover", (e) => {
        e.preventDefault();
        cell.classList.add("drag-over");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/schedule-id");
        if (!id) return;
        const targetDate = new Date(cell.dataset.date);
        moveScheduleToDate(id, targetDate);
      });
    });

    container.querySelectorAll(".cal-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(item.dataset.id);
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/schedule-id", item.dataset.id);
        e.dataTransfer.effectAllowed = "move";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
    });
  }

  async function openCreateModal(content, defaultDate) {
    const date = defaultDate || new Date();
    date.setHours(19, 0, 0, 0); // 默认晚上 7 点

    const contents = await Db.list("contents", {
      select: "id, title",
      order: { col: "updated_at", ascending: false },
      limit: 50,
    });

    showModal(`
      <div class="modal-head">
        <h3>新建排期</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="field">
        <label class="field-label">关联内容 *</label>
        <select id="sContent" class="select">
          ${content ? `<option value="${content.id}" selected>${escapeHtml(content.title)}</option>` : ""}
          ${contents.filter(c => !content || c.id !== content.id).map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("")}
        </select>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">平台 *</label>
          <select id="sPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">计划发布时间 *</label>
          <input id="sTime" class="input" type="datetime-local" value="${formatDateTimeLocal(date)}" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">发布账号 <span class="text-xs muted">（多账号矩阵 · 可留空）</span></label>
        <select id="sAccount" class="select">${accountOptions("", "")}</select>
        <p class="text-xs muted-2 mt-sm">账号会随平台过滤，仅显示对应平台的账号；未登记请先到「设置 → 平台账号管理」新增</p>
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <input id="sRemark" class="input" placeholder="发布注意事项..." />
      </div>
      <!-- U12 平台专属发布参数 -->
      <div class="field">
        <label class="field-label">发布参数 <span class="text-xs muted">（按平台预设）</span></label>
        <div id="publishParamsBox">${renderParamsFields("xhs", defaultParamsFor("xhs"))}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveSchedule">创建排期</button>
      </div>
    `);

    // U12：平台切换时重渲染发布参数
    $("sPlatform").addEventListener("change", (e) => {
      $("publishParamsBox").innerHTML = renderParamsFields(e.target.value, defaultParamsFor(e.target.value));
      // 账号随平台过滤
      $("sAccount").innerHTML = accountOptions(e.target.value, "");
    });

    $("btnSaveSchedule").addEventListener("click", saveSchedule);
  }

  async function openEditModal(id) {
    const s = schedulesData.find(x => x.id === id);
    if (!s) return;

    const contentTitle = contentsCache[s.content_id] || "未关联内容";
    const isPublished = !!s.actual_published_at;
    const platformMeta = PLATFORMS[s.platform];
    const account = accountsCache.find(a => a.id === s.account_id);
    // U12：合并已保存的发布参数与默认值（缺失字段补默认）
    const savedParams = s.publish_params || {};
    const mergedParams = { ...defaultParamsFor(s.platform), ...savedParams };

    showModal(`
      <div class="modal-head">
        <h3>${isPublished ? "排期详情" : "发布排期"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(contentTitle)}</div>
        <div class="list-item-meta">
          <span class="tag">${platformMeta?.name || s.platform}</span>
          <span>· 计划 ${formatDateTime(s.scheduled_at)}</span>
          ${isPublished ? `<span class="tag ok">已发布</span>` : `<span class="tag warn">待发布</span>`}
        </div>
      </div>
      <div class="field">
        <label class="field-label">发布账号</label>
        <select id="sAccount" class="select">${accountOptions(s.platform, s.account_id || "")}</select>
      </div>
      <div class="field">
        <label class="field-label">计划发布时间</label>
        <input id="sTime" class="input" type="datetime-local" value="${formatDateTimeLocal(new Date(s.scheduled_at))}" />
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <input id="sRemark" class="input" value="${escapeAttr(s.remark || "")}" />
      </div>
      <!-- U12 平台专属发布参数 -->
      <div class="field">
        <label class="field-label">发布参数 <span class="text-xs muted">（${platformMeta?.name || s.platform} 预设）</span></label>
        <div id="publishParamsBox">${renderParamsFields(s.platform, mergedParams)}</div>
      </div>
      ${!isPublished ? `
        <div class="callout callout-info" style="margin:0 0 12px;">
          <strong>发布预填</strong>：点击「前往发布」后，标题与正文会自动复制到剪贴板，并打开平台发布页，直接粘贴即可。
        </div>
      ` : ""}
      <div class="modal-foot">
        <button class="btn btn-ghost" id="btnDeleteSchedule" style="margin-right:auto;">删除</button>
        ${!isPublished ? `<button class="btn btn-primary" id="btnPublish">复制并前往发布 →</button>` : `<button class="btn btn-ghost" id="btnUnpublish">取消已发布标记</button>`}
        <button class="btn btn-primary" id="btnUpdateSchedule">保存</button>
      </div>
    `);

    $("btnUpdateSchedule").addEventListener("click", () => updateSchedule(s.id));
    $("btnDeleteSchedule").addEventListener("click", () => deleteSchedule(s.id));
    if (isPublished) {
      $("btnUnpublish").addEventListener("click", () => markPublish(s.id, false));
    } else {
      $("btnPublish").addEventListener("click", async () => {
        // 发布预填增强：复制标题正文 + 打开平台发布页 + 标记已发布
        await copyContentForPublish(s);
        window.open(platformMeta?.url || "#", "_blank");
        markPublish(s.id, true);
      });
    }
  }

  // 发布预填：读取内容标题+正文，复制到剪贴板
  async function copyContentForPublish(s) {
    try {
      let title = contentsCache[s.content_id] || "";
      let body = "";
      if (s.content_id) {
        const c = await Db.get("contents", s.content_id, { select: "title, body, title, adaptations" });
        if (c) {
          title = c.title || title;
          // 优先用平台适配正文，否则用原稿
          const adapt = c.adaptations && c.adaptations[s.platform];
          body = (adapt && (adapt.body || adapt.summary)) || c.body || "";
        }
      }
      const text = (title ? title + "\n\n" : "") + body;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text.trim());
      } else {
        // 降级：隐藏 textarea 复制
        const ta = document.createElement("textarea");
        ta.value = text.trim();
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast(`已复制标题${body ? "+正文" : ""}，去平台粘贴发布`);
    } catch (e) {
      toast("复制失败，请手动复制" + (e.message ? ": " + e.message : ""));
    }
  }

  // U3：排期模板（日更/周更/自定义）——内置 + localStorage 自定义模板
  const BUILTIN_TEMPLATES = [
    {
      id: "tpl-daily",
      name: "日更模板",
      builtin: true,
      // 每天 19:00 发布，按平台顺序循环
      rules: [{ offsetDays: 0, hour: 19, minute: 0, platformCycle: true }],
      description: "每天 19:00 发布，多平台循环",
    },
    {
      id: "tpl-weekly",
      name: "周更模板",
      builtin: true,
      // 周一、三、五 20:00
      rules: [
        { offsetDays: 0, hour: 20, minute: 0 }, // 周一
        { offsetDays: 2, hour: 20, minute: 0 }, // 周三
        { offsetDays: 4, hour: 20, minute: 0 }, // 周五
      ],
      description: "周一/三/五 20:00 发布",
    },
    {
      id: "tpl-triple",
      name: "一日三发",
      builtin: true,
      rules: [
        { offsetDays: 0, hour: 8, minute: 0 },
        { offsetDays: 0, hour: 12, minute: 0 },
        { offsetDays: 0, hour: 20, minute: 0 },
      ],
      description: "每天 8/12/20 点三发",
    },
  ];

  function getCustomTemplates() {
    try {
      return JSON.parse(localStorage.getItem("workbench-schedule-templates") || "[]");
    } catch { return []; }
  }

  function saveCustomTemplates(list) {
    localStorage.setItem("workbench-schedule-templates", JSON.stringify(list));
  }

  async function openTemplateModal() {
    let contents = [];
    try {
      contents = await Db.list("contents", {
        select: "id, title, status",
        order: { col: "updated_at", ascending: false },
        limit: 100,
      });
    } catch (e) {
      toast("加载内容失败: " + e.message);
      return;
    }

    if (contents.length === 0) {
      toast("暂无可排期的内容");
      return;
    }

    const customs = getCustomTemplates();
    const allTemplates = [...BUILTIN_TEMPLATES, ...customs];
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (1 - now.getDay() + 7) % 7, 0, 0, 0, 0);

    showModal(`
      <div class="modal-head">
        <h3>排期模板</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">选择模板和内容池，按模板节奏生成排期</p>

      <div class="field">
        <label class="field-label">起始日期（默认本周一）</label>
        <input id="tplStartDate" class="input" type="date" value="${monday.toISOString().slice(0, 10)}" />
      </div>

      <div class="field">
        <label class="field-label">模板</label>
        <div id="tplList">
          ${allTemplates.map(t => `
            <label class="list-item row gap-sm" style="align-items:center; cursor:pointer; margin-bottom:4px;">
              <input type="radio" name="tplRadio" value="${t.id}" ${t.id === allTemplates[0].id ? "checked" : ""} />
              <div style="flex:1; min-width:0;">
                <div class="list-item-title">${escapeHtml(t.name)}${t.builtin ? '<span class="tag" style="margin-left:6px;">内置</span>' : '<span class="tag warn" style="margin-left:6px;">自定义</span>'}</div>
                <div class="text-xs muted">${escapeHtml(t.description || "")}</div>
              </div>
              ${!t.builtin ? `<button class="btn btn-ghost btn-sm" data-del="${t.id}" type="button">删除</button>` : ""}
            </label>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label class="field-label">内容池（按选中顺序循环填充模板槽位）</label>
        <div id="tplContentList" style="max-height:200px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:8px;">
          ${contents.map(c => `
            <label class="row gap-sm" style="padding:6px 4px; border-bottom:1px solid var(--line);">
              <input type="checkbox" class="tpl-content" value="${c.id}" />
              <span class="text-sm" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title || "无标题")}</span>
              <span class="status-badge status-${c.status}">${c.status}</span>
            </label>
          `).join("")}
        </div>
        <div class="row gap-sm mt-sm">
          <button class="btn btn-ghost btn-sm" id="tplSelectAll" type="button">全选</button>
          <span class="text-xs muted" id="tplSelectedCount">已选 0 项</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">默认平台</label>
        <select id="tplPlatform" class="select">
          ${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("")}
        </select>
        <p class="text-xs muted-2 mt-sm">若模板规则未指定平台，则使用此默认平台</p>
      </div>

      <!-- 新建自定义模板 -->
      <details style="margin-top:12px; border-top:1px solid var(--line); padding-top:12px;">
        <summary class="text-sm" style="cursor:pointer;">+ 新建自定义模板</summary>
        <div class="mt-md">
          <div class="field">
            <label class="field-label">模板名称</label>
            <input id="newTplName" class="input" placeholder="如：早晚两更" />
          </div>
          <div class="field">
            <label class="field-label">规则（每行一条，格式：偏移天,时:分）</label>
            <textarea id="newTplRules" class="textarea" rows="4" placeholder="0,08:00&#10;0,20:00&#10;1,12:00"></textarea>
            <p class="text-xs muted-2 mt-sm">偏移天=从起始日期起第几天；时:分=24小时制</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="btnSaveCustomTpl" type="button">保存为自定义模板</button>
        </div>
      </details>

      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnApplyTpl">应用模板生成排期</button>
      </div>
    `);

    const updateCount = () => {
      const n = document.querySelectorAll(".tpl-content:checked").length;
      $("tplSelectedCount").textContent = `已选 ${n} 项`;
    };
    document.querySelectorAll(".tpl-content").forEach((el) => el.addEventListener("change", updateCount));
    $("tplSelectAll").addEventListener("click", () => {
      document.querySelectorAll(".tpl-content").forEach((el) => (el.checked = true));
      updateCount();
    });

    // 删除自定义模板
    document.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.del;
        const list = getCustomTemplates().filter((t) => t.id !== id);
        saveCustomTemplates(list);
        toast("已删除");
        closeModal();
        openTemplateModal();
      });
    });

    // 保存自定义模板
    $("btnSaveCustomTpl").addEventListener("click", () => {
      const name = $("newTplName").value.trim();
      const rulesText = $("newTplRules").value.trim();
      if (!name) { toast("请填写模板名称"); return; }
      if (!rulesText) { toast("请填写规则"); return; }
      const rules = rulesText.split("\n").map((line) => {
        const m = line.trim().match(/^(\d+),\s*(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        return { offsetDays: parseInt(m[1]), hour: parseInt(m[2]), minute: parseInt(m[3]) };
      }).filter(Boolean);
      if (rules.length === 0) { toast("规则格式错误，应为：偏移天,时:分"); return; }
      const list = getCustomTemplates();
      list.push({
        id: "tpl-custom-" + Date.now(),
        name,
        builtin: false,
        rules,
        description: `自定义 · ${rules.length} 个槽位`,
      });
      saveCustomTemplates(list);
      toast("已保存自定义模板");
      closeModal();
      openTemplateModal();
    });

    // 应用模板
    $("btnApplyTpl").addEventListener("click", async () => {
      const tplId = document.querySelector('input[name="tplRadio"]:checked')?.value;
      const startDateStr = $("tplStartDate").value;
      const contentIds = [...document.querySelectorAll(".tpl-content:checked")].map((el) => el.value);
      const defaultPlatform = $("tplPlatform").value;

      if (!tplId) { toast("请选择模板"); return; }
      if (!startDateStr) { toast("请选择起始日期"); return; }
      if (contentIds.length === 0) { toast("请至少选择一个内容"); return; }

      const tpl = allTemplates.find((t) => t.id === tplId);
      if (!tpl) { toast("模板不存在"); return; }

      const btn = $("btnApplyTpl");
      btn.disabled = true;
      btn.textContent = "生成中...";

      try {
        const baseDate = new Date(startDateStr + "T00:00:00");
        let created = 0, failed = 0;
        let contentIdx = 0;

        // 计算总槽位数（每个内容循环填充）
        const totalSlots = tpl.rules.length;
        const platforms = Object.keys(PLATFORMS);
        // 每个内容填充 totalSlots 个槽位；若平台循环则每槽位用下一平台
        for (let round = 0; round < Math.ceil(contentIds.length / Math.max(1, tpl.platformCycle ? 1 : totalSlots)); round++) {
          for (let s = 0; s < totalSlots; s++) {
            if (contentIdx >= contentIds.length) break;
            const rule = tpl.rules[s];
            const scheduleDate = new Date(baseDate);
            scheduleDate.setDate(baseDate.getDate() + rule.offsetDays);
            scheduleDate.setHours(rule.hour, rule.minute || 0, 0, 0);
            const platform = rule.platform || (tpl.platformCycle ? platforms[contentIdx % platforms.length] : defaultPlatform);
            try {
              await Db.create("schedules", {
                content_id: contentIds[contentIdx],
                platform,
                scheduled_at: scheduleDate.toISOString(),
                publish_url: PLATFORMS[platform]?.url || "",
                publish_params: defaultParamsFor(platform),
                remark: `模板：${tpl.name}`,
              });
              created++;
            } catch (e) {
              failed++;
              console.error(e);
            }
            contentIdx++;
          }
          if (contentIdx >= contentIds.length) break;
        }

        toast(`模板应用完成：成功 ${created}，失败 ${failed}`);
        closeModal();
        await loadSchedules();
      } catch (e) {
        toast("应用模板失败: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "应用模板生成排期";
      }
    });
  }

  // U2：批量排期——多内容 × 多平台 × 起始日期，按间隔生成排期
  async function openBatchScheduleModal() {
    let contents = [];
    try {
      contents = await Db.list("contents", {
        select: "id, title, status",
        order: { col: "updated_at", ascending: false },
        limit: 100,
      });
    } catch (e) {
      toast("加载内容失败: " + e.message);
      return;
    }

    if (contents.length === 0) {
      toast("暂无可排期的内容");
      return;
    }

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19, 0, 0, 0);

    showModal(`
      <div class="modal-head">
        <h3>批量排期</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <p class="text-xs muted mb-md">勾选多个内容 × 多个平台，从起始日期起按间隔天数依次生成排期</p>

      <div class="grid grid-2 mb-md">
        <div class="field">
          <label class="field-label">起始日期 *</label>
          <input id="bsStartDate" class="input" type="datetime-local" value="${formatDateTimeLocal(tomorrow)}" />
        </div>
        <div class="field">
          <label class="field-label">间隔天数</label>
          <input id="bsInterval" class="input" type="number" min="0" value="1" />
          <p class="text-xs muted-2">同一内容多平台之间的间隔；0=同一天不同平台</p>
        </div>
      </div>

      <div class="field">
        <label class="field-label">平台（多选）</label>
        <div class="row gap-md" style="flex-wrap:wrap;">
          ${Object.entries(PLATFORMS).map(([k, p]) => `
            <label class="row gap-sm">
              <input type="checkbox" class="bs-platform" value="${k}" checked />
              <span class="text-sm">${p.name}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label class="field-label">内容（多选，最多 30 条）</label>
        <div id="bsContentList" style="max-height:240px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:8px;">
          ${contents.map(c => `
            <label class="row gap-sm" style="padding:6px 4px; border-bottom:1px solid var(--line);">
              <input type="checkbox" class="bs-content" value="${c.id}" />
              <span class="text-sm" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.title || "无标题")}</span>
              <span class="status-badge status-${c.status}">${c.status}</span>
            </label>
          `).join("")}
        </div>
        <div class="row gap-sm mt-sm">
          <button class="btn btn-ghost btn-sm" id="bsSelectAll" type="button">全选</button>
          <button class="btn btn-ghost btn-sm" id="bsClearAll" type="button">清空</button>
          <span class="text-xs muted" id="bsSelectedCount">已选 0 项</span>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnBatchCreate">生成排期</button>
      </div>
    `);

    const updateCount = () => {
      const n = document.querySelectorAll(".bs-content:checked").length;
      $("bsSelectedCount").textContent = `已选 ${n} 项`;
    };
    document.querySelectorAll(".bs-content").forEach((el) => el.addEventListener("change", updateCount));
    $("bsSelectAll").addEventListener("click", () => {
      document.querySelectorAll(".bs-content").forEach((el) => (el.checked = true));
      updateCount();
    });
    $("bsClearAll").addEventListener("click", () => {
      document.querySelectorAll(".bs-content").forEach((el) => (el.checked = false));
      updateCount();
    });

    $("btnBatchCreate").addEventListener("click", async () => {
      const startDateStr = $("bsStartDate").value;
      const interval = parseInt($("bsInterval").value) || 0;
      const platforms = [...document.querySelectorAll(".bs-platform:checked")].map((el) => el.value);
      const contentIds = [...document.querySelectorAll(".bs-content:checked")].map((el) => el.value);

      if (!startDateStr) { toast("请选择起始日期"); return; }
      if (platforms.length === 0) { toast("请至少选择一个平台"); return; }
      if (contentIds.length === 0) { toast("请至少选择一个内容"); return; }
      if (contentIds.length > 30) { toast("最多支持 30 条内容批量排期"); return; }

      const btn = $("btnBatchCreate");
      btn.disabled = true;
      btn.textContent = "生成中...";

      try {
        const baseDate = new Date(startDateStr);
        let created = 0;
        let failed = 0;
        // 内容间按 1 天推进；同一内容的多平台按 interval 天错开
        for (let i = 0; i < contentIds.length; i++) {
          for (let j = 0; j < platforms.length; j++) {
            const scheduleDate = new Date(baseDate);
            scheduleDate.setDate(baseDate.getDate() + i + j * interval);
            scheduleDate.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
            try {
              await Db.create("schedules", {
                content_id: contentIds[i],
                platform: platforms[j],
                scheduled_at: scheduleDate.toISOString(),
                publish_url: PLATFORMS[platforms[j]]?.url || "",
                publish_params: defaultParamsFor(platforms[j]),
                remark: "批量排期生成",
              });
              created++;
            } catch (e) {
              failed++;
              console.error("批量排期失败", e);
            }
          }
        }
        toast(`批量排期完成：成功 ${created}，失败 ${failed}`);
        closeModal();
        await loadSchedules();
      } catch (e) {
        toast("批量排期失败: " + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "生成排期";
      }
    });
  }

  async function saveSchedule() {
    const contentId = $("sContent").value;
    const platform = $("sPlatform").value;
    const accountId = $("sAccount") ? $("sAccount").value : "";
    const timeStr = $("sTime").value;
    const remark = $("sRemark").value.trim();

    if (!contentId) { toast("请选择关联内容"); return; }
    if (!platform) { toast("请选择平台"); return; }
    if (!timeStr) { toast("请选择时间"); return; }

    try {
      await Db.create("schedules", {
        content_id: contentId,
        account_id: accountId || null,
        platform,
        scheduled_at: new Date(timeStr).toISOString(),
        publish_url: PLATFORMS[platform]?.url || "",
        publish_params: readParamsFromForm(platform),
        remark,
      });
      toast("排期已创建");
      closeModal();
      await loadSchedules();
    } catch (e) {
      toast("创建失败: " + e.message);
    }
  }

  async function updateSchedule(id) {
    const s = schedulesData.find(x => x.id === id);
    const platform = s?.platform || "xhs";
    const timeStr = $("sTime").value;
    const remark = $("sRemark").value.trim();
    const accountId = $("sAccount") ? $("sAccount").value : "";
    try {
      await Db.update("schedules", id, {
        scheduled_at: new Date(timeStr).toISOString(),
        account_id: accountId || null,
        publish_params: readParamsFromForm(platform),
        remark,
      });
      toast("已更新");
      closeModal();
      await loadSchedules();
    } catch (e) {
      toast("更新失败: " + e.message);
    }
  }

  async function deleteSchedule(id) {
    const ok = await confirm("确定删除该排期？");
    if (!ok) return;
    try {
      await Db.remove("schedules", id);
      toast("已删除");
      closeModal();
      await loadSchedules();
    } catch (e) {
      toast("删除失败: " + e.message);
    }
  }

  async function markPublish(id, published) {
    try {
      await Db.update("schedules", id, {
        actual_published_at: published ? new Date().toISOString() : null,
      });
      if (published) {
        // G11 修复：仅当该内容的所有排期都已发布时，才把 content 标记为 published
        const s = schedulesData.find(x => x.id === id);
        if (s) {
          // 查询该内容的所有排期
          const allSchedules = await Db.list("schedules", {
            select: "id, actual_published_at",
            eq: { content_id: s.content_id },
          });
          const allPublished = allSchedules.length > 0 && allSchedules.every(x => x.actual_published_at);
          const contentStatus = allPublished ? "published" : "pending_publish";
          await Db.update("contents", s.content_id, { status: contentStatus });

          // U5：自动进入数据复盘池——为该 schedule 创建一条 metrics 记录（数据全 0，待手动补录）
          // 通过 schedule_id 去重，避免重复创建
          const existed = await Db.list("metrics", {
            select: "id",
            eq: { schedule_id: id },
            limit: 1,
          });
          if (existed.length === 0) {
            await Db.create("metrics", {
              content_id: s.content_id,
              schedule_id: id,
              platform: s.platform,
              views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, followers_gained: 0,
              is_viral: false, is_flop: false,
              review_notes: "",
              recorded_at: new Date().toISOString(),
            });
          }
        }
        toast("已标记为发布，已自动进入复盘池");
      } else {
        // 取消发布标记时：若 content 已是 published，回退到 pending_publish
        const s = schedulesData.find(x => x.id === id);
        if (s) {
          const content = await Db.get("contents", s.content_id, { select: "id, status" });
          if (content && content.status === "published") {
            await Db.update("contents", s.content_id, { status: "pending_publish" });
          }
          // U5：取消发布时删除自动创建的复盘记录（仅删除数据全 0 且无复盘笔记的占位记录）
          const placeholders = await Db.list("metrics", {
            select: "id, views, review_notes",
            eq: { schedule_id: id },
          });
          for (const m of placeholders) {
            if ((m.views || 0) === 0 && !m.review_notes) {
              await Db.remove("metrics", m.id);
            }
          }
        }
        toast("已取消发布标记");
      }
      closeModal();
      await loadSchedules();
    } catch (e) {
      toast("操作失败: " + e.message);
    }
  }

  return {
    render,
    openCreateModal,
  };
  })();
  return Calendar;
});
