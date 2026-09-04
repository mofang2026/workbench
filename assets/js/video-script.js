/**
 * 视频脚本工场 · 独立模块
 * - AI 生成结构化视频脚本（口播/分镜/BGM/字幕/互动）
 * - 支持短视频/口播/Vlog/教程 4 种脚本类型
 * - 分镜表 + 时长统计 + 导出
 */

WB.define("VideoScript", ["Db", "AiGateway"], (Db, AiGateway) => {
  const VideoScript = (function () {
  const SCRIPT_TYPES = {
    short: { name: "短视频脚本", duration: "30-60s", platforms: ["抖音", "小红书"], desc: "节奏快、前3秒抓人、强互动结尾" },
    oral: { name: "口播视频脚本", duration: "2-5min", platforms: ["抖音", "B站", "公众号"], desc: "信息密度高、逻辑清晰、金句穿插" },
    vlog: { name: "Vlog 脚本", duration: "3-8min", platforms: ["B站", "小红书"], desc: "生活记录、多场景切换、情绪递进" },
    tutorial: { name: "教程脚本", duration: "5-15min", platforms: ["B站", "公众号"], desc: "步骤清晰、操作演示、重点标注" },
  };

  let currentScript = null;
  let scriptsCache = [];

  async function render() {
    const wrap = $("page-video-script");
    wrap.innerHTML = `
      <div class="hero">
        <p class="eyebrow muted-2 text-xs">VIDEO · 视频脚本工场</p>
        <h1>视频脚本工场</h1>
        <p class="sub">AI 生成结构化脚本 · 分镜表 · 时长统计 · 一键导出</p>
      </div>

      <div class="card mb-md">
        <div class="toolbar">
          <input id="vsSearch" class="input" placeholder="搜索脚本标题..." style="flex:1; min-width:200px;" />
          <button class="btn btn-primary" id="btnVsNew">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            AI 生成脚本
          </button>
        </div>
        <div id="vsList"></div>
      </div>
    `;

    $("btnVsNew").addEventListener("click", openGenModal);
    $("vsSearch").addEventListener("input", (e) => renderList(e.target.value));
    await loadList();
  }

  async function loadList() {
    try {
      scriptsCache = await Db.list("video_scripts", {
        select: "id, title, type, duration, platform, shots, created_at, updated_at",
        order: { col: "updated_at", ascending: false },
        limit: 100,
      });
    } catch (e) {
      // 表可能不存在，降级为空
      scriptsCache = [];
    }
    renderList("");
  }

  function renderList(keyword) {
    const kw = (keyword || "").toLowerCase();
    const list = scriptsCache.filter(s => !kw || (s.title || "").toLowerCase().includes(kw));
    const wrap = $("vsList");
    if (list.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="em-icon">🎬</div><div>暂无脚本，点击「AI 生成脚本」创建</div></div>`;
      return;
    }
    wrap.innerHTML = list.map(s => {
      const typeInfo = SCRIPT_TYPES[s.type] || { name: s.type };
      const shotCount = s.shots ? (Array.isArray(s.shots) ? s.shots.length : 0) : 0;
      return `
        <div class="list-item" data-id="${s.id}">
          <div class="list-item-head">
            <div class="list-item-title">${escapeHtml(s.title || "无标题")}</div>
            <span class="tag">${typeInfo.name}</span>
          </div>
          <div class="list-item-meta">
            <span>⏱ ${s.duration || typeInfo.duration}</span>
            <span>🎬 ${shotCount} 个分镜</span>
            ${s.platform ? `<span>📱 ${escapeHtml(s.platform)}</span>` : ""}
            <span>· ${formatDate(s.updated_at)}</span>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-ghost btn-sm" data-view="${s.id}">查看</button>
            <button class="btn btn-ghost btn-sm" data-export="${s.id}">导出</button>
            <button class="btn btn-ghost btn-sm text-danger" data-del="${s.id}">删除</button>
          </div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => viewScript(el.dataset.view)));
    wrap.querySelectorAll("[data-export]").forEach(el => el.addEventListener("click", () => exportScript(el.dataset.export)));
    wrap.querySelectorAll("[data-del]").forEach(el => el.addEventListener("click", () => deleteScript(el.dataset.del)));
  }

  function openGenModal() {
    showModal(`
      <div class="modal-head">
        <h3>AI 生成视频脚本</h3>
        <button class="modal-close" data-close>×</button>
      </div>

      <div class="field">
        <label class="field-label">脚本类型 *</label>
        <div class="vs-type-grid">
          ${Object.entries(SCRIPT_TYPES).map(([k, t]) => `
            <label class="vs-type-card">
              <input type="radio" name="vsType" value="${k}" ${k === "short" ? "checked" : ""} />
              <div class="vs-type-name">${t.name}</div>
              <div class="text-xs muted">${t.duration}</div>
              <div class="text-xs muted-2 mt-xs">${t.desc}</div>
              <div class="text-xs muted-2 mt-xs">适合：${t.platforms.join(" / ")}</div>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">主题/选题 *</label>
          <input id="vsTopic" class="input" placeholder="如：如何高效管理时间" />
        </div>
        <div class="field">
          <label class="field-label">目标平台</label>
          <select id="vsPlatform" class="select">
            <option value="抖音">抖音</option>
            <option value="小红书">小红书</option>
            <option value="B站">B站</option>
            <option value="公众号">公众号</option>
            <option value="视频号">视频号</option>
            <option value="快手">快手</option>
            <option value="微博">微博</option>
            <option value="今日头条">今日头条</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label class="field-label">核心观点/要点（可选）</label>
        <textarea id="vsPoints" class="textarea" rows="3" placeholder="每行一个要点，AI 会按要点展开分镜"></textarea>
      </div>

      <div class="grid grid-2">
        <div class="field">
          <label class="field-label">目标时长</label>
          <select id="vsDuration" class="select">
            <option value="30s">30 秒</option>
            <option value="60s" selected>60 秒</option>
            <option value="3min">3 分钟</option>
            <option value="5min">5 分钟</option>
            <option value="10min">10 分钟</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">风格</label>
          <select id="vsStyle" class="select">
            <option value="幽默轻松">幽默轻松</option>
            <option value="干货专业">干货专业</option>
            <option value="情感走心">情感走心</option>
            <option value="激情热血">激情热血</option>
            <option value="理性客观">理性客观</option>
          </select>
        </div>
      </div>

      <div class="row gap-sm mb-md">
        <button class="btn btn-warm" id="btnVsGen">生成脚本</button>
        <span id="vsGenStatus" class="text-xs muted"></span>
      </div>
      <div id="vsGenResult"></div>

      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
      </div>
    `);
    $("btnVsGen").addEventListener("click", doGenerate);
  }

  async function doGenerate() {
    const type = document.querySelector('input[name="vsType"]:checked')?.value;
    const topic = $("vsTopic").value.trim();
    const platform = $("vsPlatform").value;
    const points = $("vsPoints").value.trim();
    const duration = $("vsDuration").value;
    const style = $("vsStyle").value;

    if (!topic) { toast("请填写主题"); return; }

    const typeInfo = SCRIPT_TYPES[type];
    const status = $("vsGenStatus");
    const result = $("vsGenResult");
    const btn = $("btnVsGen");

    btn.disabled = true;
    status.innerHTML = '<span class="ai-thinking"><span class="spinner"></span> AI 正在生成结构化脚本...</span>';
    result.innerHTML = "";

    try {
      const prompt = `你是专业视频脚本编剧。请生成一个${typeInfo.name}。\n\n主题：${topic}\n平台：${platform}\n目标时长：${duration}\n风格：${style}\n核心要点：${points || "由你自行规划"}\n\n要求：\n1. 严格按分镜表结构输出，每个分镜包含：序号、时长（秒）、画面描述、口播文案、字幕、BGM/音效提示\n2. 前3秒必须有强 hook\n3. 口播文案符合${style}风格\n4. 总时长控制在${duration}左右\n5. 结尾有互动引导\n\n严格按以下 JSON 格式输出：\n${JSON.stringify({
        title: "脚本标题",
        type: type,
        duration: duration,
        platform: platform,
        hook: "前3秒hook文案",
        shots: [{ seq: 1, duration_sec: 3, visual: "画面描述", voiceover: "口播文案", subtitle: "字幕", bgm: "BGM提示" }],
        ending: "结尾互动引导",
        summary: "脚本概要",
      }, null, 2)}\n\n只输出 JSON，shots 数组至少包含 5 个分镜。`;

      const text = await AiGateway.generate(prompt, {
        system: "你是专业视频脚本编剧，擅长为不同平台创作结构化视频脚本。",
        maxTokens: 2500,
      });
      const parsed = tryParseJson(text);

      if (!parsed || !parsed.shots || !Array.isArray(parsed.shots)) {
        status.innerHTML = '<span class="text-danger">生成失败，请重试</span>';
        return;
      }

      // 入库
      const saved = await Db.create("video_scripts", {
        title: parsed.title || topic,
        type,
        duration,
        platform,
        hook: parsed.hook || "",
        shots: parsed.shots,
        ending: parsed.ending || "",
        summary: parsed.summary || "",
      });

      status.innerHTML = '<span class="text-ok">✓ 脚本已生成并入库</span>';
      toast("脚本已生成");

      // 直接展示
      currentScript = saved;
      showScriptDetail(saved);
      closeModal();
      await loadList();
    } catch (e) {
      status.innerHTML = `<span class="text-danger">生成失败: ${escapeHtml(e.message)}</span>`;
    } finally {
      btn.disabled = false;
    }
  }

  async function viewScript(id) {
    try {
      const s = await Db.get("video_scripts", id);
      currentScript = s;
      showScriptDetail(s);
    } catch (e) {
      toast("加载失败: " + e.message);
    }
  }

  function showScriptDetail(s) {
    const typeInfo = SCRIPT_TYPES[s.type] || { name: s.type };
    const totalSec = (s.shots || []).reduce((sum, sh) => sum + (parseInt(sh.duration_sec) || 0), 0);

    showModal(`
      <div class="modal-head">
        <h3>${escapeHtml(s.title)}</h3>
        <button class="modal-close" data-close>×</button>
      </div>

      <div class="vs-detail-meta mb-md">
        <span class="tag">${typeInfo.name}</span>
        <span class="text-xs muted">⏱ 目标 ${s.duration} · 实际约 ${totalSec}s</span>
        <span class="text-xs muted">📱 ${escapeHtml(s.platform || "")}</span>
      </div>

      ${s.hook ? `
        <div class="vs-hook-box mb-md">
          <span class="text-xs muted">🔥 前 3 秒 Hook</span>
          <p class="vs-hook-text">${escapeHtml(s.hook)}</p>
        </div>
      ` : ""}

      <div class="vs-shots-head mb-sm">
        <span class="text-sm" style="font-weight:600;">分镜表（${(s.shots || []).length} 个分镜）</span>
        <button class="btn btn-ghost btn-sm" id="btnVsExportShot">导出脚本</button>
      </div>
      <div class="vs-shots-table">
        ${(s.shots || []).map(sh => `
          <div class="vs-shot-row">
            <div class="vs-shot-seq">${sh.seq || ""}</div>
            <div class="vs-shot-content">
              <div class="vs-shot-row-meta">
                <span class="tag" style="color:var(--brand); border-color:var(--brand);">${sh.duration_sec || 0}s</span>
              </div>
              <div class="vs-shot-visual"><span class="text-xs muted">🎬 画面：</span>${escapeHtml(sh.visual || "")}</div>
              <div class="vs-shot-voice"><span class="text-xs muted">🎙 口播：</span>${escapeHtml(sh.voiceover || "")}</div>
              ${sh.subtitle ? `<div class="vs-shot-sub"><span class="text-xs muted">📝 字幕：</span>${escapeHtml(sh.subtitle)}</div>` : ""}
              ${sh.bgm ? `<div class="vs-shot-bgm"><span class="text-xs muted">🎵 音效：</span>${escapeHtml(sh.bgm)}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>

      ${s.ending ? `
        <div class="vs-ending-box mt-md">
          <span class="text-xs muted">📌 结尾引导</span>
          <p>${escapeHtml(s.ending)}</p>
        </div>
      ` : ""}

      ${s.summary ? `
        <div class="field mt-md">
          <label class="field-label">脚本概要</label>
          <p class="text-sm muted">${escapeHtml(s.summary)}</p>
        </div>
      ` : ""}

      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>关闭</button>
        <button class="btn btn-primary" id="btnVsExport2">导出完整脚本</button>
      </div>
    `);

    $("btnVsExport2").addEventListener("click", () => exportScriptData(s));
    $("btnVsExportShot")?.addEventListener("click", () => exportScriptData(s));
  }

  function exportScriptData(s) {
    const typeInfo = SCRIPT_TYPES[s.type] || { name: s.type };
    const totalSec = (s.shots || []).reduce((sum, sh) => sum + (parseInt(sh.duration_sec) || 0), 0);
    let text = `# ${s.title}\n\n`;
    text += `类型：${typeInfo.name}\n平台：${s.platform}\n目标时长：${s.duration}（实际约 ${totalSec}s）\n\n`;
    if (s.hook) text += `## 🔥 前3秒 Hook\n${s.hook}\n\n`;
    text += `## 分镜表\n\n`;
    (s.shots || []).forEach(sh => {
      text += `### 分镜 ${sh.seq || ""}（${sh.duration_sec || 0}s）\n`;
      text += `- 画面：${sh.visual || ""}\n`;
      text += `- 口播：${sh.voiceover || ""}\n`;
      if (sh.subtitle) text += `- 字幕：${sh.subtitle}\n`;
      if (sh.bgm) text += `- 音效：${sh.bgm}\n`;
      text += `\n`;
    });
    if (s.ending) text += `## 结尾引导\n${s.ending}\n`;
    if (s.summary) text += `\n## 概要\n${s.summary}\n`;

    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(s.title || "视频脚本").replace(/[\\/:*?"<>|]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出 Markdown 脚本");
  }

  async function exportScript(id) {
    try {
      const s = await Db.get("video_scripts", id);
      exportScriptData(s);
    } catch (e) {
      toast("导出失败: " + e.message);
    }
  }

  async function deleteScript(id) {
    const ok = await confirm("确定删除该脚本？");
    if (!ok) return;
    try {
      await Db.remove("video_scripts", id);
      toast("已删除");
      await loadList();
    } catch (e) {
      toast("删除失败: " + e.message);
    }
  }

  return { render };
  })();
  return VideoScript;
});
