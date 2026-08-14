-- ============================================================================
-- 迁移：AI 违规自检报告字段
-- 给 contents 表添加 compliance_report jsonb 字段
-- ============================================================================

-- 添加 compliance_report 字段（如果不存在）
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contents'
      and column_name = 'compliance_report'
  ) then
    alter table public.contents add column compliance_report jsonb;
  end if;
end $$;

-- 更新 touch_updated_at 函数（自包含定义）
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- 重建触发器（drop if exists 再 create）
drop trigger if exists trg_contents_touch on public.contents;
create trigger trg_contents_touch
  before update on public.contents
  for each row execute function public.touch_updated_at();

-- 提示
-- 执行后在 contents 表中将看到 compliance_report 字段（jsonb 类型）
-- 前端保存的 JSON 结构：
-- {
--   "overall_risk": "低/中/高",
--   "risk_score": 0,
--   "sensitive_words": [{"word":"","reason":"","severity":""}],
--   "platform_results": {"xhs":{"status":"","issues":[]},...},
--   "limit_risks": [],
--   "suggestions": [],
--   "revised_body": ""
-- }
