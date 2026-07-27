-- Idempotent section metadata schema for an existing Gunpo GIS project.

create table if not exists public.location_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 80),
  base_category text not null default 'place'
    check (base_category in ('redevelopment', 'development_issue', 'place')),
  geometry_kind text not null default 'point'
    check (geometry_kind in ('point', 'area', 'mixed')),
  requires_status boolean not null default false,
  description text check (description is null or char_length(description) <= 500),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.location_sections
  add column if not exists base_category text not null default 'place'
  check (base_category in ('redevelopment', 'development_issue', 'place'));

alter table public.location_sections
  add column if not exists geometry_kind text not null default 'point'
  check (geometry_kind in ('point', 'area', 'mixed'));

alter table public.location_sections
  add column if not exists requires_status boolean not null default false;

create table if not exists public.location_section_fields (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.location_sections(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 80),
  field_type text not null check (field_type in ('text', 'textarea', 'number', 'date', 'url')),
  is_required boolean not null default false,
  help_text text check (help_text is null or char_length(help_text) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (section_id, field_key)
);

create index if not exists idx_location_sections_active
  on public.location_sections(is_active);

create index if not exists idx_location_section_fields_section_id
  on public.location_section_fields(section_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists set_location_sections_updated_at on public.location_sections;
create trigger set_location_sections_updated_at
before update on public.location_sections
for each row execute function public.set_updated_at();

drop trigger if exists set_location_section_fields_updated_at on public.location_section_fields;
create trigger set_location_section_fields_updated_at
before update on public.location_section_fields
for each row execute function public.set_updated_at();

grant select on table public.location_sections to anon, authenticated;
grant select on table public.location_section_fields to anon, authenticated;
grant insert, update, delete on table public.location_sections to authenticated;
grant insert, update, delete on table public.location_section_fields to authenticated;

alter table public.location_sections enable row level security;
alter table public.location_section_fields enable row level security;

drop policy if exists "public read active sections" on public.location_sections;
drop policy if exists "admins read all sections" on public.location_sections;
drop policy if exists "admins insert sections" on public.location_sections;
drop policy if exists "admins update sections" on public.location_sections;
drop policy if exists "admins delete sections" on public.location_sections;

create policy "public read active sections"
on public.location_sections for select to anon, authenticated
using (is_active = true);

create policy "admins read all sections"
on public.location_sections for select to authenticated
using (public.is_admin());

create policy "admins insert sections"
on public.location_sections for insert to authenticated
with check (public.is_admin());

create policy "admins update sections"
on public.location_sections for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admins delete sections"
on public.location_sections for delete to authenticated
using (public.is_admin());

drop policy if exists "public read active section fields" on public.location_section_fields;
drop policy if exists "admins read all section fields" on public.location_section_fields;
drop policy if exists "admins insert section fields" on public.location_section_fields;
drop policy if exists "admins update section fields" on public.location_section_fields;
drop policy if exists "admins delete section fields" on public.location_section_fields;

create policy "public read active section fields"
on public.location_section_fields for select to anon, authenticated
using (
  exists (
    select 1
    from public.location_sections
    where location_sections.id = location_section_fields.section_id
      and location_sections.is_active = true
  )
);

create policy "admins read all section fields"
on public.location_section_fields for select to authenticated
using (public.is_admin());

create policy "admins insert section fields"
on public.location_section_fields for insert to authenticated
with check (public.is_admin());

create policy "admins update section fields"
on public.location_section_fields for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admins delete section fields"
on public.location_section_fields for delete to authenticated
using (public.is_admin());

insert into public.location_sections
  (key, label, base_category, geometry_kind, requires_status, description, color, is_active, sort_order)
values
  ('redevelopment', '재건축', 'redevelopment', 'area', true, '재건축 사업 정보를 수집합니다.', '#dc2626', true, 10),
  ('development_issue', '개발 호재', 'development_issue', 'mixed', false, '개발 계획과 호재 정보를 수집합니다.', '#0284c7', true, 20),
  ('place', '맛집·관광지', 'place', 'point', false, '맛집과 관광지 정보를 수집합니다.', '#059669', true, 30)
on conflict (key) do update
set
  label = excluded.label,
  base_category = excluded.base_category,
  geometry_kind = excluded.geometry_kind,
  requires_status = excluded.requires_status,
  description = excluded.description,
  color = excluded.color,
  is_active = true,
  sort_order = excluded.sort_order;

insert into public.location_section_fields
  (section_id, field_key, label, field_type, is_required, help_text, sort_order)
select
  location_sections.id,
  seed.field_key,
  seed.label,
  seed.field_type,
  seed.is_required,
  seed.help_text,
  seed.sort_order
from (
  values
    ('redevelopment', 'district_name', '구역명', 'text', false, '정비구역 또는 사업 구역 이름', 10),
    ('redevelopment', 'area', '면적', 'text', false, '고시 또는 자료 기준 면적', 20),
    ('redevelopment', 'households', '세대수', 'number', false, '계획 또는 고시 기준 세대수', 30),
    ('redevelopment', 'contractor', '시공사', 'text', false, '선정된 시공사가 있을 때 입력', 40),
    ('development_issue', 'project_type', '사업 유형', 'text', false, '교통, 공공시설, 민간개발 등', 10),
    ('development_issue', 'progress', '진행 상황', 'textarea', false, '현재 알려진 진행 상황', 20),
    ('development_issue', 'expected_schedule', '예상 일정', 'text', false, '발표 자료 기준 예상 일정', 30),
    ('place', 'address', '주소', 'text', true, '방문 가능한 도로명 또는 지번 주소', 10),
    ('place', 'opening_hours', '영업시간', 'text', false, '요일별 차이가 있으면 상세 정보에 입력', 20),
    ('place', 'signature_menu', '대표 메뉴', 'text', false, '맛집 또는 카페의 대표 메뉴', 30),
    ('place', 'phone', '연락처', 'text', false, '공개된 연락처가 있을 때 입력', 40)
) as seed(section_key, field_key, label, field_type, is_required, help_text, sort_order)
join public.location_sections on location_sections.key = seed.section_key
on conflict (section_id, field_key) do update
set
  label = excluded.label,
  field_type = excluded.field_type,
  is_required = excluded.is_required,
  help_text = excluded.help_text,
  sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
