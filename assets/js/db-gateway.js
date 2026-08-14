/**
 * DB Gateway · 数据层统一接入
 * 封装 Supabase CRUD，所有页面通过 window.Db 调用
 * 自动注入 user_id，遵循 RLS 策略
 */

const Db = (function () {
  function client() {
    const c = window.WorkbenchConfig.getSupabase();
    if (!c) throw new Error("Supabase 未配置，请先在登录页填写");
    return c;
  }

  async function uid() {
    const u = await window.WorkbenchConfig.getCurrentUser();
    if (!u) throw new Error("未登录");
    return u.id;
  }

  /**
   * 通用列表查询
   * @param {string} table 表名
   * @param {object} opts { select, eq, is, gte, lt, order, limit }
   */
  async function list(table, opts = {}) {
    const c = client();
    let q = c.from(table).select(opts.select || "*");
    if (opts.eq) {
      for (const [col, val] of Object.entries(opts.eq)) {
        q = q.eq(col, val);
      }
    }
    if (opts.is) {
      for (const [col, val] of Object.entries(opts.is)) {
        q = q.is(col, val);
      }
    }
    if (opts.gte) {
      for (const [col, val] of Object.entries(opts.gte)) {
        q = q.gte(col, val);
      }
    }
    if (opts.lt) {
      for (const [col, val] of Object.entries(opts.lt)) {
        q = q.lt(col, val);
      }
    }
    if (opts.order) {
      q = q.order(opts.order.col, { ascending: opts.order.ascending ?? false });
    }
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * 按 ID 数组批量查询（in 查询）
   */
  async function listByIds(table, ids, opts = {}) {
    if (!ids || ids.length === 0) return [];
    const c = client();
    const { data, error } = await c
      .from(table)
      .select(opts.select || "*")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * 单条查询
   */
  async function get(table, id, opts = {}) {
    const c = client();
    const { data, error } = await c
      .from(table)
      .select(opts.select || "*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 新增（自动注入 user_id）
   */
  async function create(table, payload) {
    const c = client();
    const userId = await uid();
    const row = { ...payload, user_id: userId };
    const { data, error } = await c.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 更新
   */
  async function update(table, id, payload) {
    const c = client();
    const { data, error } = await c
      .from(table)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * 删除
   */
  async function remove(table, id) {
    const c = client();
    const { error } = await c.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  }

  /**
   * 批量更新（如修改状态）
   */
  async function updateMany(table, ids, payload) {
    const c = client();
    const { data, error } = await c
      .from(table)
      .update(payload)
      .in("id", ids)
      .select();
    if (error) throw new Error(error.message);
    return data;
  }

  // ========== 业务封装 ==========

  /** 仪表盘统计：本月发布量 */
  async function getDashboardStats() {
    const userId = await uid();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const c = client();

    // 并发查询
    const [accounts, monthContents, todaySchedules, viralMetrics, allMetrics, monthPublishedSchedules] = await Promise.all([
      c.from("accounts").select("*").eq("user_id", userId),
      c.from("contents").select("id, status, created_at").eq("user_id", userId).gte("created_at", monthStart),
      c.from("schedules").select("id, scheduled_at, platform").eq("user_id", userId).gte("scheduled_at", todayStart).lt("scheduled_at", todayEnd),
      c.from("metrics").select("id, views, likes, favorites, comments, shares, is_viral").eq("user_id", userId).eq("is_viral", true),
      c.from("metrics").select("views, likes, favorites, comments, shares").eq("user_id", userId),
      // N1 修复：按平台统计本月已发布数（从 schedules 表 actual_published_at 聚合）
      c.from("schedules").select("id, platform, actual_published_at").eq("user_id", userId).gte("actual_published_at", monthStart),
    ]);

    if (accounts.error) throw new Error(accounts.error.message);
    if (monthContents.error) throw new Error(monthContents.error.message);
    if (todaySchedules.error) throw new Error(todaySchedules.error.message);
    if (viralMetrics.error) throw new Error(viralMetrics.error.message);
    if (allMetrics.error) throw new Error(allMetrics.error.message);
    if (monthPublishedSchedules.error) throw new Error(monthPublishedSchedules.error.message);

    const monthPublished = (monthPublishedSchedules.data || []).length;
    // 按平台聚合本月发布数
    const monthPublishedByPlatform = {};
    (monthPublishedSchedules.data || []).forEach(s => {
      monthPublishedByPlatform[s.platform] = (monthPublishedByPlatform[s.platform] || 0) + 1;
    });
    const todayPending = (todaySchedules.data || []).length;

    // 平均互动率 = (赞+评+藏) / 阅读
    let totalEng = 0, totalViews = 0;
    (allMetrics.data || []).forEach(m => {
      totalEng += (m.likes || 0) + (m.comments || 0) + (m.favorites || 0);
      totalViews += m.views || 0;
    });
    const avgEngagement = totalViews > 0 ? (totalEng / totalViews * 100).toFixed(1) + "%" : "0%";

    return {
      accounts: accounts.data || [],
      monthPublished,
      monthPublishedByPlatform,
      todayPending,
      viralCount: (viralMetrics.data || []).length,
      avgEngagement,
      todaySchedules: todaySchedules.data || [],
    };
  }

  /** 预警：草稿堆积 + 待发布 + 超时未复盘 */
  async function getAlerts() {
    const userId = await uid();
    const c = client();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [drafts, pending, overdueReview] = await Promise.all([
      c.from("contents").select("id, title, updated_at").eq("user_id", userId).eq("status", "draft").lt("updated_at", weekAgo),
      c.from("schedules").select("id, scheduled_at, platform, content_id").eq("user_id", userId).lt("scheduled_at", now.toISOString()).is("actual_published_at", null),
      c.from("contents").select("id, title").eq("user_id", userId).eq("status", "published").order("updated_at", { ascending: false }).limit(50),
    ]);

    return {
      draftStale: drafts.data || [],
      pendingOverdue: pending.data || [],
      needReview: overdueReview.data || [],
    };
  }

  return {
    list,
    listByIds,
    get,
    create,
    update,
    remove,
    updateMany,
    getDashboardStats,
    getAlerts,
  };
})();

window.Db = Db;
