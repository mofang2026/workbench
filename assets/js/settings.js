/**
 * 账号与设置 · 模块
 * - AI 配置（模式切换 + DeepSeek Key + 模型选择）★ 解决 B3
 * - 平台账号登记（降级方案：信息登记 + 状态手动标记）
 * - Supabase 配置查看/重置
 */

const Settings = (function () {
  const PLATFORMS = {
    xhs: { name: "小红书", url: "https://creator.xiaohongshu.com" },
    douyin: { name: "抖音", url: "https://creator.douyin.com" },
    bilibili: { name: "B站", url: "https://member.bilibili.com" },
    wechat: { name: "公众号", url: "https://mp.weixin.qq.com" },
  };

  let accountsCache = [];

  async function render() {
    const wrap = $("page-settings");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">SETTINGS · 账号与设置</p>
        <h1>账号与设置</h1>
        <p class="sub">AI 配置 · 平台账号管理 · 系统配置</p>
      </div>

      <!-- AI 配置 -->
      <div class="card mb-lg" id="aiConfigCard"></div>

      <!-- 平台账号 -->
      <div class="card mb-lg">
        <div class="card-title">
          <span>平台账号管理</span>
          <button class="btn btn-primary btn-sm" id="btnNewAccount">+ 新增账号</button>
        </div>
        <p class="text-xs muted mb-md">降级方案：信息登记 + 状态手动标记（不做 OAuth 真实绑定）</p>
        <div id="accountList"></div>
      </div>

      <!-- U14 数据导出 -->
      <div class="card mb-lg">
        <div class="card-title"><span>数据管理</span></div>
        <p class="text-xs muted mb-md">将各模块数据导出为 CSV 文件，可用于备份或外部分析</p>
        <div class="row gap-sm" style="flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" data-export="topics">导出选题</button>
          <button class="btn btn-ghost btn-sm" data-export="contents">导出内容</button>
          <button class="btn btn-ghost btn-sm" data-export="schedules">导出排期</button>
          <button class="btn btn-ghost btn-sm" data-export="assets">导出素材</button>
          <button class="btn btn-ghost btn-sm" data-export="metrics">导出复盘数据</button>
          <button class="btn btn-primary btn-sm" id="btnExportAll">全部导出</button>
        </div>
        <div id="exportStatus" class="text-xs muted mt-md"></div>
      </div>

      <!-- 系统配置 -->
      <div class="card">
        <div class="card-title"><span>系统配置</span></div>
        <div id="systemConfig"></div>
      </div>
    `;

    renderAiConfig();
    await renderAccounts();
    renderSystemConfig();

    $("btnNewAccount").addEventListener("click", () => openAccountEditor(null));

    // U14 导出事件
    wrap.querySelectorAll("[data-export]").forEach((btn) => {
      btn.addEventListener("click", () => exportTable(btn.dataset.export));
    });
    $("btnExportAll").addEventListener("click", exportAll);
  }

  // ========== U14 全局数据导出 ==========

  const EXPORT_TABLES = {
    topics: {
      label: "选题",
      orderCol: "updated_at",
      columns: ["title", "platform", "track", "status", "is_hot", "source", "keywords", "description", "updated_at"],
      headers: ["标题", "平台", "赛道", "状态", "爆款", "来源", "关键词", "描述", "更新时间"],
      format: (r) => [
        r.title || "",
        r.platform || "",
        r.track || "",
        r.status || "",
        r.is_hot ? "是" : "否",
        r.source || "",
        (r.keywords || []).join(" "),
        (r.description || "").replace(/[\n\r]/g, " "),
        r.updated_at || "",
      ],
    },
    contents: {
      label: "内容",
      orderCol: "updated_at",
      columns: ["title", "status", "tags", "ai_checkpassed", "ai_score", "body", "updated_at"],
      headers: ["标题", "状态", "标签", "质检通过", "AI评分", "正文", "更新时间"],
      format: (r) => [
        r.title || "",
        r.status || "",
        (r.tags || []).join(" "),
        r.ai_checkpassed ? "是" : "否",
        r.ai_score?.total ?? "",
        (r.body || "").replace(/[\n\r]/g, " "),
        r.updated_at || "",
      ],
    },
    schedules: {
      label: "排期",
      orderCol: "scheduled_at",
      columns: ["content_id", "platform", "scheduled_at", "actual_published_at", "publish_url", "remark"],
      headers: ["内容ID", "平台", "计划时间", "实际发布", "发布链接", "备注"],
      format: (r) => [
        r.content_id || "",
        r.platform || "",
        r.scheduled_at || "",
        r.actual_published_at || "",
        r.publish_url || "",
        (r.remark || "").replace(/[\n\r]/g, " "),
      ],
    },
    assets: {
      label: "素材",
      orderCol: "created_at",
      columns: ["type", "title", "platform", "is_favorite", "url", "content", "tags", "created_at"],
      headers: ["类型", "标题", "平台", "收藏", "链接", "文案", "标签", "创建时间"],
      format: (r) => [
        r.type || "",
        r.title || "",
        r.platform || "",
        r.is_favorite ? "是" : "否",
        r.url || "",
        (r.content || "").replace(/[\n\r]/g, " "),
        (r.tags || []).join(" "),
        r.created_at || "",
      ],
    },
    metrics: {
      label: "复盘数据",
      orderCol: "recorded_at",
      columns: ["platform", "views", "likes", "favorites", "comments", "shares", "followers_gained", "is_viral", "is_flop", "review_notes", "recorded_at"],
      headers: ["平台", "阅读", "点赞", "收藏", "评论", "转发", "涨粉", "爆款", "踩坑", "复盘笔记", "记录时间"],
      format: (r) => [
        r.platform || "",
        r.views || 0,
        r.likes || 0,
        r.favorites || 0,
        r.comments || 0,
        r.shares || 0,
        r.followers_gained || 0,
        r.is_viral ? "是" : "否",
        r.is_flop ? "是" : "否",
        (r.review_notes || "").replace(/[\n\r]/g, " "),
        r.recorded_at || "",
      ],
    },
  };

  async function exportTable(tableName) {
    const conf = EXPORT_TABLES[tableName];
    if (!conf) return;
    const status = $("exportStatus");
    if (status) status.textContent = `正在导出 ${conf.label}...`;
    try {
      const rows = await window.Db.list(tableName, {
        select: conf.columns.join(", "),
        order: { col: conf.orderCol, ascending: false },
        limit: 5000,
      });
      downloadCsv(conf.headers, rows.map(conf.format), `${conf.label}_${formatDate(new Date().toISOString())}.csv`);
      if (status) status.textContent = `已导出 ${rows.length} 条 ${conf.label}`;
      toast(`已导出 ${conf.label}（${rows.length} 条）`);
    } catch (e) {
      if (status) status.textContent = `导出失败: ${e.message}`;
      toast("导出失败: " + e.message);
    }
  }

  async function exportAll() {
    const status = $("exportStatus");
    if (status) status.textContent = "正在导出全部数据...";
    let okCount = 0;
    for (const [tableName, conf] of Object.entries(EXPORT_TABLES)) {
      try {
        const rows = await window.Db.list(tableName, {
          select: conf.columns.join(", "),
          order: { col: conf.orderCol, ascending: false },
          limit: 5000,
        });
        downloadCsv(conf.headers, rows.map(conf.format), `${conf.label}_${formatDate(new Date().toISOString())}.csv`);
        okCount++;
        if (status) status.textContent = `已导出 ${okCount}/${Object.keys(EXPORT_TABLES).length}：${conf.label}（${rows.length} 条）`;
        // 浏览器多文件下载间隔
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        if (status) status.textContent = `${conf.label} 导出失败: ${e.message}`;
      }
    }
    toast(`全部导出完成（${okCount}/${Object.keys(EXPORT_TABLES).length}）`);
  }

  function downloadCsv(headers, rows, filename) {
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========== AI 配置 ==========

  function renderAiConfig() {
    const s = window.AiGateway.getSettings();
    const card = $("aiConfigCard");
    card.innerHTML = `
      <div class="card-title">
        <span>AI 配置</span>
        <span class="ai-badge">DeepSeek</span>
      </div>
      <p class="text-xs muted mb-md">
        本地开发选「直连模式」并填入 DeepSeek API Key；生产环境（Vercel 部署后）选「代理模式」由服务端调用，Key 不暴露。
      </p>

      <div class="field">
        <label class="field-label">调用模式</label>
        <div class="row gap-md">
          <label class="row gap-sm">
            <input type="radio" name="aiMode" value="direct" ${s.mode === "direct" ? "checked" : ""} />
            <span class="text-sm">直连模式（本地开发推荐）</span>
          </label>
          <label class="row gap-sm">
            <input type="radio" name="aiMode" value="proxy" ${s.mode === "proxy" ? "checked" : ""} />
            <span class="text-sm">代理模式（生产推荐）</span>
          </label>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">DeepSeek API Key</label>
          <input id="aiApiKey" class="input" type="password" value="${escapeAttr(s.apiKey)}" placeholder="sk-xxxxxxxxxxxxxxxx" />
        </div>
        <div class="field">
          <label class="field-label">Base URL</label>
          <input id="aiBaseUrl" class="input" value="${escapeAttr(s.baseUrl)}" placeholder="https://api.deepseek.com/v1" />
        </div>
      </div>

      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">主模型（通用对话）</label>
          <input id="aiModel" class="input" value="${escapeAttr(s.model)}" placeholder="deepseek-chat" />
        </div>
        <div class="field">
          <label class="field-label">推理模型（质检/打分）</label>
          <input id="aiReasonerModel" class="input" value="${escapeAttr(s.reasonerModel)}" placeholder="deepseek-reasoner" />
        </div>
      </div>

      <div class="row gap-sm mt-md">
        <button class="btn btn-primary" id="btnSaveAiConfig">保存配置</button>
        <button class="btn btn-ghost" id="btnTestAi">测试连接</button>
        <span id="aiTestResult" class="text-xs"></span>
      </div>
    `;

    document.querySelectorAll('input[name="aiMode"]').forEach((el) => {
      el.addEventListener("change", () => toggleAiModeHint());
    });

    $("btnSaveAiConfig").addEventListener("click", saveAiConfig);
    $("btnTestAi").addEventListener("click", testAi);
    toggleAiModeHint();
  }

  function toggleAiModeHint() {
    const mode = document.querySelector('input[name="aiMode"]:checked')?.value;
    const keyField = $("aiApiKey").closest(".field");
    const urlField = $("aiBaseUrl").closest(".field");
    if (mode === "proxy") {
      keyField.style.opacity = "0.5";
      urlField.style.opacity = "0.5";
    } else {
      keyField.style.opacity = "1";
      urlField.style.opacity = "1";
    }
  }

  function saveAiConfig() {
    const mode = document.querySelector('input[name="aiMode"]:checked')?.value || "proxy";
    const settings = {
      mode,
      apiKey: $("aiApiKey").value.trim(),
      baseUrl: $("aiBaseUrl").value.trim() || "https://api.deepseek.com/v1",
      model: $("aiModel").value.trim() || "deepseek-chat",
      reasonerModel: $("aiReasonerModel").value.trim() || "deepseek-reasoner",
    };

    if (mode === "direct" && !settings.apiKey) {
      toast("直连模式需填写 API Key");
      return;
    }

    window.AiGateway.saveSettings(settings);
    toast("AI 配置已保存");
  }

  async function testAi() {
    const result = $("aiTestResult");
    // 先保存再测试
    saveAiConfig();
    result.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> 测试中...</span>';
    try {
      const text = await window.AiGateway.generate("请回复「连接成功」四个字", {
        system: "简洁回复。",
        maxTokens: 50,
      });
      result.innerHTML = `<span class="text-ok">✓ 连接成功：${escapeHtml(text.slice(0, 20))}</span>`;
    } catch (e) {
      result.innerHTML = `<span class="text-danger">✗ ${escapeHtml(e.message)}</span>`;
    }
  }

  // ========== 平台账号管理 ==========

  async function renderAccounts() {
    const wrap = $("accountList");
    try {
      accountsCache = await window.Db.list("accounts", {
        order: { col: "platform", ascending: true },
      });
      if (accountsCache.length === 0) {
        wrap.innerHTML = `
          <div class="empty-state">
            <div class="em-icon">🔌</div>
            <div>还没有账号，点击「新增账号」登记平台账号</div>
          </div>`;
        return;
      }
      wrap.innerHTML = accountsCache.map((a) => `
        <div class="list-item" data-id="${a.id}">
          <div class="list-item-head">
            <div class="list-item-title">${escapeHtml(a.account_name)}</div>
            <span class="status-badge status-${a.status === "active" ? "qa_passed" : a.status === "warning" ? "pending" : "archived"}">${statusText(a.status)}</span>
          </div>
          <div class="list-item-meta">
            <span class="tag">${PLATFORMS[a.platform]?.name || a.platform}</span>
            ${a.group_name ? `<span>· ${escapeHtml(a.group_name)}</span>` : ""}
            ${a.config?.fans != null ? `<span>· 粉丝 ${formatNum(a.config.fans)}</span>` : ""}
            ${a.account_url ? `<span>· <a href="${escapeAttr(a.account_url)}" target="_blank">主页</a></span>` : ""}
          </div>
        </div>
      `).join("");
      wrap.querySelectorAll(".list-item").forEach((el) => {
        el.addEventListener("click", () => {
          openAccountEditor(accountsCache.find((a) => a.id === el.dataset.id));
        });
      });
    } catch (e) {
      wrap.innerHTML = `<div class="empty-state text-danger">加载失败: ${e.message}</div>`;
    }
  }

  function openAccountEditor(account) {
    const isEdit = !!account;
    const a = account || {
      platform: "xhs",
      account_name: "",
      account_id: "",
      account_url: "",
      group_name: "",
      status: "active",
      config: { fans: 0, monthPublished: 0 },
      remark: "",
    };

    showModal(`
      <div class="modal-head">
        <h3>${isEdit ? "编辑账号" : "新增账号"}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">平台 *</label>
          <select id="aPlatform" class="select">
            ${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}" ${a.platform === k ? "selected" : ""}>${p.name}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label">状态</label>
          <select id="aStatus" class="select">
            <option value="active" ${a.status === "active" ? "selected" : ""}>在线</option>
            <option value="warning" ${a.status === "warning" ? "selected" : ""}>待检测</option>
            <option value="inactive" ${a.status === "inactive" ? "selected" : ""}>未绑定</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">账号昵称 *</label>
        <input id="aName" class="input" value="${escapeAttr(a.account_name)}" placeholder="账号显示名" />
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">平台账号 ID</label>
          <input id="aAccountId" class="input" value="${escapeAttr(a.account_id || "")}" placeholder="手动填写" />
        </div>
        <div class="field">
          <label class="field-label">分组</label>
          <input id="aGroup" class="input" value="${escapeAttr(a.group_name || "")}" placeholder="如：主号/小号" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">主页链接</label>
        <input id="aUrl" class="input" value="${escapeAttr(a.account_url || "")}" placeholder="https://..." />
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">粉丝数</label>
          <input id="aFans" class="input" type="number" value="${a.config?.fans || 0}" />
        </div>
        <div class="field">
          <label class="field-label">本月发布量</label>
          <input id="aMonthPub" class="input" type="number" value="${a.config?.monthPublished || 0}" />
        </div>
      </div>
      <div class="field">
        <label class="field-label">备注</label>
        <input id="aRemark" class="input" value="${escapeAttr(a.remark || "")}" />
      </div>
      <div class="modal-foot">
        ${isEdit ? `<button class="btn btn-ghost" id="btnDeleteAccount" style="margin-right:auto;">删除</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSaveAccount">保存</button>
      </div>
    `);

    $("btnSaveAccount").addEventListener("click", () => saveAccount(isEdit ? a.id : null));
    if (isEdit) {
      $("btnDeleteAccount").addEventListener("click", () => deleteAccount(a.id));
    }
  }

  async function saveAccount(id) {
    const name = $("aName").value.trim();
    if (!name) { toast("请填写账号昵称"); return; }

    const payload = {
      platform: $("aPlatform").value,
      account_name: name,
      account_id: $("aAccountId").value.trim(),
      account_url: $("aUrl").value.trim(),
      group_name: $("aGroup").value.trim(),
      status: $("aStatus").value,
      config: {
        fans: parseInt($("aFans").value) || 0,
        monthPublished: parseInt($("aMonthPub").value) || 0,
      },
      remark: $("aRemark").value.trim(),
      last_check_at: new Date().toISOString(),
    };

    try {
      if (id) {
        await window.Db.update("accounts", id, payload);
      } else {
        await window.Db.create("accounts", payload);
      }
      toast("已保存");
      closeModal();
      await renderAccounts();
    } catch (e) {
      toast("保存失败: " + e.message);
    }
  }

  async function deleteAccount(id) {
    const ok = await confirm("确定删除该账号？");
    if (!ok) return;
    try {
      await window.Db.remove("accounts", id);
      toast("已删除");
      closeModal();
      await renderAccounts();
    } catch (e) {
      toast("删除失败: " + e.message);
    }
  }

  // ========== 系统配置 ==========

  function renderSystemConfig() {
    const cfg = window.WorkbenchConfig.getSupabaseConfig();
    const wrap = $("systemConfig");
    wrap.innerHTML = `
      <div class="list-item">
        <div class="list-item-head">
          <div class="list-item-title">Supabase 连接</div>
          <span class="tag ok">已配置</span>
        </div>
        <div class="list-item-meta">
          <span>URL: ${escapeHtml(cfg.url)}</span>
        </div>
      </div>
      <div class="mt-md">
        <button class="btn btn-ghost" id="btnResetConfig">重置 Supabase 配置</button>
        <p class="text-xs muted-2 mt-sm">重置后将返回登录页重新填写 Supabase URL 和 Key</p>
      </div>
    `;
    $("btnResetConfig").addEventListener("click", async () => {
      const ok = await confirm("确定重置配置？需要重新填写 Supabase 信息并登录。");
      if (!ok) return;
      localStorage.removeItem("workbench-config-v1");
      location.reload();
    });
  }

  function statusText(s) {
    return { active: "在线", warning: "待检测", inactive: "未绑定" }[s] || s;
  }

  return { render };
})();

window.Settings = Settings;
