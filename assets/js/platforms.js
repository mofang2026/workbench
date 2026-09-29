/**
 * 平台配置 · 唯一事实来源（WB 模块名 "Platforms"）
 * ------------------------------------------------------------------
 * 所有页面/模块用到的平台 key、显示名、主题色、发布入口、图标，
 * 统一在此定义。新增 / 调整平台只改这里，杜绝各文件各写一份导致的漂移。
 *
 * 约定：
 *   - KEYS      : 八大平台 key 列表（不含 "all"）
 *   - NAMES     : key -> 中文显示名（含 all: "通用"）
 *   - COLORS    : key -> 主题色（hex，用于图表 / tag）
 *   - ICONS     : key -> emoji 图标
 *   - MAP       : key -> { key, name, color, icon, url }（含 all）
 *   - LIST      : 平台对象数组（不含 all）
 *
 * 注意：content.js 内的 rewritePrompt / charLimit 等「平台专属创作参数」
 *       属于内容创作领域的富配置，保留在 content.js，但其平台 key 必须
 *       与本文件的 KEYS 保持一致。
 */
WB.define("Platforms", () => {
  const LIST = [
    { key: "xhs",       name: "小红书",   color: "#ff2442", icon: "📕", url: "https://creator.xiaohongshu.com/publish/publish" },
    { key: "douyin",    name: "抖音",     color: "#25f4ee", icon: "🎵", url: "https://creator.douyin.com/creator-micro/content/upload" },
    { key: "bilibili",  name: "B站",      color: "#fb7299", icon: "📺", url: "https://member.bilibili.com/platform/upload/text/edit" },
    { key: "wechat",    name: "公众号",   color: "#07c160", icon: "💬", url: "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=add&type=10" },
    { key: "shipinhao", name: "视频号",   color: "#fa9d3b", icon: "▶️", url: "https://channels.weixin.qq.com/platform/post/create" },
    { key: "kuaishou",  name: "快手",     color: "#ff6900", icon: "📱", url: "https://cp.kuaishou.com/article/publish" },
    { key: "weibo",     name: "微博",     color: "#e6162d", icon: "🧣", url: "https://weibo.com/compose/newwrite" },
    { key: "toutiao",   name: "今日头条", color: "#f04142", icon: "📰", url: "https://mp.toutiao.com/profile_v4/graphic/publish" },
  ];
  const ALL = { key: "all", name: "通用", color: "#8a93a6", icon: "🌐", url: "" };

  const MAP = {};
  LIST.forEach((p) => (MAP[p.key] = p));
  MAP.all = ALL;

  const NAMES = {};
  LIST.forEach((p) => (NAMES[p.key] = p.name));
  NAMES.all = ALL.name;

  const COLORS = {};
  LIST.forEach((p) => (COLORS[p.key] = p.color));
  COLORS.all = ALL.color;

  const ICONS = {};
  LIST.forEach((p) => (ICONS[p.key] = p.icon));
  ICONS.all = ALL.icon;

  const KEYS = LIST.map((p) => p.key);

  return { LIST, ALL, MAP, NAMES, COLORS, ICONS, KEYS };
});
