-- ============================================================================
-- 全域自媒体工作台 · Supabase 建表脚本
-- 执行位置：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. 用户表（如使用 Supabase 内置 auth.users，则无需自建，下面只做关联视图）
--    本表用于扩展用户业务字段
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  role text default 'creator', -- creator | viewer
  created_at timestamptz default now()
);

-- 自动为新注册用户创建 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 1. 平台账号表 (1.2 多平台账号统一管理)
--    降级方案：信息登记 + 状态手动标记（不做 OAuth 真实绑定）
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('xhs','douyin','bilibili','wechat')),
  account_name text not null,          -- 账号昵称
  account_id text,                     -- 平台账号 ID（手动填）
  account_url text,                    -- 主页链接
  group_name text,                     -- 分组
  status text default 'active' check (status in ('active','inactive','warning')),
  -- 平台基础配置（JSON: 默认发布参数、排版模板等）
  config jsonb default '{}'::jsonb,
  last_check_at timestamptz,
  remark text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, platform, account_name)
);

-- ----------------------------------------------------------------------------
-- 2. 选题灵感库 (2.1)
--    状态流转：idea → pending → creating → done → abandoned
-- ----------------------------------------------------------------------------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  platform text check (platform in ('xhs','douyin','bilibili','wechat','all')),
  track text,                          -- 选题赛道
  keywords text[] default '{}',        -- 关键词
  status text default 'idea' check (status in ('idea','pending','creating','done','abandoned')),
  is_hot boolean default false,        -- 是否爆款选题
  source text,                         -- 来源：灵感/对标同行/爆款库
  priority int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 3. 内容创作 (2.2 统一文稿编辑器 + 2.3 AI辅助)
--    一稿多平台：通用原稿 + 四平台独立适配
-- ----------------------------------------------------------------------------
create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,

  -- 通用原稿
  title text,
  body text,                           -- 正文
  outline text,                        -- 内容大纲
  key_points text,                     -- 核心观点
  material_ids uuid[] default '{}',    -- 关联素材 ID

  -- 状态流转 (3.2): 灵感→草稿→创作中→质检完成→待发布→已发布→已复盘
  status text default 'draft' check (status in ('draft','creating','qa_passed','pending_publish','published','reviewed','archived')),

  -- 四平台适配内容（JSON）
  -- 结构: { xhs: {title, body, tags, cover_text, summary}, douyin: {...}, ... }
  adaptations jsonb default '{}'::jsonb,

  -- AI 评分
  ai_score jsonb,                      -- { total, completeness, adaptability, viral_potential }
  ai_checkpassed boolean default false,

  -- 质检快照（哪几个平台自检通过）
  qa_snapshot jsonb default '{}'::jsonb,

  priority int default 0,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_contents_user_status on public.contents(user_id, status);
create index if not exists idx_contents_topic on public.contents(topic_id);

-- ----------------------------------------------------------------------------
-- 4. 发布排期 (3.1 内容日历 + 3.3 发布配置)
--    半自动：发布提醒 + 一键跳转平台
-- ----------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid not null references public.contents(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,

  platform text not null check (platform in ('xhs','douyin','bilibili','wechat')),
  scheduled_at timestamptz not null,   -- 计划发布时间
  actual_published_at timestamptz,     -- 实际发布时间（手动标记）

  -- 发布参数（每平台专属）
  publish_params jsonb default '{}'::jsonb,

  -- 半自动发布：仅提醒 + 跳转链接
  publish_url text,                    -- 平台发布页 URL
  reminder_sent boolean default false,
  remark text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_schedules_user_time on public.schedules(user_id, scheduled_at);

-- ----------------------------------------------------------------------------
-- 5. 素材资源库 (1.3 全局素材资源库)
-- ----------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('cover','image','sticker','video_clip','bgm','quote')),
  title text,
  url text,                            -- 外链或 Supabase Storage 路径
  storage_path text,                   -- 若用 Supabase Storage
  content text,                        -- 文案金句类素材的文本
  tags text[] default '{}',
  platform text check (platform in ('xhs','douyin','bilibili','wechat','all')),
  is_favorite boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_assets_user_type on public.assets(user_id, type);

-- ----------------------------------------------------------------------------
-- 6. 数据复盘 (4.1 单篇数据记录 + 4.2 维度复盘)
--    全手动录入（API 自动抓取放后期）
-- ----------------------------------------------------------------------------
create table if not exists public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid references public.contents(id) on delete set null,
  schedule_id uuid references public.schedules(id) on delete set null,

  platform text not null check (platform in ('xhs','douyin','bilibili','wechat')),

  -- 核心数据
  views int default 0,                 -- 播放/阅读
  likes int default 0,
  favorites int default 0,
  comments int default 0,
  shares int default 0,
  followers_gained int default 0,

  -- 标记
  is_viral boolean default false,      -- 爆款标记
  is_flop boolean default false,       -- 踩坑标记
  review_notes text,                   -- 复盘笔记

  -- 数据快照时间点
  recorded_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_metrics_user_content on public.metrics(content_id);
create index if not exists idx_metrics_user_platform on public.metrics(user_id, platform);

-- ----------------------------------------------------------------------------
-- 7. 模板库 (五、模板体系)
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- null = 系统内置
  name text not null,
  type text not null check (type in ('layout','ending','cta','disclaimer','title_formula','tag_combo')),
  platform text check (platform in ('xhs','douyin','bilibili','wechat','all')),
  content text not null,               -- 模板正文（含占位符 {{var}}）
  description text,
  is_builtin boolean default false,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 8. 平台规则库 (6 系统设置 - 平台规则库更新)
-- ----------------------------------------------------------------------------
create table if not exists public.platform_rules (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('xhs','douyin','bilibili','wechat')),
  category text,                       -- 分类：封面/标题/标签/敏感词/排版
  rule_text text not null,
  examples text,
  risk_level text check (risk_level in ('info','warning','danger')),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 9. 质检清单模板 (2.4 内容质检清单 - 四平台差异化)
-- ----------------------------------------------------------------------------
create table if not exists public.qa_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('xhs','douyin','bilibili','wechat')),
  category text not null,              -- 封面/标题/标签/敏感词/排版
  item_text text not null,             -- 检查项
  is_required boolean default true,
  sort_order int default 0
);

-- ----------------------------------------------------------------------------
-- RLS 策略：每个用户只能访问自己的数据
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.topics enable row level security;
alter table public.contents enable row level security;
alter table public.schedules enable row level security;
alter table public.assets enable row level security;
alter table public.metrics enable row level security;
alter table public.templates enable row level security;
alter table public.platform_rules enable row level security;
alter table public.qa_checklist_templates enable row level security;

-- profiles: 本人可读写
drop policy if exists "profiles_self_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_read" on public.profiles for select using (auth.uid() = id);
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- 通用 RLS 模板：用户表
drop policy if exists "accounts_owner_all" on public.accounts;
drop policy if exists "topics_owner_all" on public.topics;
drop policy if exists "contents_owner_all" on public.contents;
drop policy if exists "schedules_owner_all" on public.schedules;
drop policy if exists "assets_owner_all" on public.assets;
drop policy if exists "metrics_owner_all" on public.metrics;
create policy "accounts_owner_all" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "topics_owner_all" on public.topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contents_owner_all" on public.contents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "schedules_owner_all" on public.schedules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_owner_all" on public.assets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "metrics_owner_all" on public.metrics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- templates: 本人私有 + 系统内置所有人可读
drop policy if exists "templates_read" on public.templates;
drop policy if exists "templates_owner_write" on public.templates;
create policy "templates_read" on public.templates for select using (is_builtin = true or user_id = auth.uid());
create policy "templates_owner_write" on public.templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 公共表：所有登录用户可读（platform_rules / qa_checklist_templates）
drop policy if exists "rules_read" on public.platform_rules;
drop policy if exists "qa_templates_read" on public.qa_checklist_templates;
create policy "rules_read" on public.platform_rules for select to authenticated using (true);
create policy "qa_templates_read" on public.qa_checklist_templates for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 自动更新 updated_at
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts','topics','contents','schedules','platform_rules']
  loop
    execute format('drop trigger if exists trg_%s_touch on public.%s;', t, t);
    execute format('create trigger trg_%s_touch before update on public.%s for each row execute function public.touch_updated_at();', t, t);
  end loop;
end$$;

-- ============================================================================
-- 平台扩展迁移：新增 视频号(shipinhao)/快手(kuaishou)/微博(weibo)/今日头条(toutiao)
-- 动态删除旧的 platform CHECK 约束并重建为含新平台的版本（自包含，可重复执行）
-- ============================================================================
do $$
declare
  r record;
  col text;
  tilist text := null;
  allowlist text[] := array['xhs','douyin','bilibili','wechat','shipinhao','kuaishou','weibo','toutiao','all'];
begin
  -- 目标平台清单（所有表统一），含全平台 'all'，每项带单引号
  tilist := '''xhs'',''douyin'',''bilibili'',''wechat'',''shipinhao'',''kuaishou'',''weibo'',''toutiao'',''all''';

  for r in
    select c.table_name, c.column_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
    join information_schema.columns c
      on c.table_schema = tc.table_schema
      and c.table_name = tc.table_name
      and c.column_name = ccu.column_name
    where tc.constraint_type = 'CHECK'
      and tc.table_schema = 'public'
      and c.column_name = 'platform'
      and tc.table_name in
        ('accounts','topics','contents','schedules','assets','metrics','templates','platform_rules','keywords','qa_checklist_templates')
  loop
    begin
      execute format('alter table public.%I drop constraint %I;', r.table_name, r.constraint_name);
    exception when others then end;
    -- 加约束前将残留的非法平台值归并为 'all'，避免约束被存量数据拒绝
    execute format(
      'update public.%I set %I = %L where %I is not null and not (%I = any(%L));',
      r.table_name, r.column_name, 'all', r.column_name, r.column_name, allowlist
    );
    execute format(
      'alter table public.%I add constraint %I check (platform in (%s));',
      r.table_name, 'platform_check_' || r.table_name, tilist
    );
  end loop;
end$$;

-- ============================================================================
-- 完成。执行后请到 Table Editor 检查 9 张表是否创建成功。
-- ============================================================================
