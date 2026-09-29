-- ============================================================================
-- 桥接层 · 跨系统映射表 (bridge_links)
-- 作用：承载 workbench（运营中台 / Supabase PG, uuid 主键）
--       与 AImofang（生产引擎 / daemon SQLite, text 主键）之间的 ID 映射。
-- 执行位置：Supabase Dashboard → SQL Editor → 粘贴运行；或纳入 supabase migrations。
-- 依赖：schema.sql 已建表（profiles / topics / contents / assets / schedules / metrics）。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 映射表
--    设计要点：
--    - 两侧主键类型不同（uuid vs text），统一以 text 存储，避免类型冲突。
--    - wb_entity / af_entity 用枚举约束，防止脏数据。
--    - 同一 workbench 实体可映射到多个 AImofang 实体（如 1 topic → N artifact），
--      故唯一约束覆盖四点（wb_entity, wb_id, af_entity, af_id）。
--    - status 记录同步状态，direction 标记流向，便于排查与增量同步。
-- ----------------------------------------------------------------------------
create table if not exists public.bridge_links (
  id uuid primary key default gen_random_uuid(),

  -- workbench 侧
  user_id uuid references auth.users(id) on delete cascade,   -- 归属用户（为空时由 service role 写入）
  wb_entity text not null
    check (wb_entity in ('topic','content','asset','schedule','metric')),
  wb_id text not null,                                        -- workbench 端记录 id

  -- AImofang 侧
  af_entity text not null
    check (af_entity in ('seed','suggestion','report','production','creator_job','artifact')),
  af_id text not null,                                        -- AImofang 端记录 id

  -- 同步元数据
  status text not null default 'pending'
    check (status in ('pending','synced','failed','stale')),
  direction text not null default 'down'
    check (direction in ('down','up','both')),
  last_error text,
  meta jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (wb_entity, wb_id, af_entity, af_id)
);

create index if not exists idx_bridge_links_wb on public.bridge_links(wb_entity, wb_id);
create index if not exists idx_bridge_links_af on public.bridge_links(af_entity, af_id);
create index if not exists idx_bridge_links_user on public.bridge_links(user_id);

-- ----------------------------------------------------------------------------
-- 2. RLS：按归属用户隔离（service role 绕过；user_id 为 NULL 的系统映射仅后端可见）
--    说明：原 for-all using(true) 会让任意登录用户读写全部租户的 bridge_links，
--          故收紧为 auth.uid() = user_id。service_role 默认豁免 RLS，后端仍可全量读写。
-- ----------------------------------------------------------------------------
alter table public.bridge_links enable row level security;

drop policy if exists "bridge_links_auth_all" on public.bridge_links;
drop policy if exists "bridge_links_owner_all" on public.bridge_links;
create policy "bridge_links_owner_all"
  on public.bridge_links
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. updated_at 自动维护
-- ----------------------------------------------------------------------------
drop trigger if exists trg_bridge_links_touch on public.bridge_links;
create trigger trg_bridge_links_touch
  before update on public.bridge_links
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. 幂等写入辅助函数（upsert）
--    调用方传入四点 + 可选 owner / meta；已存在则更新 status/last_error/meta。
--    供桥接服务以 service role 调用，避免重复映射。
-- ----------------------------------------------------------------------------
create or replace function public.upsert_bridge_link(
  p_user_id uuid,
  p_wb_entity text,
  p_wb_id text,
  p_af_entity text,
  p_af_id text,
  p_status text default 'pending',
  p_direction text default 'down',
  p_meta jsonb default '{}'::jsonb
)
returns public.bridge_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bridge_links;
begin
  insert into public.bridge_links
    (user_id, wb_entity, wb_id, af_entity, af_id, status, direction, meta)
  values
    (p_user_id, p_wb_entity, p_wb_id, p_af_entity, p_af_id, p_status, p_direction, p_meta)
  on conflict (wb_entity, wb_id, af_entity, af_id) do update
    set status = excluded.status,
        direction = excluded.direction,
        meta = excluded.meta,
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- ============================================================================
-- 完成。执行后请到 Table Editor 确认 public.bridge_links 已创建。
-- ============================================================================
