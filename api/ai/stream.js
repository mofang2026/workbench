/**
 * 流式生成 · POST /api/ai/stream
 * 返回 SSE：data: {"response": "..."}\n\n  data: [DONE]\n\n
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
    stream: true,
    temperature: temperature != null ? temperature : 0.7,
    max_tokens: maxTokens != null ? maxTokens : 2048,
  };

  try {
    const upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!upstream.ok) {
      const t = await upstream.text();
      return sendJson(res, { error: `DeepSeek ${upstream.status}: ${t.slice(0, 200)}` }, 502);
    }

    // 设置 SSE 响应头
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v);
    }

    // 读取上游 SSE 流并转换格式
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop(); // 保留最后不完整的行

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
  } catch (e) {
    if (!res.headersSent) {
      return sendJson(res, { error: e.message || "未知错误" }, 500);
    }
    res.end();
  }
};
