/**
 * 单次生成 · POST /api/ai/generate
 * Vercel Serverless Function (Node.js)
 * 支持多提供商（DeepSeek/智谱AI/Kimi/自定义）+ 自动故障转移
 * 环境变量优先级：DEEPSEEK_*（兼容旧版） → ZHIPU_* → MOONSHOT_*
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

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

/**
 * 收集所有已配置的提供商（按优先级排序）
 */
function getProviders() {
  const list = [];

  // 1. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    list.push({
      name: "DeepSeek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, ""),
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      reasonerModel: process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner",
    });
  }

  // 2. 智谱 AI
  if (process.env.ZHIPU_API_KEY) {
    list.push({
      name: "智谱AI",
      apiKey: process.env.ZHIPU_API_KEY,
      baseUrl: (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, ""),
      model: process.env.ZHIPU_MODEL || "glm-4-plus",
      reasonerModel: process.env.ZHIPU_REASONER_MODEL || "glm-4-plus",
    });
  }

  // 3. 月之暗面 Kimi
  if (process.env.MOONSHOT_API_KEY) {
    list.push({
      name: "Kimi",
      apiKey: process.env.MOONSHOT_API_KEY,
      baseUrl: (process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, ""),
      model: process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
      reasonerModel: process.env.MOONSHOT_REASONER_MODEL || "moonshot-v1-8k",
    });
  }

  // 4. 自定义
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
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
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

/**
 * 调用单个提供商
 */
async function callProvider(provider, prompt, system, useReasoner, temperature, maxTokens) {
  const model = useReasoner ? provider.reasonerModel : provider.model;
  const reqBody = {
    model,
    messages: buildMessages(prompt, system),
    stream: false,
    temperature: temperature != null ? temperature : 0.7,
    max_tokens: maxTokens != null ? maxTokens : 2048,
  };

  const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(reqBody),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`${provider.name} ${model} ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return { content, usage: data.usage || null, provider: provider.name };
}

module.exports = async (req, res) => {
  // CORS 预检
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
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

  // 解析请求体
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

  const providers = getProviders();
  if (providers.length === 0) {
    return sendJson(res, { error: "服务端未配置任何 AI 提供商的环境变量（DEEPSEEK_API_KEY / ZHIPU_API_KEY 等）" }, 500);
  }

  // 逐个尝试，故障转移
  const errors = [];
  for (const p of providers) {
    try {
      const result = await callProvider(p, prompt, system, useReasoner, temperature, maxTokens);
      return sendJson(res, { content: result.content, usage: result.usage, provider: result.provider });
    } catch (e) {
      errors.push(e.message);
      // 继续尝试下一个
    }
  }

  return sendJson(res, { error: `所有提供商均失败: ${errors.join(" | ")}` }, 502);
};
