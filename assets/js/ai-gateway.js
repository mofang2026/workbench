/**
 * AI Gateway · 多提供商统一接入层
 * - 支持 DeepSeek、智谱 AI（GLM）、自定义 OpenAI 兼容接口
 * - 直连模式（前端调用） / 代理模式（Vercel Function）
 * - 自动故障转移：主用失败时按顺序尝试备用提供商
 * - 向后兼容：自动迁移旧版单提供商配置
 */

WB.define("AiGateway", [], () => {
  const AI_CFG_KEY = "workbench-ai-settings-v2";

  // 预设提供商模板
  const PROVIDER_PRESETS = {
    deepseek: {
      key: "deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-chat",
      reasonerModel: "deepseek-reasoner",
      enabled: true,
    },
    zhipu: {
      key: "zhipu",
      name: "智谱 AI (GLM)",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "",
      model: "glm-4-plus",
      reasonerModel: "glm-4-plus",
      enabled: false,
    },
    moonshot: {
      key: "moonshot",
      name: "月之暗面 (Kimi)",
      baseUrl: "https://api.moonshot.cn/v1",
      apiKey: "",
      model: "moonshot-v1-8k",
      reasonerModel: "moonshot-v1-8k",
      enabled: false,
    },
    custom: {
      key: "custom",
      name: "自定义 (OpenAI 兼容)",
      baseUrl: "",
      apiKey: "",
      model: "",
      reasonerModel: "",
      enabled: false,
    },
  };

  // 默认故障转移顺序
  const DEFAULT_FAILOVER_ORDER = ["deepseek", "zhipu", "moonshot", "custom"];

  /**
   * 读取配置（含旧版迁移）
   */
  function getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(AI_CFG_KEY) || "{}");
      // 旧版迁移：v1 单提供商配置 → v2 多提供商
      if (s.providers) {
        return {
          mode: s.mode || "direct",
          activeProvider: s.activeProvider || "deepseek",
          providers: s.providers,
          failoverEnabled: s.failoverEnabled !== false,
        };
      }
      // 旧版 v1 迁移
      return migrateFromV1(s);
    } catch {
      return getDefaultSettings();
    }
  }

  // 旧版配置迁移
  function migrateFromV1(old) {
    const OLD_KEY = "workbench-ai-settings-v1";
    try {
      const v1 = old.apiKey ? old : JSON.parse(localStorage.getItem(OLD_KEY) || "{}");
      const providers = JSON.parse(JSON.stringify(PROVIDER_PRESETS));
      if (v1.apiKey || v1.baseUrl) {
        providers.deepseek.apiKey = v1.apiKey || "";
        providers.deepseek.baseUrl = v1.baseUrl || providers.deepseek.baseUrl;
        providers.deepseek.model = v1.model || providers.deepseek.model;
        providers.deepseek.reasonerModel = v1.reasonerModel || providers.deepseek.reasonerModel;
        providers.deepseek.enabled = true;
      }
      return {
        mode: v1.mode || "direct",
        activeProvider: "deepseek",
        providers,
        failoverEnabled: true,
      };
    } catch {
      return getDefaultSettings();
    }
  }

  function getDefaultSettings() {
    return {
      mode: "direct",
      activeProvider: "deepseek",
      providers: JSON.parse(JSON.stringify(PROVIDER_PRESETS)),
      failoverEnabled: true,
    };
  }

  function saveSettings(s) {
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(s));
  }

  /**
   * 获取可用的提供商列表（按故障转移顺序）
   * @returns {Array} 启用且有 apiKey 的提供商
   */
  function getAvailableProviders() {
    const s = getSettings();
    const order = [s.activeProvider, ...DEFAULT_FAILOVER_ORDER.filter(k => k !== s.activeProvider)];
    return order
      .map(k => s.providers[k])
      .filter(p => p && p.enabled && p.apiKey && p.baseUrl);
  }

  /**
   * 单次生成（非流式）· 含自动故障转移
   * @param {string} prompt
   * @param {object} opts { system, useReasoner, temperature, maxTokens }
   */
  async function generate(prompt, opts = {}) {
    const s = getSettings();

    // 代理模式：走 Vercel Function（不故障转移，服务端处理）
    if (s.mode === "proxy" && !isCloudBaseEnv()) {
      return generateViaProxy(prompt, opts);
    }

    // 直连模式：多提供商故障转移
    const providers = getAvailableProviders();
    if (providers.length === 0) {
      throw new Error("未配置可用的 AI 提供商，请在「账号与设置」中配置 API Key");
    }

    const tryList = s.failoverEnabled ? providers : providers.slice(0, 1);
    const errors = [];

    for (const p of tryList) {
      try {
        const model = opts.useReasoner ? p.reasonerModel : p.model;
        return await callChatCompletions(prompt, {
          system: opts.system || "",
          key: p.apiKey,
          baseUrl: p.baseUrl.replace(/\/+$/, ""),
          model,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        });
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
        // 继续尝试下一个提供商
      }
    }

    throw new Error(`所有 AI 提供商均失败 → ${errors.join(" | ")}`);
  }

  /**
   * 代理模式调用
   */
  async function generateViaProxy(prompt, opts = {}) {
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
   * 流式生成（SSE）· 含故障转移
   * @param {string} prompt
   * @param {object} opts { system, onChunk, onDone, onError, useReasoner, signal }
   */
  async function stream(prompt, opts = {}) {
    const s = getSettings();
    const { onChunk, onDone, onError, signal } = opts;

    // 代理模式
    if (s.mode === "proxy" && !isCloudBaseEnv()) {
      return streamViaProxy(prompt, opts);
    }

    // 直连模式：故障转移
    const providers = getAvailableProviders();
    if (providers.length === 0) {
      onError?.("未配置可用的 AI 提供商");
      return;
    }

    const tryList = s.failoverEnabled ? providers : providers.slice(0, 1);
    const errors = [];

    for (let i = 0; i < tryList.length; i++) {
      const p = tryList[i];
      const isLast = i === tryList.length - 1;
      let success = false;

      await streamChatCompletions(prompt, {
        system: opts.system || "",
        key: p.apiKey,
        baseUrl: p.baseUrl.replace(/\/+$/, ""),
        model: opts.useReasoner ? p.reasonerModel : p.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        onChunk: (chunk) => { success = true; onChunk?.(chunk); },
        onDone: () => { success = true; onDone?.(); },
        onError: (msg) => {
          errors.push(`${p.name}: ${msg}`);
          if (isLast) {
            onError?.(`所有 AI 提供商均失败 → ${errors.join(" | ")}`);
          }
          // 否则继续尝试下一个
        },
        signal,
      });

      if (success) return;
      // 未成功则继续下一个提供商
    }
  }

  /**
   * 代理模式流式
   */
  async function streamViaProxy(prompt, opts = {}) {
    const { onChunk, onDone, onError, signal } = opts;
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
   */
  function streamIntoEl(el) {
    return {
      onChunk(chunk) {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          el.value += chunk;
        } else {
          el.textContent += chunk;
        }
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

  /**
   * 检测是否在 CloudBase 环境（无后端函数能力）
   */
  function isCloudBaseEnv() {
    if (typeof window === "undefined") return false;
    return window.location.hostname.includes("tcloudbaseapp.com");
  }

  // ===== 内部：直连 OpenAI 兼容接口（DeepSeek/智谱/Kimi/自定义通用） =====

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
      throw new Error(`${model} ${res.status}: ${t.slice(0, 200)}`);
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
        onError?.(`${model} ${res.status}: ${t.slice(0, 100)}`);
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
    getDefaultSettings,
    getAvailableProviders,
    generate,
    stream,
    streamIntoEl,
    PROVIDER_PRESETS,
  };
});
