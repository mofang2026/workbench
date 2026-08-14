-- 视频脚本工场 · 迁移脚本
-- 创建 video_scripts 表

create table if not exists public.video_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default '',
  type text not null default 'short',         -- short | oral | vlog | tutorial
  duration text default '',                   -- 30s | 60s | 3min ...
  platform text default '',                   -- 抖音 | 小红书 | B站 | 公众号
  hook text default '',                       -- 前3秒hook
  shots jsonb default '[]'::jsonb,            -- 分镜数组
  ending text default '',                     -- 结尾引导
  summary text default '',                    -- 脚本概要
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 触发器：updated_at 自动更新
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_video_scripts_updated on public.video_scripts;
create trigger trg_video_scripts_updated
  before update on public.video_scripts
  for each row execute function touch_updated_at();

-- RLS 策略
alter table public.video_scripts enable row level security;

drop policy if exists "用户管理自己的视频脚本" on public.video_scripts;
create policy "用户管理自己的视频脚本"
  on public.video_scripts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
