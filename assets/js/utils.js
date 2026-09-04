/**
 * 公共工具函数
 * 注册为 WB 模块，模块名为 'utils'。
 * 为兼容既有模块的裸函数调用（escapeHtml() 等），工厂返回
 * 对象会同步暴露到 window 顶层；新代码统一通过 WB.get('utils') 获取。
 */
WB.define("utils", () => {
  const $ = (id) => document.getElementById(id);

  // HTML 转义
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 属性转义（仅适用于双引号属性上下文，复用 escapeHtml 即可）
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // 日期格式化
  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + " 天前";
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function formatDateTimeLocal(date) {
    const d = new Date(date);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  }

  // 尝试解析 JSON（容错：提取字符串中的 JSON 片段）
  function tryParseJson(text) {
    if (!text) return null;
    // 直接尝试
    try { return JSON.parse(text); } catch {}
    // 提取 ```json ... ``` 代码块
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      try { return JSON.parse(codeBlock[1].trim()); } catch {}
    }
    // 提取第一个 { ... } 块
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
    return null;
  }

  // ========== 模态框 ==========
  let _escListener = null;

  function showModal(htmlContent) {
    closeModal();
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.id = "modalMask";
    mask.innerHTML = `<div class="modal">${htmlContent}</div>`;
    document.body.appendChild(mask);

    // 点击遮罩关闭
    mask.addEventListener("click", (e) => {
      if (e.target === mask || e.target.dataset.close !== undefined || e.target.closest("[data-close]")) {
        closeModal();
      }
    });

    // ESC 关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function closeModal() {
    const mask = $("modalMask");
    if (mask) mask.remove();
  }

  // 异步 confirm（用模态框替代原生，返回 Promise<boolean>）
  function confirmDialog(message) {
    return new Promise((resolve) => {
      showModal(`
        <div class="modal-head">
          <h3>确认操作</h3>
          <button class="modal-close" data-close>×</button>
        </div>
        <p class="text-sm" style="margin: 0 0 20px; line-height:1.6;">${escapeHtml(message)}</p>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="btnConfirmCancel">取消</button>
          <button class="btn btn-primary" id="btnConfirmOk">确定</button>
        </div>
      `);
      const done = (val) => {
        closeModal();
        resolve(val);
      };
      $("btnConfirmOk").addEventListener("click", () => done(true));
      $("btnConfirmCancel").addEventListener("click", () => done(false));
      // 遮罩点击/ESC/X → 取消
      const mask = $("modalMask");
      if (mask) {
        mask.addEventListener("click", (e) => {
          if (e.target === mask || e.target.dataset.close !== undefined || e.target.closest("[data-close]")) {
            done(false);
          }
        }, { once: false });
      }
    });
  }

  const util = {
    $,
    escapeHtml,
    escapeAttr,
    formatDate,
    formatDateTime,
    formatDateTimeLocal,
    tryParseJson,
    showModal,
    closeModal,
    confirmDialog,
  };

  // 兼容：暴露到 window 顶层供既有裸函数调用（escapeHtml 等）
  Object.keys(util).forEach((k) => {
    if (!(k in window)) window[k] = util[k];
  });

  // 覆盖原生 confirm 为异步模态框版本（注意：返回 Promise）
  if (!("__workbenchConfirm" in window)) {
    window.confirm = confirmDialog;
    window.__workbenchConfirm = true;
  }

  return util;
});

// 立即实例化，确保其余模块引用的全局工具函数可用
// （WB.get 会懒实例化，但这里显式触发一次以尽快暴露全局兼容层）
WB.get("utils");