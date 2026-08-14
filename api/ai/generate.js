/**
 * 单次生成 · POST /api/ai/generate
 * Vercel Serverless Function (Node.js)
 * 内联所有依赖，避免跨文件 import 问题
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function getConfig(useReasoner) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = useReasoner
    ? process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner"
    : process.env.DEEPSEEK_MODEL || "deepseek-chat";
  return { apiKey, baseUrl, model };
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

  const cfg = getConfig(useReasoner);
  if (!cfg) {
    return sendJson(res, { error: "DEEPSEEK_API_KEY 未配置" }, 500);
  }

  const reqBody = {
    model: cfg.model,
    messages: buildMessages(prompt, system),
    stream: false,
    temperature: temperature != null ? temperature : 0.7,
    max_tokens: maxTokens != null ? maxTokens : 2048,
  };

  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return sendJson(res, { error: `DeepSeek ${resp.status}: ${t.slice(0, 300)}` }, 502);
    }

    const data = await resp.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return sendJson(res, { content, usage: data.usage || null });
  } catch (e) {
    return sendJson(res, { error: e.message || "未知错误" }, 500);
  }
};
