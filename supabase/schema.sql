create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'admin')
);

alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  category text not null
    check (category in ('redevelopment', 'development_issue', 'place')),
  status text check (
    status is null
    or status in (
      '추진위승인',
      '조합설립',
      '사업시행인가',
      '관리처분인가',
      '착공',
      '준공'
    )
  ),
  is_published boolean not null default false,
  source_name text
    check (source_name is null or char_length(source_name) <= 200),
  source_url text
    check (
      source_url is null
      or (
        char_length(source_url) <= 2000
        and source_url ~* '^https?://'
      )
    ),
  source_date date,
  details jsonb not null default '{}'::jsonb,
  geojson jsonb not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default pg_catalog.now(),

  check (jsonb_typeof(details) = 'object'),
  check (jsonb_typeof(geojson) = 'object'),
  check (geojson ? 'type'),
  check (geojson ? 'coordinates'),
  check (jsonb_typeof(geojson->'coordinates') = 'array'),

  check (
    (category = 'place' and geojson->>'type' = 'Point')
    or
    (
      category = 'redevelopment'
      and geojson->>'type' in ('Polygon', 'MultiPolygon')
    )
    or
    (
      category = 'development_issue'
      and geojson->>'type' in ('Point', 'Polygon', 'MultiPolygon')
    )
  ),

  check (
    (category = 'redevelopment' and status is not null)
    or
    (category <> 'redevelopment' and status is null)
  )
);

create index idx_locations_category
  on public.locations(category);

create index idx_locations_published
  on public.locations(is_published);

create or replace function public.set_location_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := pg_catalog.now();

  return new;
end;
$$;

revoke all on function public.set_location_audit_fields()
  from public, anon, authenticated;

create trigger set_location_audit_fields
before insert or update on public.locations
for each row
execute function public.set_location_audit_fields();

grant select on table public.locations to anon;
grant select, insert, update, delete
  on table public.locations to authenticated;

alter table public.locations enable row level security;

create policy "public read published"
on public.locations
for select
to anon, authenticated
using (is_published = true);

create policy "admins read all"
on public.locations
for select
to authenticated
using (public.is_admin());

create policy "admins insert"
on public.locations
for insert
to authenticated
with check (public.is_admin());

create policy "admins update"
on public.locations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins delete"
on public.locations
for delete
to authenticated
using (public.is_admin());

create table public.location_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 80),
  base_category text not null default 'place'
    check (base_category in ('redevelopment', 'development_issue', 'place')),
  description text check (
    description is null or char_length(description) <= 500
  ),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.location_section_fields (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null
    references public.location_sections(id) on delete cascade,
  field_key text not null
    check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (char_length(label) between 1 and 80),
  field_type text not null
    check (field_type in ('text', 'textarea', 'number', 'date', 'url')),
  is_required boolean not null default false,
  help_text text check (help_text is null or char_length(help_text) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (section_id, field_key)
);

create index idx_location_sections_active
  on public.location_sections(is_active);

create index idx_location_section_fields_section_id
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

revoke all on function public.set_updated_at()
  from public, anon, authenticated;

create trigger set_location_sections_updated_at
before update on public.location_sections
for each row
execute function public.set_updated_at();

create trigger set_location_section_fields_updated_at
before update on public.location_section_fields
for each row
execute function public.set_updated_at();

grant select on table public.location_sections to anon, authenticated;
grant select on table public.location_section_fields to anon, authenticated;
grant insert, update, delete on table public.location_sections to authenticated;
grant insert, update, delete on table public.location_section_fields to authenticated;

alter table public.location_sections enable row level security;
alter table public.location_section_fields enable row level security;

create policy "public read active sections"
on public.location_sections
for select
to anon, authenticated
using (is_active = true);

create policy "admins read all sections"
on public.location_sections
for select
to authenticated
using (public.is_admin());

create policy "admins insert sections"
on public.location_sections
for insert
to authenticated
with check (public.is_admin());

create policy "admins update sections"
on public.location_sections
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins delete sections"
on public.location_sections
for delete
to authenticated
using (public.is_admin());

create policy "public read active section fields"
on public.location_section_fields
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.location_sections
    where location_sections.id = location_section_fields.section_id
      and location_sections.is_active = true
  )
);

create policy "admins read all section fields"
on public.location_section_fields
for select
to authenticated
using (public.is_admin());

create policy "admins insert section fields"
on public.location_section_fields
for insert
to authenticated
with check (public.is_admin());

create policy "admins update section fields"
on public.location_section_fields
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admins delete section fields"
on public.location_section_fields
for delete
to authenticated
using (public.is_admin());

insert into public.location_sections
  (key, label, base_category, description, color, sort_order)
values
  (
    'redevelopment',
    '재건축',
    'redevelopment',
    '정비구역, 조합, 인허가 단계 등 재건축 사업 정보를 수집합니다.',
    '#dc2626',
    10
  ),
  (
    'development_issue',
    '개발 호재',
    'development_issue',
    '교통, 공공시설, 개발 계획 등 지역 개발 이슈를 수집합니다.',
    '#0284c7',
    20
  ),
  (
    'place',
    '맛집·관광지',
    'place',
    '방문자가 확인할 맛집, 카페, 관광지 정보를 수집합니다.',
    '#059669',
    30
  );

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
    ('place', 'phone', '전화번호', 'text', false, '공개된 연락처가 있을 때 입력', 40)
) as seed(section_key, field_key, label, field_type, is_required, help_text, sort_order)
join public.location_sections
  on location_sections.key = seed.section_key;

-- 관리자 등록 예시:
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin');
