/**
 * Agent · 工具调用循环（function calling）
 * ============================================================
 * 1. 工具注册：把 WB 模块包成 OpenAI 兼容的 tools schema
 * 2. 循环：messages → 模型 → 有 tool_calls 就执行并回填 → 再问 → 直到 finish
 * 3. Skill：固定工作流注册成「复合工具」，内部按序调多个基础工具
 *
 * 依赖 AiGateway.sendMessages / streamMessages（完整 messages 数组 + tools），
 * generate/stream 的扁平签名承载不了多轮，所以不要退回它们。
 * 工具全部只读：写库能力刻意不暴露给模型，需要落库由用户在界面上确认。
 */
WB.define("Agent", ["AiGateway", "Db"], (AiGateway, Db) => {
  const MAX_TURNS = 6;

  /** 可被模型查询的表；不在表内的直接拒绝，避免变成任意 SQL 读口
   *  列名与 supabase/schema.sql 真实结构严格一致，模型过滤/排序只能用它 */
  const READABLE_TABLES = {
    topics: ["id", "title", "platform", "track", "status", "is_hot", "source", "priority", "created_at"],
    contents: ["id", "title", "topic_id", "status", "tags", "priority", "created_at"],
    schedules: ["id", "content_id", "account_id", "platform", "scheduled_at", "actual_published_at", "publish_url", "reminder_sent", "created_at"],
    assets: ["id", "type", "title", "url", "tags", "platform", "created_at"],
    metrics: ["id", "content_id", "platform", "views", "likes", "favorites", "comments", "shares", "followers_gained", "recorded_at"],
    keywords: ["id", "word", "category", "platform", "track", "hot_score", "status", "created_at"],
  };
  const TABLE_COLS_JSON = JSON.stringify(READABLE_TABLES);

  const tools = new Map();

  function register(name, schema, run) {
    tools.set(name, { schema, run });
  }

  function toolDefs() {
    return [...tools.entries()].map(([name, t]) => ({ type: "function", function: { name, ...t.schema } }));
  }

  /** 工具返回值进上下文，整行 JSON 会迅速吃光 8k 窗口，所以一律投影 + 截断 */
  function compactRows(rows, cols) {
    return (rows || []).slice(0, 30).map((r) => {
      const o = {};
      for (const c of cols) if (r[c] !== undefined && r[c] !== null && r[c] !== "") o[c] = r[c];
      return o;
    });
  }

  // ===== 基础工具：库的只读视图 =====
  register("db_list", {
    description: "按条件查询工作台数据表，返回精简行。各表可用列（过滤 eq / 排序 order_col 只能用这些列名）：" + TABLE_COLS_JSON,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", enum: Object.keys(READABLE_TABLES) },
        eq: { type: "object", description: "等值过滤，列名必须取自上表可用列；示例 {platform:'xhs', status:'idea'}" },
        order_col: { type: "string", description: "排序列，必须是上表可用列，默认 created_at" },
        ascending: { type: "boolean", default: false },
        limit: { type: "integer", maximum: 50, default: 20 },
      },
      required: ["table"],
    },
  }, async ({ table, eq, order_col, ascending, limit }) => {
    const cols = READABLE_TABLES[table];
    if (!cols) throw new Error(`表 ${table} 不在可读清单内，可用：${Object.keys(READABLE_TABLES).join(", ")}；示例 db_list {table:"topics", eq:{platform:"xhs"}, limit:20}`);
    const rows = await Db.list(table, {
      select: cols.join(","),
      eq: eq || undefined,
      order: { col: order_col || "created_at", ascending: !!ascending },
      limit: Math.min(limit || 20, 50),
    });
    return { table, count: rows.length, rows: compactRows(rows, cols) };
  });

  register("db_get", {
    description: "按 id 取单条记录（含全部字段）",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", enum: Object.keys(READABLE_TABLES) },
        id: { type: "string" },
      },
      required: ["table", "id"],
    },
  }, async ({ table, id }) => {
    if (!READABLE_TABLES[table]) throw new Error(`表 ${table} 不在可读清单内，可用：${Object.keys(READABLE_TABLES).join(", ")}；示例 db_get {table:"contents", id:"<uuid>"}`);
    return { table, row: await Db.get(table, id) };
  });

  register("db_stats", {
    description: "取仪表盘统计（本月发布数、待办、互动率等聚合结果）",
    parameters: { type: "object", properties: {} },
  }, async () => Db.getDashboardStats());

  // ===== Skill：把固定工作流注册成一个复合工具 =====
  /**
   * 与 register 同形：steps 里用 ctx.callTool 复用基础工具，而不是各写一遍查询。
   * @param {string} name 工具名（约定 skill_ 前缀，Chat 页据此填技能下拉）
   * @param {object} schema { description, parameters }
   * @param {Function} steps async (args, ctx) => 结果
   */
  function registerSkill(name, schema, steps) {
    register(name, schema, (args, ctx) => steps(args, ctx));
  }

  const baseCtx = {
    async callTool(name, args) {
      const t = tools.get(name);
      if (!t) throw new Error(`未知工具 ${name}，可用工具：${[...tools.keys()].join(", ")}`);
      return await t.run(args || {}, baseCtx);
    },
  };

  // 示例 skill：选题 → 排期对照，产出可直接落地的本周待办清单
  registerSkill("skill_topic_schedule_gap", {
    description: "对照选题池与内容日历，找出有选题但没排期的缺口，用于本周排期决策",
    parameters: {
      type: "object",
      properties: { platform: { type: "string", description: "只看某平台，可留空" } },
    },
  }, async ({ platform }, ctx) => {
    const eq = platform ? { platform } : undefined;
    const topics = await ctx.callTool("db_list", { table: "topics", eq, limit: 50 });
    const schedules = await ctx.callTool("db_list", { table: "schedules", eq, limit: 50 });
    const planned = new Set((schedules.rows || []).map((s) => s.content_id));
    return {
      选题总数: topics.count,
      已排期: (schedules.rows || []).length,
      未排期选题: (topics.rows || []).filter((t) => !planned.has(t.id)),
    };
  });

  // ===== 循环 =====
  const SYSTEM_PROMPT = [
    "你是全域自媒体工作台的助手，可以调用工具读取用户库里的选题、内容、排期、素材和数据。",
    "回答前先用工具取真实数据，不要凭空编造条目、数量或日期。",
    "工具返回已是精简结果；需要更多明细时再调一次工具，而不是猜测。",
    "用中文、短句、面向执行的口吻回答；结论先行，必要时列要点。",
  ].join("\n");

  async function dispatch(call, onStep) {
    const name = call.function?.name || "";
    const t = tools.get(name);
    let args = {};
    try {
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch (e) {
      return { ok: false, error: `参数不是合法 JSON：${e.message}` };
    }
    if (!t) return { ok: false, error: `未知工具 ${name}，可用工具：${[...tools.keys()].join(", ")}` };
    try {
      const result = await t.run(args, baseCtx);
      const detail = preview(result);
      onStep?.({ name, args, ok: true, summary: summarize(result), preview: detail.text, dropped: detail.dropped });
      return { ok: true, result };
    } catch (e) {
      onStep?.({ name, args, ok: false, error: e.message });
      return { ok: false, error: e.message };
    }
  }

  /** 步骤摘要给 UI 用；工具返回值本身仍按原样回填给模型 */
  function summarize(result) {
    if (!result || typeof result !== "object") return "";
    if (typeof result.table === "string" && typeof result.count === "number") return `${result.table} (${result.count} 行)`;
    if (typeof result.table === "string" && result.row) return `${result.table} 单条`;
    return Object.entries(result)
      .slice(0, 3)
      .map(([k, v]) => `${k} ${Array.isArray(v) ? v.length + " 条" : v}`)
      .join(" · ");
  }

  // 展开区只保留 600 字符，其余记个数：整段 6k+ 的返回落进 store 会把配额吃掉
  const STEP_CHARS = 600;
  function preview(result) {
    const s = typeof result === "string" ? result : JSON.stringify(result, null, 1);
    const text = s || "";
    return { text: text.slice(0, STEP_CHARS), dropped: Math.max(0, text.length - STEP_CHARS) };
  }

  /**
   * @param {string} userText 本轮用户输入
   * @param {object} opts { history, onChunk, onStep, onReason, signal, system }
   *   history：此前的 {role,content} 数组，由调用方（Chat 页）持有
   */
  async function run(userText, opts = {}) {
    const messages = [{ role: "system", content: opts.system || SYSTEM_PROMPT }];
    for (const m of opts.history || []) messages.push(m);
    messages.push({ role: "user", content: userText });

    const steps = [];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const { message } = await AiGateway.streamMessages(messages, {
        tools: toolDefs(),
        onChunk: opts.onChunk,
        onReason: opts.onReason,
        signal: opts.signal,
        maxTokens: opts.maxTokens,
      });
      messages.push(message);

      if (!message.tool_calls || !message.tool_calls.length) {
        return { text: message.content || "", steps, messages: messages.slice(1) };
      }
      for (const call of message.tool_calls) {
        const out = await dispatch(call, (s) => { s.turn = turn + 1; steps.push(s); opts.onStep?.(s); });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(out.ok ? out.result : { error: out.error }),
        });
      }
    }
    throw new Error(`工具调用超过 ${MAX_TURNS} 轮仍未收敛，请缩小问题范围`);
  }

  return {
    register,
    registerSkill,
    toolDefs,
    run,
    SYSTEM_PROMPT,
    READABLE_TABLES,
  };
});
