-- Apply this script in the Supabase SQL Editor before saving a new progress value.
-- It intentionally stops when legacy values remain, so existing project status
-- data is never silently reclassified.

do $$
declare
  legacy_statuses text;
  constraint_name text;
begin
  select string_agg(distinct status, ', ' order by status)
    into legacy_statuses
  from public.locations
  where status in (
    '추진위승인',
    '조합설립',
    '사업시행인가',
    '관리처분인가',
    '준공'
  );

  if legacy_statuses is not null then
    raise exception
      'Legacy progress values require manual review before replacement: %',
      legacy_statuses;
  end if;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%추진위승인%'
        or pg_get_constraintdef(oid) like '%사업시행인가%'
        or pg_get_constraintdef(oid) like '%관리처분인가%'
      )
  loop
    execute format('alter table public.locations drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and conname = 'locations_status_check'
  ) then
    alter table public.locations
      add constraint locations_status_check check (
        status is null
        or status in (
          '안전진단 완료',
          '정비계획 수립',
          '정비구역 지정',
          '조합설립인가',
          '사업시행자 지정',
          '시공자선정',
          '사업시행계획인가',
          '관리처분계획인가',
          '이주',
          '착공'
        )
      );
  end if;
end;
$$;
