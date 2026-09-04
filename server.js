#!/usr/bin/env node
/**
 * workbench 服务端入口（零第三方依赖，仅 Node 内置 http）
 * 复用 Vercel Serverless 版 AI 代理 handler（api/ai/generate.js / api/ai/stream.js），
 * 供 Nginx 同域反代 /api/ 使用。密钥由 systemd EnvironmentFile 注入（process.env）。
 *
 * 监听：127.0.0.1:3790（HOST/PORT 可覆盖，避开灵序 3789）
 * 路由：/healthz、/  → 健康检查；/api/ai/generate、/api/ai/stream → 代理；其余 404。
 */

const http = require("http");
const generate = require("./api/ai/generate");
const stream = require("./api/ai/stream");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3790;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");

    // 健康检查（Nginx 探活用）
    if (url.pathname === "/" || url.pathname === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, name: "workbench-api", ts: Date.now() }));
      return;
    }

    // AI 代理：直接转交现有 handler（它们自管 OPTIONS / method / 鉴权 / body / 上游调用）
    if (url.pathname === "/api/ai/generate") return generate(req, res);
    if (url.pathname === "/api/ai/stream") return stream(req, res);

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: e.message || "internal error" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[workbench-api] listening on ${HOST}:${PORT}`);
});