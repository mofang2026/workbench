/**
 * 定时提醒推送 · 模块
 * - 发布到期提醒（未来 X 分钟内将发布的排期）
 * - 逾期未发布提醒
 * - 支持浏览器通知（Notification API）+ 页内徽标（标题栏红点 + 顶栏横幅）
 * - 配置存于 localStorage
 */
const Reminders = (function () {
  const KEY = "workbench-reminder-settings";
  const SEEN_KEY = "workbench-reminder-seen-v1";

  const DEFAULTS = {
    enabled: true,        // 总开关
    leadMinutes: 30,      // 提前提醒分钟
    notifyBrowser: true,  // 浏览器系统通知
    showPageBadge: true,  // 页内徽标
    alertOverdue: true,   // 逾期未发布提醒
  };

  let timer = null;
  let lastSeen = [];

  function getSettings() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) };
    } catch { return { ...DEFAULTS }; }
  }

  function saveSettings(s) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  function getSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); }
    catch { return []; }
  }

  function setSeen(arr) {
    // 保留最近 500 条去重记录
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set(arr)].slice(-500)));
  }

  // 请求浏览器通知权限
  async function requestPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const p = await Notification.requestPermission();
      return p === "granted";
    } catch { return false; }
  }

  function notifyBrowser(text, opts) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      new Notification(truncate(text, 40), opts);
    } catch (e) {
      /* 忽略通知失败 */
    }
  }

  function truncate(s, n) {
    const str = String(s || "");
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  // 返回需要提醒的排期：未来 lead 分钟内 + 逾期未发布
  function collectReminders(schedules, settings) {
    const now = Date.now();
    const upcoming = []; // { id, text, when }
    const overdue = [];
    schedules.forEach((s) => {
      if (s.actual_published_at) return; // 已发布
      const t = new Date(s.scheduled_at).getTime();
      if (t >= now && t - now <= settings.leadMinutes * 60 * 1000) {
        upcoming.push(s);
      } else if (settings.alertOverdue && t < now && !s.reminder_sent) {
        overdue.push(s);
      }
    });
    return { upcoming, overdue };
  }

  async function checkAndNotify() {
    const settings = getSettings();
    if (!settings.enabled) { renderGlobalBadge(0, 0); return; }

    const seen = getSeen();
    let upcomingCount = 0;
    let overdueCount = 0;

    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 3600 * 1000).toISOString(); // 回溯一天查逾期
      const end = new Date(now.getTime() + settings.leadMinutes * 60 * 1000).toISOString();

      const schedules = await window.Db.list("schedules", {
        select: "id, content_id, account_id, platform, scheduled_at, actual_published_at, reminder_sent",
        gte: { scheduled_at: start },
        lt: { scheduled_at: end },
      });

      const { upcoming, overdue } = collectReminders(schedules, settings);

      // 加载内容标题
      const ids = [...new Set([...upcoming, ...overdue].map((s) => s.content_id).filter(Boolean))];
      const titleMap = {};
      if (ids.length) {
        const cs = await window.Db.listByIds("contents", ids, { select: "id, title" });
        cs.forEach((c) => { titleMap[c.id] = c.title; });
      }

      upcomingCount = upcoming.length;
      overdueCount = overdue.length;

      // 只对首次出现的排期做浏览器通知（避免每轮重复打扰）
      const fresh = [...upcoming, ...overdue].filter((s) => !seen.includes(s.id));
      if (settings.notifyBrowser && fresh.length) {
        const granted = await requestPermission();
        if (granted) {
          fresh.forEach((s) => {
            const title = titleMap[s.content_id] || "未关联内容";
            const t = new Date(s.scheduled_at);
            const isUpcoming = new Date(s.scheduled_at).getTime() >= Date.now();
            notifyBrowser(isUpcoming ? `📌 即将发布：《${title}》` : `⚠ 逾期未发布：《${title}》`, {
              body: `${t.getMonth() + 1}月${t.getDate()}日 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
            });
          });
        }
      }
      if (fresh.length) {
        setSeen([...seen, ...fresh.map((s) => s.id)]);
      }
    } catch (e) {
      /* 查询失败时静默，不影响页面 */
    }

    renderGlobalBadge(upcomingCount, overdueCount);
  }

  // 页内徽标：顶栏账户旁显示红点（数量摘要）
  function renderGlobalBadge(upcoming, overdue) {
    const el = $("reminderBadge");
    const total = upcoming + overdue;
    if (!el || total === 0) { return; }
    el.textContent = total > 9 ? "9+" : String(total);
    el.classList.toggle("overdue", overdue > 0);
  }

  // 启动常驻定时器（每分钟检查一次）
  function start() {
    if (timer) return;
    // 插入全局徽标元素
    ensureBadgeEl();
    checkAndNotify();
    timer = setInterval(checkAndNotify, 60 * 1000);
  }

  function ensureBadgeEl() {
    if ($("reminderBadge")) return;
    const badge = document.createElement("span");
    badge.id = "reminderBadge";
    badge.className = "reminder-badge";
    badge.style.display = "none";
    // 追加到 body，靠右上角固定
    document.body.appendChild(badge);
  }

  async function renderSettingsPanel(container) {
    const s = getSettings();
    let permText = "未知";
    if (!("Notification" in window)) permText = "不支持";
    else if (Notification.permission === "granted") permText = "已授权";
    else if (Notification.permission === "denied") permText = "已禁用";
    else permText = "未授权";

    container.innerHTML = `
      <div class="card-title"><span>提醒推送</span></div>
      <p class="text-xs muted mb-md">用于发布到期 / 逾期未发布的浏览器通知提醒。页面打开时常驻后台，每分钟检查一次。</p>
      <div class="field">
        <label class="row gap-sm">
          <input type="checkbox" id="rmEnabled" ${s.enabled ? "checked" : ""} />
          <span class="text-sm">启用定时提醒</span>
        </label>
      </div>
      <div class="field">
        <label class="field-label">提前提醒（分钟）</label>
        <input type="number" id="rmLead" class="input" min="1" max="1440" value="${s.leadMinutes}" />
      </div>
      <div class="field">
        <label class="row gap-sm">
          <input type="checkbox" id="rmBrowser" ${s.notifyBrowser ? "checked" : ""} />
          <span class="text-sm">浏览器系统通知（状态：${permText}）</span>
        </label>
        ${("Notification" in window) && Notification.permission !== "granted" ? `
          <button class="btn btn-ghost btn-sm mt-sm" id="rmPerm">申请通知权限</button>
        ` : ""}
      </div>
      <div class="field">
        <label class="row gap-sm">
          <input type="checkbox" id="rmBadge" ${s.showPageBadge ? "checked" : ""} />
          <span class="text-sm">页内红色角标提示</span>
        </label>
      </div>
      <div class="field">
        <label class="row gap-sm">
          <input type="checkbox" id="rmOverdue" ${s.alertOverdue ? "checked" : ""} />
          <span class="text-sm">逾期未发布提醒</span>
        </label>
      </div>
      <div class="row gap-sm mt-md">
        <button class="btn btn-primary" id="rmSave">保存提醒设置</button>
        <button class="btn btn-ghost" id="rmTest">发送测试通知</button>
      </div>
      <p class="text-xs muted-2 mt-md">提示：浏览器通知仅在页面打开时有效；如需登录即常驻，可保持浏览器窗口常开。</p>
    `;

    $("rmSave").addEventListener("click", () => {
      saveSettings({
        enabled: $("rmEnabled").checked,
        leadMinutes: parseInt($("rmLead").value) || 30,
        notifyBrowser: $("rmBrowser").checked,
        showPageBadge: $("rmBadge").checked,
        alertOverdue: $("rmOverdue").checked,
      });
      toast("提醒设置已保存");
    });

    const permBtn = $("rmPerm");
    if (permBtn) {
      permBtn.addEventListener("click", async () => {
        const ok = await requestPermission();
        toast(ok ? "通知权限已开启" : "通知权限被拒绝");
        renderSettingsPanel(container);
      });
    }

    $("rmTest").addEventListener("click", async () => {
      const s = getSettings();
      if (s.notifyBrowser) {
        const ok = await requestPermission();
        if (ok) {
          notifyBrowser("🔔 测试通知", { body: "提醒功能工作正常！" });
          toast("测试通知已发送");
        } else {
          toast("未获得通知权限");
        }
      } else {
        toast("当前未开启浏览器通知", 2500);
      }
    });
  }

  return { start, renderSettingsPanel, requestPermission };
})();

window.Reminders = Reminders;