/**
 * 平台单一注册表
 * ============================================================
 * 八大平台的 key / 中文名 / 主页地址 / 发布页地址 / 品牌色 / 图标 / CSV 别名
 * 只在这里定义一次。
 *
 * 此前这些事实散落在 12 个模块（app / calendar / settings / content / metrics /
 * topics / rules / assets / keywords / templates / hot-radar / video-script）
 * 的 20 余处里各写一份，键集还不一致，造成过这些实际缺陷：
 *   - 数据复盘 CSV 导入只认识 4 个平台，把视频号/快手/微博/今日头条判为
 *     「平台无效」而丢行；
 *   - 标题生成的平台名映射只有 4 个平台，其余平台传给 AI 的是 undefined；
 *   - 标题生成与 A/B 测试的平台下拉只列了 4 个平台；
 *   - styles.css 的 .alert-<key> 只有 4 个，其余平台告警 chip 没有配色。
 *
 * 约定：
 *   key         数据库与 CSS 变量使用的标准键（styles.css 里为 --xhs 等）
 *   name        界面显示的中文名
 *   home        创作者后台主页（仪表盘卡片点击跳转）
 *   publishUrl  内容发布页（日历「去发布」跳转）
 *   color       图表/Canvas 等着色场景用的品牌色十六进制值
 *   icon        报告与列表用的平台图标
 *   aliases     CSV / 外部数据源可能出现的写法，keyOf() 归一化到 key
 *
 * 注：color 与 styles.css 的 --<key> 变量是两份数据，因为 Canvas 读不到 CSS 变量；
 *     抖音这里取霓虹强调色 #25f4ee 而非 CSS 的近黑 #161823，否则柱状图看不见。
 *
 * 新增平台要改两处：这里加一条 LIST，styles.css 补 --<key> 与
 * .platform-card/.platform-tab/.cal-item/.alert- 四组 <key> 类。
 */

WB.define("Platforms", [], () => {
  const LIST = [
    {
      key: "xhs",
      name: "小红书",
      color: "#ff2442",
      icon: "📕",
      home: "https://creator.xiaohongshu.com",
      publishUrl: "https://creator.xiaohongshu.com/publish/publish",
      aliases: ["xhs", "小红书", "rednote"],
    },
    {
      key: "douyin",
      name: "抖音",
      color: "#25f4ee",
      icon: "🎵",
      home: "https://creator.douyin.com",
      publishUrl: "https://creator.douyin.com/creator-micro/content/upload",
      aliases: ["douyin", "抖音", "tiktok"],
    },
    {
      key: "bilibili",
      name: "B站",
      color: "#fb7299",
      icon: "📺",
      home: "https://member.bilibili.com",
      publishUrl: "https://member.bilibili.com/platform/upload/text/edit",
      aliases: ["bilibili", "b站", "bzhan", "哔哩哔哩"],
    },
    {
      key: "wechat",
      name: "公众号",
      color: "#07c160",
      icon: "💬",
      home: "https://mp.weixin.qq.com",
      publishUrl: "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=add&type=10",
      aliases: ["wechat", "公众号", "微信", "weixin"],
    },
    // 以下四平台暂无独立创作者主页，home 与 publishUrl 同址
    {
      key: "shipinhao",
      name: "视频号",
      color: "#fa9d3b",
      icon: "▶️",
      home: "https://channels.weixin.qq.com/platform/post/create",
      publishUrl: "https://channels.weixin.qq.com/platform/post/create",
      aliases: ["shipinhao", "视频号", "微信视频号", "channels"],
    },
    {
      key: "kuaishou",
      name: "快手",
      color: "#ff6900",
      icon: "📱",
      home: "https://cp.kuaishou.com/article/publish",
      publishUrl: "https://cp.kuaishou.com/article/publish",
      aliases: ["kuaishou", "快手"],
    },
    {
      key: "weibo",
      name: "微博",
      color: "#e6162d",
      icon: "🧣",
      home: "https://weibo.com/compose/newwrite",
      publishUrl: "https://weibo.com/compose/newwrite",
      aliases: ["weibo", "微博"],
    },
    {
      key: "toutiao",
      name: "今日头条",
      color: "#f04142",
      icon: "📰",
      home: "https://mp.toutiao.com/profile_v4/graphic/publish",
      publishUrl: "https://mp.toutiao.com/profile_v4/graphic/publish",
      aliases: ["toutiao", "今日头条", "头条"],
    },
  ];

  // 「通用」是筛选/归属选项，不是平台，因此不进入 keyOf 的归一化目标
  const ALL_KEY = "all";
  const ALL_NAME = "通用";

  const BY_TOKEN = {};
  LIST.forEach((p) => {
    BY_TOKEN[p.key] = p;
    p.aliases.forEach((a) => { BY_TOKEN[a.toLowerCase()] = p; });
  });

  /** 任意写法（中文名 / key / CSV 别名 / 大小写混写）→ 标准 key，识别不了返回 null */
  function keyOf(input) {
    if (input === null || input === undefined) return null;
    const hit = BY_TOKEN[String(input).trim().toLowerCase()];
    return hit ? hit.key : null;
  }

  function entry(key) {
    return BY_TOKEN[String(key || "").trim().toLowerCase()] || null;
  }

  function name(key) {
    const hit = entry(key);
    return hit ? hit.name : (key || "");
  }

  /** 图表/Canvas 着色用；识别不了返回 fallback（默认工作台主色） */
  function color(key, fallback = "#59c4ff") {
    const hit = entry(key);
    return hit ? hit.color : fallback;
  }

  /** 平台图标；识别不了回落到通用符号 */
  function icon(key, fallback = "📌") {
    const hit = entry(key);
    return hit ? hit.icon : fallback;
  }

  /** { key: { name, url } } —— url 取 home 或 publishUrl，供下拉/卡片渲染 */
  function indexed(urlField) {
    const out = {};
    LIST.forEach((p) => { out[p.key] = { name: p.name, url: p[urlField] }; });
    return out;
  }

  /**
   * { key: 中文名 }
   * @param {boolean} withAll 追加「通用/全域」筛选项（保持在末尾）
   * @param {string} allName 该筛选项的文案，各模块历史上不一致（通用 / 全域）
   */
  function labels(withAll, allName = ALL_NAME) {
    const out = {};
    LIST.forEach((p) => { out[p.key] = p.name; });
    if (withAll) out[ALL_KEY] = allName;
    return out;
  }

  /**
   * [{ key, label }] —— 供 <select> 渲染
   * @param {boolean} withAll 追加「通用/全域」项（放在首位，与这些模块重构前的顺序一致）
   */
  function options(withAll, allName = ALL_NAME) {
    const out = LIST.map((p) => ({ key: p.key, label: p.name }));
    if (withAll) out.unshift({ key: ALL_KEY, label: allName });
    return out;
  }

  /** 在各平台标准字段之上合并模块自己的配置（如内容编辑器的字段/字数上限） */
  function decorate(extraByKey) {
    const out = {};
    LIST.forEach((p) => { out[p.key] = { name: p.name, ...(extraByKey[p.key] || {}) }; });
    return out;
  }

  return {
    LIST,
    KEYS: LIST.map((p) => p.key),
    ALL_KEY,
    ALL_NAME,
    keyOf,
    entry,
    name,
    color,
    icon,
    indexed,
    labels,
    options,
    decorate,
  };
});
