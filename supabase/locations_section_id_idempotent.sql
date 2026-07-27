-- Existing-project helper SQL for linking locations to section metadata.
-- Run section_schema_idempotent.sql first.
-- This keeps the existing locations.category column for compatibility.

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

notify pgrst, 'reload schema';
