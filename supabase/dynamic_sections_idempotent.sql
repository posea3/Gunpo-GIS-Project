-- Existing-project helper SQL for fully dynamic location sections.
-- Run section_schema_idempotent.sql first.
-- This allows public.locations.category to store any active section key.

alter table public.location_sections
  add column if not exists geometry_kind text not null default 'point'
  check (geometry_kind in ('point', 'area', 'mixed'));

alter table public.location_sections
  add column if not exists requires_status boolean not null default false;

update public.location_sections
set
  geometry_kind = case key
    when 'redevelopment' then 'area'
    when 'development_issue' then 'mixed'
    else 'point'
  end,
  requires_status = case key
    when 'redevelopment' then true
    else false
  end
where key in ('redevelopment', 'development_issue', 'place');

alter table public.locations
  add column if not exists section_id uuid
  references public.location_sections(id);

create index if not exists idx_locations_section_id
  on public.locations(section_id);

update public.locations
set section_id = location_sections.id
from public.location_sections
where public.locations.section_id is null
  and public.locations.category = location_sections.key;

-- Remove only legacy checks that hard-code all original section keys.
-- PostgreSQL generates different names for unnamed constraints.
do $$
declare
  legacy_constraint record;
begin
  for legacy_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%redevelopment%'
      and pg_get_constraintdef(oid) like '%development_issue%'
      and pg_get_constraintdef(oid) like '%place%'
  loop
    execute format(
      'alter table public.locations drop constraint if exists %I',
      legacy_constraint.conname
    );
  end loop;
end;
$$;

alter table public.locations
  drop constraint if exists locations_category_format_check;

alter table public.locations
  drop constraint if exists locations_section_required_check;

alter table public.locations
  add constraint locations_category_format_check
  check (category ~ '^[a-z][a-z0-9_]{1,63}$');

alter table public.locations
  add constraint locations_section_required_check
  check (section_id is not null);

create or replace function public.set_location_section_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.section_id is null then
    select location_sections.id
    into new.section_id
    from public.location_sections
    where location_sections.key = new.category;
  end if;

  if new.section_id is not null then
    select location_sections.key
    into new.category
    from public.location_sections
    where location_sections.id = new.section_id;
  end if;

  return new;
end;
$$;

revoke all on function public.set_location_section_id()
  from public, anon, authenticated;

drop trigger if exists set_location_section_id
  on public.locations;

create trigger set_location_section_id
before insert or update on public.locations
for each row
execute function public.set_location_section_id();

create or replace function public.validate_location_section_rules()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  section_key text;
  section_geometry_kind text;
  section_requires_status boolean;
begin
  select
    location_sections.key,
    location_sections.geometry_kind,
    location_sections.requires_status
  into
    section_key,
    section_geometry_kind,
    section_requires_status
  from public.location_sections
  where location_sections.id = new.section_id;

  if section_key is null then
    raise exception 'Invalid location section_id.';
  end if;

  if new.category <> section_key then
    raise exception 'Location category must match section key.';
  end if;

  if section_geometry_kind = 'point' and new.geojson->>'type' <> 'Point' then
    raise exception 'This section only supports Point geometry.';
  end if;

  if
    section_geometry_kind = 'area'
    and new.geojson->>'type' not in ('Polygon', 'MultiPolygon')
  then
    raise exception 'This section only supports Polygon or MultiPolygon geometry.';
  end if;

  if
    section_geometry_kind = 'mixed'
    and new.geojson->>'type' not in ('Point', 'Polygon', 'MultiPolygon')
  then
    raise exception 'Unsupported geometry type.';
  end if;

  if section_requires_status = true and new.status is null then
    raise exception 'This section requires status.';
  end if;

  if section_requires_status = false and new.status is not null then
    raise exception 'This section does not use status.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_location_section_rules()
  from public, anon, authenticated;

drop trigger if exists validate_location_section_rules
  on public.locations;

create trigger validate_location_section_rules
before insert or update on public.locations
for each row
execute function public.validate_location_section_rules();

notify pgrst, 'reload schema';
