/**
 * 流式生成 · POST /api/ai/stream
 * 返回 SSE：data: {"response": "..."}\n\n  data: [DONE]\n\n
 * Vercel Serverless Function (Node.js)
 * 支持多提供商（DeepSeek/智谱AI/Kimi/自定义）+ 故障转移
 */

function getCorsHeaders() {
  // 生产环境建议设置 ALLOWED_ORIGIN 收窄来源；未设置时回退为 *
  const origin = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
    "Access-Control-Max-Age": "86400",
  };
}

// ---- 简易按 IP 限流（固定窗口，默认 120 次/分钟；RATE_LIMIT_DISABLED=1 关闭）----
const _rateBuckets = new Map();
function rateLimited(ip) {
  if (process.env.RATE_LIMIT_DISABLED === "1") return false;
  const limit = parseInt(process.env.RATE_LIMIT_PER_MIN || "120", 10);
  const now = Date.now();
  const b = _rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    _rateBuckets.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

/**
 * 共享密钥鉴权
 * 前端请求需携带 X-Api-Key 请求头，与服务端环境变量 PROXY_API_SECRET 比对。
 * 未配置 PROXY_API_SECRET 时拒绝请求（fail-closed），防止 API Key 配额被滥用。
 */
function authorize(req) {
  const secret = process.env.PROXY_API_SECRET;
  if (!secret) {
    return { ok: false, code: 503, message: "服务端未配置 PROXY_API_SECRET 环境变量，代理接口已禁用" };
  }
  const provided = req.headers["x-api-key"];
  if (!provided || provided !== secret) {
    return { ok: false, code: 401, message: "Unauthorized: invalid or missing X-Api-Key" };
  }
  return { ok: true };
}

// 前端提供商 key（与 ai-gateway.js 的 PROVIDER_PRESETS 对齐，顺序即构建 env 映射依据）
const PROVIDER_IDS = ["deepseek", "zhipu", "moonshot", "custom"];

/**
 * 按前端偏好解析最终提供商顺序（密钥始终取自服务端环境变量）
 * @param {object} body 请求体（含 providerPrefs：activeProvider/order/failoverEnabled/providers）
 */
function resolveProviders(body) {
  const envList = getProviders();
  const envMap = {};
  PROVIDER_IDS.forEach((id, i) => { if (envList[i]) envMap[id] = envList[i]; });

  const prefs = body && body.providerPrefs;
  if (!prefs || typeof prefs !== "object") {
    return envList;
  }

  const order = Array.isArray(prefs.order) && prefs.order.length
    ? prefs.order
    : (typeof prefs.activeProvider === "string" && prefs.activeProvider
        ? [prefs.activeProvider, ...PROVIDER_IDS.filter((k) => k !== prefs.activeProvider)]
        : PROVIDER_IDS);

  const failover = prefs.failoverEnabled !== false;

  const result = [];
  for (const id of order) {
    const env = envMap[id];
    if (!env) continue;
    const pcfg = (prefs.providers && prefs.providers[id]) || null;
    if (pcfg && pcfg.enabled === false) continue;
    result.push({
      ...env,
      model: pcfg && pcfg.model ? pcfg.model : env.model,
      reasonerModel: pcfg && pcfg.reasonerModel ? pcfg.reasonerModel : env.reasonerModel,
    });
  }

  const final = result.length ? result : envList;
  return failover ? final : final.slice(0, 1);
}

function getProviders() {
  const list = [];
  if (process.env.DEEPSEEK_API_KEY) {
    list.push({
      name: "DeepSeek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, ""),
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      reasonerModel: process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner",
    });
  }
  if (process.env.ZHIPU_API_KEY) {
    list.push({
      name: "智谱AI",
      apiKey: process.env.ZHIPU_API_KEY,
      baseUrl: (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, ""),
      model: process.env.ZHIPU_MODEL || "glm-4-plus",
      reasonerModel: process.env.ZHIPU_REASONER_MODEL || "glm-4-plus",
    });
  }
  if (process.env.MOONSHOT_API_KEY) {
    list.push({
      name: "Kimi",
      apiKey: process.env.MOONSHOT_API_KEY,
      baseUrl: (process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, ""),
      model: process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
      reasonerModel: process.env.MOONSHOT_REASONER_MODEL || "moonshot-v1-8k",
    });
  }
  if (process.env.CUSTOM_AI_API_KEY && process.env.CUSTOM_AI_BASE_URL) {
    list.push({
      name: "自定义AI",
      apiKey: process.env.CUSTOM_AI_API_KEY,
      baseUrl: process.env.CUSTOM_AI_BASE_URL.replace(/\/+$/, ""),
      model: process.env.CUSTOM_AI_MODEL || "gpt-4o-mini",
      reasonerModel: process.env.CUSTOM_AI_REASONER_MODEL || process.env.CUSTOM_AI_MODEL || "gpt-4o-mini",
    });
  }
  return list;
}

function sendJson(res, body, status) {
  res.statusCode = status || 200;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(getCorsHeaders())) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(body));
}

function buildMessages(prompt, system) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(getCorsHeaders())) {
      res.setHeader(k, v);
    }
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return sendJson(res, { error: "Method not allowed" }, 405);
  }

  // 共享密钥鉴权
  const auth = authorize(req);
  if (!auth.ok) {
    return sendJson(res, { error: auth.message }, auth.code);
  }

  const clientIp =
    (req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",")[0].trim()) ||
    req.socket.remoteAddress ||
    "unknown";
  if (rateLimited(clientIp)) {
    return sendJson(res, { error: "请求过于频繁，请稍后再试" }, 429);
  }

  let body;
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    body = {};
  }

  const { prompt, system = "", useReasoner = false, temperature, maxTokens } = body;
  if (!prompt) return sendJson(res, { error: "prompt required" }, 400);

  const providers = resolveProviders(body);
  if (providers.length === 0) {
    return sendJson(res, { error: "服务端未配置任何 AI 提供商的环境变量" }, 500);
  }

  // 流式：在 SSE 开始写入前逐 provider 故障转移（SSE 开始后因单工无法切换，
  // 故仅在拿到首个可用 upstream 之前切换；首个可用 provider 失败则整体失败）
  let lastErr = null;
  for (const provider of providers) {
    const model = useReasoner ? provider.reasonerModel : provider.model;
    const reqBody = {
      model,
      messages: buildMessages(prompt, system),
      stream: true,
      temperature: temperature != null ? temperature : 0.7,
      max_tokens: maxTokens != null ? maxTokens : 2048,
    };

    let upstream;
    try {
      upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(reqBody),
      });
    } catch (e) {
      lastErr = `${provider.name}: ${e.message}`;
      continue; // 网络/连接错误，尝试下一个提供商
    }

    if (!upstream.ok) {
      const t = await upstream.text();
      lastErr = `${provider.name} ${upstream.status}: ${t.slice(0, 200)}`;
      continue; // 该提供商不可用，故障转移
    }

    // 成功拿到可用 upstream，开始 SSE 流式转发
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    for (const [k, v] of Object.entries(getCorsHeaders())) {
      res.setHeader(k, v);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          res.write("data: [DONE]\n\n");
          continue;
        }
        try {
          const obj = JSON.parse(payload);
          const chunk = (obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content) || "";
          if (chunk) {
            res.write(`data: ${JSON.stringify({ response: chunk })}\n\n`);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
    res.end();
    return;
  }

  // 所有 provider 均失败
  if (!res.headersSent) {
    return sendJson(res, { error: `所有提供商均失败: ${lastErr || "未知错误"}` }, 502);
  }
  res.end();
};
