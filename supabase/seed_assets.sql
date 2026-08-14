-- ============================================================================
-- 全域自媒体工作台 · 素材资源库种子数据
-- 执行位置：Supabase Dashboard → SQL Editor → 粘贴运行
-- 说明：SQL Editor 无登录会话，auth.uid() 返回 NULL，
--       改用 DO 块从 auth.users 自动获取用户 ID 注入
-- ============================================================================

do $$
declare
  v_uid uuid;
begin
  -- 取第一个注册用户（个人工作台通常单用户）
  select id into v_uid from auth.users order by created_at limit 1;
  if v_uid is null then
    raise exception '未找到 auth.users 中的用户，请先在前端注册登录一次';
  end if;

  -- 文案金句（quote）—— 多平台通用爆款文案
  insert into public.assets (user_id, type, title, content, tags, platform, is_favorite)
  values
    (v_uid, 'quote', '成长类金句1', '你不是在低谷，你是在蓄力。所有伟大的故事，都有一个低开高走的开局。', array['成长','励志','低谷'], 'all', true),
    (v_uid, 'quote', '成长类金句2', '别在最该拼搏的年纪，选择安逸。十年后的你会感谢现在拼命的自己。', array['成长','拼搏','青春'], 'all', true),
    (v_uid, 'quote', '职场类金句1', '靠谱的人，事事有回音，件件有着落。这才是一个人最高级的社交名片。', array['职场','靠谱','社交'], 'xhs', true),
    (v_uid, 'quote', '职场类金句2', '真正的高效，不是做了多少事，而是把对的事做到极致。', array['职场','高效','方法论'], 'wechat', false),
    (v_uid, 'quote', '情绪类金句1', '深夜的崩溃，是成年人的必修课。但天亮之后，我们依然要体面地出门。', array['情绪','治愈','深夜'], 'xhs', true),
    (v_uid, 'quote', '情绪类金句2', '允许自己偶尔脆弱，但不要长期软弱。生活不会因为你的眼泪手下留情。', array['情绪','坚强','治愈'], 'douyin', false),
    (v_uid, 'quote', '搞钱类金句1', '副业不是退路，是第二增长曲线。当主业天花板显现，斜杠才是成年人的安全感。', array['副业','搞钱','斜杠'], 'xhs', true),
    (v_uid, 'quote', '搞钱类金句2', '钱不是省出来的，是赚出来的。但赚钱的前提，是先让自己值钱。', array['搞钱','认知','投资自己'], 'all', false),
    (v_uid, 'quote', '育儿类金句1', '最好的教育，不是给孩子铺路，而是教他自己走路。', array['育儿','教育','家庭'], 'xhs', false),
    (v_uid, 'quote', '育儿类金句2', '你对待孩子的方式，就是他未来对待世界的方式。', array['育儿','家庭','榜样'], 'wechat', false),
    (v_uid, 'quote', '科技类金句1', 'AI 不会取代你，但会用 AI 的人会。工具是放大器，认知才是分水岭。', array['AI','科技','认知'], 'bilibili', true),
    (v_uid, 'quote', '科技类金句2', '所有颠覆式创新，最初都看起来像个玩具。别低估任何一个"不正经"的新事物。', array['科技','创新','趋势'], 'all', false),
    (v_uid, 'quote', '生活类金句1', '生活不在别处，就在你认真对待的每个清晨和深夜。', array['生活','治愈','日常'], 'xhs', false),
    (v_uid, 'quote', '生活类金句2', '把日子过成诗不需要钱，需要的是把平凡事做到用心的态度。', array['生活','治愈','态度'], 'all', false),
    (v_uid, 'quote', '爆款开头1', '我花了3年时间才明白，原来这件事的真相这么简单...', array['爆款','开头','钩子'], 'xhs', true),
    (v_uid, 'quote', '爆款开头2', '99%的人都做错了，包括曾经的我。今天把正确方法一次性讲透。', array['爆款','开头','钩子'], 'douyin', true),
    (v_uid, 'quote', '爆款结尾1', '如果这篇内容对你有启发，点赞收藏，我会持续分享实战干货。我们下篇见。', array['爆款','结尾','转化'], 'all', true),
    (v_uid, 'quote', '爆款结尾2', '关注我，带你用最低的成本，过最值钱的人生。', array['爆款','结尾','涨粉'], 'all', false)
  on conflict do nothing;

  -- 封面图模板（cover）—— 使用占位图服务
  insert into public.assets (user_id, type, title, url, tags, platform, is_favorite)
  values
    (v_uid, 'cover', '小红书-大字报封面（粉橙）', 'https://placehold.co/1080x1440/FF2442/ffffff?text=爆款标题', array['小红书','大字报','封面'], 'xhs', true),
    (v_uid, 'cover', '小红书-极简白底封面', 'https://placehold.co/1080x1440/ffffff/333333?text=极简风', array['小红书','极简','封面'], 'xhs', false),
    (v_uid, 'cover', '抖音-竖屏黑底封面', 'https://placehold.co/1080x1920/161823/25F4EE?text=视频封面', array['抖音','竖屏','封面'], 'douyin', false),
    (v_uid, 'cover', 'B站-横版封面（蓝粉）', 'https://placehold.co/1146x717/00A1D6/ffffff?text=B站封面', array['B站','横版','封面'], 'bilibili', false),
    (v_uid, 'cover', '公众号-900横图封面', 'https://placehold.co/900x500/07C160/ffffff?text=公众号封面', array['公众号','横图','封面'], 'wechat', false)
  on conflict do nothing;

  -- 配图（image）—— 通用场景配图
  insert into public.assets (user_id, type, title, url, tags, platform, is_favorite)
  values
    (v_uid, 'image', '职场办公场景配图', 'https://placehold.co/1080x1080/0a1326/59c4ff?text=办公场景', array['职场','办公','场景'], 'all', false),
    (v_uid, 'image', '咖啡书桌氛围图', 'https://placehold.co/1080x1080/6b4226/ffffff?text=咖啡书桌', array['氛围','咖啡','书桌'], 'xhs', true),
    (v_uid, 'image', '城市夜景配图', 'https://placehold.co/1080x1080/0a1326/ffb25a?text=城市夜景', array['夜景','城市','氛围'], 'all', false),
    (v_uid, 'image', '极简文字背景图', 'https://placehold.co/1080x1080/ffffff/999999?text=文字背景', array['极简','背景','文字'], 'all', false)
  on conflict do nothing;

  -- 表情包/贴纸（sticker）
  insert into public.assets (user_id, type, title, content, tags, platform, is_favorite)
  values
    (v_uid, 'sticker', '打工人emo表情包', '我emo了，但还要继续干活', array['打工人','emo','搞笑'], 'all', true),
    (v_uid, 'sticker', '搞钱人设表情包', '搞钱要紧，别的都是浮云', array['搞钱','人设','搞笑'], 'xhs', false),
    (v_uid, 'sticker', '治愈系表情包', '今天也要加油鸭~', array['治愈','可爱','日常'], 'xhs', true)
  on conflict do nothing;

  -- 视频片段（video_clip）—— 通用空镜素材参考
  insert into public.assets (user_id, type, title, url, tags, platform, is_favorite)
  values
    (v_uid, 'video_clip', '城市延时摄影空镜', 'https://www.pexels.com/zh-cn/search/videos/city%20timelapse/', array['空镜','延时','城市'], 'douyin', true),
    (v_uid, 'video_clip', '咖啡制作特写空镜', 'https://www.pexels.com/zh-cn/search/videos/coffee/', array['空镜','咖啡','特写'], 'xhs', false),
    (v_uid, 'video_clip', '办公键盘打字空镜', 'https://www.pexels.com/zh-cn/search/videos/typing/', array['空镜','办公','键盘'], 'all', false)
  on conflict do nothing;

  -- BGM 背景音乐（bgm）
  insert into public.assets (user_id, type, title, url, content, tags, platform, is_favorite)
  values
    (v_uid, 'bgm', '治愈系钢琴BGM', 'https://www.bensound.com/royalty-free-music/track/tomorrow', 'Bensound - Tomorrow（轻柔钢琴，适合治愈类内容）', array['治愈','钢琴','BGM'], 'all', true),
    (v_uid, 'bgm', '励志节奏感BGM', 'https://www.bensound.com/royalty-free-music/track/energy', 'Bensound - Energy（节奏明快，适合拼搏类内容）', array['励志','节奏','BGM'], 'douyin', false),
    (v_uid, 'bgm', '轻快vlog背景乐', 'https://www.bensound.com/royalty-free-music/track/happy-rock', 'Bensound - Happy Rock（轻快活泼，适合日常vlog）', array['vlog','轻快','BGM'], 'xhs', false),
    (v_uid, 'bgm', '悬疑科技感BGM', 'https://www.bensound.com/royalty-free-music/track/sci-fi', 'Bensound - Sci-Fi（科技悬疑，适合AI/科技类）', array['科技','悬疑','BGM'], 'bilibili', false)
  on conflict do nothing;
end$$;

-- ============================================================================
-- 完成。共插入 33 条优质素材，覆盖 6 大类型。
-- ============================================================================
