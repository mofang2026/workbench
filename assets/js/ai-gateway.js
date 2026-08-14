/**
 * AI Gateway · DeepSeek 统一接入层
 * 前端通过 /api/ai 调用 Vercel Function（DeepSeek 兼容 OpenAI 格式）
 * 本地开发时也可直连 DeepSeek（前端填写 key），生产环境推荐走 Function 代理
 */

const AiGateway = (function () {
  const AI_CFG_KEY = "workbench-ai-settings-v1";

  // 本地开发直连模式（生产推荐走 /api/ai 代理）
  const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
  const DEEPSEEK_MODEL_DEFAULT = "deepseek-chat";

  function getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(AI_CFG_KEY) || "{}");
      return {
        mode: s.mode || "proxy", // proxy | direct
        apiKey: s.apiKey || "",
        baseUrl: (s.baseUrl || DEEPSEEK_BASE_URL).replace(/\/+$/, ""),
        model: s.model || DEEPSEEK_MODEL_DEFAULT,
        reasonerModel: s.reasonerModel || "deepseek-reasoner",
      };
    } catch {
      return { mode: "proxy", apiKey: "", baseUrl: DEEPSEEK_BASE_URL, model: DEEPSEEK_MODEL_DEFAULT, reasonerModel: "deepseek-reasoner" };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(s));
  }

  /**
   * 单次生成（非流式）
   * @param {string} prompt
   * @param {object} opts { system, fast, useReasoner, temperature, maxTokens }
   */
  async function generate(prompt, opts = {}) {
    const s = getSettings();

    // 直连模式
    if (s.mode === "direct" && s.apiKey) {
      const model = opts.useReasoner ? s.reasonerModel : s.model;
      return callChatCompletions(prompt, {
        system: opts.system || "",
        key: s.apiKey,
        baseUrl: s.baseUrl,
        model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
    }

    // 代理模式（推荐，走 Vercel Function）
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        system: opts.system || "",
        useReasoner: opts.useReasoner || false,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI 错误 ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.content || "";
  }

  /**
   * 流式生成（SSE）
   * @param {string} prompt
   * @param {object} opts { system, onChunk, onDone, onError, useReasoner, signal }
   */
  async function stream(prompt, opts = {}) {
    const s = getSettings();
    const { onChunk, onDone, onError, signal } = opts;

    // 直连模式
    if (s.mode === "direct" && s.apiKey) {
      const model = opts.useReasoner ? s.reasonerModel : s.model;
      return streamChatCompletions(prompt, {
        system: opts.system || "",
        key: s.apiKey,
        baseUrl: s.baseUrl,
        model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        onChunk,
        onDone,
        onError,
        signal,
      });
    }

    // 代理模式
    try {
      const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          system: opts.system || "",
          useReasoner: opts.useReasoner || false,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        }),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        onError?.(`连接失败 ${res.status}: ${errText.slice(0, 100)}`);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            onDone?.();
            return;
          }
          try {
            const obj = JSON.parse(payload);
            const chunk = obj.response || obj.content || "";
            if (chunk) onChunk?.(chunk);
          } catch (e) {
            // 忽略解析错误的行
          }
        }
      }
      onDone?.();
    } catch (e) {
      if (e.name === "AbortError") return;
      onError?.(e.message || "未知错误");
    }
  }

  /**
   * 流式写入到 textarea / 元素
   * @returns {object} handler 传给 stream() 的回调
   */
  function streamIntoEl(el) {
    return {
      onChunk(chunk) {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          el.value += chunk;
        } else {
          el.textContent += chunk;
        }
        // 自动滚动到底
        el.scrollTop = el.scrollHeight;
      },
      onDone() {},
      onError(msg) {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          el.value += `\n\n[错误] ${msg}`;
        } else {
          el.textContent += `\n\n[错误] ${msg}`;
        }
      },
    };
  }

  // ===== 内部：直连 DeepSeek（OpenAI 兼容格式） =====

  async function callChatCompletions(prompt, { system, key, baseUrl, model, temperature, maxTokens }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2048,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DeepSeek ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async function streamChatCompletions(prompt, { system, key, baseUrl, model, temperature, maxTokens, onChunk, onDone, onError, signal }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens ?? 2048,
        }),
        signal,
      });
      if (!res.ok) {
        const t = await res.text();
        onError?.(`DeepSeek ${res.status}: ${t.slice(0, 100)}`);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            onDone?.();
            return;
          }
          try {
            const obj = JSON.parse(payload);
            const chunk = obj.choices?.[0]?.delta?.content || "";
            if (chunk) onChunk?.(chunk);
          } catch {}
        }
      }
      onDone?.();
    } catch (e) {
      if (e.name === "AbortError") return;
      onError?.(e.message || "未知错误");
    }
  }

  return {
    getSettings,
    saveSettings,
    generate,
    stream,
    streamIntoEl,
  };
})();

window.AiGateway = AiGateway;
