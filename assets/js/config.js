/**
 * 全局配置管理
 * 负责 Supabase 连接信息 + 当前用户会话
 * 注册为 WB 模块，模块名为 'WorkbenchConfig'
 */
WB.define("WorkbenchConfig", () => {
  const CFG_KEY = "workbench-config-v1";

  // ===== 内置默认配置（共享 Supabase）=====
  // 把本源应用的 Supabase URL + Anon Key 内置在这里，
  // 朋友打开即用、无需手填。Anon Key 本就是可公开的匿名密钥，
  // 数据安全靠「各自注册账号登录 + RLS 行级隔离」保证。
  // 如需换共享库 / 在自己的项目上二次分发，改这里即可。
  const BUILT_IN = {
    supabaseUrl: "https://otyridsyurknrjnzloln.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eXJpZHN5dXJrbnJqbnpsb2xuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Mzg1MjksImV4cCI6MjEwMjIxNDUyOX0.aEiC8HmGCU62XZsX3pYe445uzrcRhLDvH65TE8R5EsU",
  };

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      // 用户从未填过（或清空）→ 回退到内置默认，保证开箱即用
      if (!saved.supabaseUrl || !saved.supabaseAnonKey) {
        return { ...BUILT_IN };
      }
      return saved;
    } catch {
      return { ...BUILT_IN };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    // N4 修复：配置变更时清除缓存的 client 和用户，避免用旧连接
    _supabaseClient = null;
    _currentUser = null;
  }

  function getSupabaseConfig() {
    const cfg = loadConfig();
    return {
      url: cfg.supabaseUrl || "",
      anonKey: cfg.supabaseAnonKey || "",
    };
  }

  function isConfigured() {
    const { url, anonKey } = getSupabaseConfig();
    return !!(url && anonKey);
  }

  // 全局 Supabase 客户端（懒加载）
  let _supabaseClient = null;

  function getSupabase() {
    if (_supabaseClient) return _supabaseClient;
    if (!isConfigured()) return null;
    const { url, anonKey } = getSupabaseConfig();
    _supabaseClient = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return _supabaseClient;
  }

  // 当前用户缓存
  let _currentUser = null;

  async function getCurrentUser() {
    if (_currentUser) return _currentUser;
    const client = getSupabase();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    _currentUser = data.user;
    return _currentUser;
  }

  function clearCurrentUser() {
    _currentUser = null;
  }

  return {
    loadConfig,
    saveConfig,
    getSupabaseConfig,
    isConfigured,
    getSupabase,
    getCurrentUser,
    clearCurrentUser,
  };
});