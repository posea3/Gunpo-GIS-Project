-- Existing-project helper SQL for two-level location taxonomy.
-- Run section_schema_idempotent.sql and dynamic_sections_idempotent.sql first.

create table if not exists public.location_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 80),
  color text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.location_groups enable row level security;
grant select on public.location_groups to anon, authenticated;
grant insert, update, delete on public.location_groups to authenticated;

drop policy if exists "public read active location groups" on public.location_groups;
create policy "public read active location groups" on public.location_groups for select to anon, authenticated using (is_active = true);
drop policy if exists "admins read all location groups" on public.location_groups;
create policy "admins read all location groups" on public.location_groups for select to authenticated using ((select public.is_admin()));
drop policy if exists "admins manage location groups" on public.location_groups;
create policy "admins manage location groups" on public.location_groups for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.location_groups (key, label, color, sort_order)
values
  ('urban_regeneration', '도시정비', '#dc2626', 10),
  ('development_transport', '개발·교통', '#2563eb', 20),
  ('life_tourism', '생활·관광', '#059669', 30),
  ('other', '기타', '#64748b', 40)
on conflict (key) do nothing;

alter table public.location_sections
  add column if not exists group_id uuid references public.location_groups(id);
create index if not exists idx_location_sections_group_id on public.location_sections(group_id);

update public.location_sections as section
set group_id = groups.id
from public.location_groups as groups
where section.group_id is null
  and groups.key = case section.key
    when 'redevelopment' then 'urban_regeneration'
    when 'development_issue' then 'development_transport'
    when 'place' then 'life_tourism'
    else 'other'
  end;

drop trigger if exists set_location_groups_updated_at on public.location_groups;
create trigger set_location_groups_updated_at before update on public.location_groups
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
