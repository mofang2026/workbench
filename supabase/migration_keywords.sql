-- ============================================================================
-- 全域自媒体工作台 · 关键词管理库 迁移脚本（U11）
-- 执行位置：Supabase Dashboard → SQL Editor → 粘贴运行
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 确保公共函数存在（schema.sql 中已定义，此处幂等保护）
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 关键词管理表
-- ----------------------------------------------------------------------------
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,                       -- 关键词
  category text,                            -- 分类：行业词/长尾词/情绪词/话题词/竞品词
  platform text check (platform in ('xhs','douyin','bilibili','wechat','all')),
  track text,                               -- 适用赛道
  hot_score int default 0,                  -- 热度评分 0-100
  status text default 'active' check (status in ('active','watching','deprecated')),
  source text,                              -- 来源：选题聚合/手动添加/外部导入
  notes text,                               -- 备注
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 唯一约束：同用户同词同平台不重复（NULL 平台视为 'all'）
-- 注：UNIQUE 约束不支持表达式，改用唯一索引实现
create unique index if not exists uq_keywords_user_word_platform
  on public.keywords(user_id, word, coalesce(platform, 'all'));

create index if not exists idx_keywords_user on public.keywords(user_id);
create index if not exists idx_keywords_category on public.keywords(user_id, category);

-- RLS
alter table public.keywords enable row level security;
drop policy if exists "keywords_owner_all" on public.keywords;
create policy "keywords_owner_all" on public.keywords
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at 触发器
drop trigger if exists trg_keywords_touch on public.keywords;
create trigger trg_keywords_touch
  before update on public.keywords
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 完成。执行后可在「关键词管理」页面使用。
-- ============================================================================
