/**
 * 全局配置管理
 * 负责 Supabase 连接信息 + 当前用户会话
 * 注册为 WB 模块，模块名为 'WorkbenchConfig'
 */
WB.define("WorkbenchConfig", () => {
  const CFG_KEY = "workbench-config-v1";

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
    } catch {
      return {};
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