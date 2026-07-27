create table if not exists public.location_import_batches (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.location_sections(id),
  mode text not null check (mode in ('append', 'replace')),
  source_file_name text not null check (char_length(source_file_name) between 1 and 500),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  reverted_at timestamptz
);

create table if not exists public.location_import_changes (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.location_import_batches(id) on delete cascade,
  location_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_row jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.locations add column if not exists import_batch_id uuid references public.location_import_batches(id) on delete set null;
create index if not exists idx_locations_import_batch_id on public.locations(import_batch_id);
create index if not exists idx_location_import_batches_section_id on public.location_import_batches(section_id, created_at desc);
create index if not exists idx_location_import_changes_batch_id on public.location_import_changes(batch_id, id desc);

alter table public.location_import_batches enable row level security;
alter table public.location_import_changes enable row level security;
grant select, insert, update, delete on public.location_import_batches, public.location_import_changes to authenticated;

drop policy if exists "admins manage location import batches" on public.location_import_batches;
create policy "admins manage location import batches" on public.location_import_batches for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admins manage location import changes" on public.location_import_changes;
create policy "admins manage location import changes" on public.location_import_changes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.apply_location_import(p_section_id uuid, p_mode text, p_file_name text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_existing public.locations%rowtype;
  v_touched uuid[] := array[]::uuid[];
  v_inserted integer := 0; v_updated integer := 0; v_skipped integer := 0; v_deleted integer := 0;
begin
  if not (select public.is_admin()) then raise exception 'Admin permission is required.'; end if;
  if p_mode not in ('append', 'replace') then raise exception 'Invalid import mode.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Import rows are required.'; end if;
  insert into public.location_import_batches(section_id, mode, source_file_name, created_by)
  values (p_section_id, p_mode, p_file_name, (select auth.uid())) returning id into v_batch_id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    select * into v_existing from public.locations where section_id = p_section_id and name = v_row->>'name' and details->>'주소' = v_row->'details'->>'주소' order by id limit 1 for update;
    if not found then
      insert into public.locations(name, category, section_id, status, is_published, source_name, source_url, source_date, details, geojson, import_batch_id)
      values (v_row->>'name', v_row->>'category', p_section_id, nullif(v_row->>'status',''), coalesce((v_row->>'is_published')::boolean,false), nullif(v_row->>'source_name',''), nullif(v_row->>'source_url',''), nullif(v_row->>'source_date','')::date, v_row->'details', v_row->'geojson', v_batch_id)
      returning id into v_existing.id;
      insert into public.location_import_changes(batch_id, location_id, action) values (v_batch_id, v_existing.id, 'insert');
      v_inserted := v_inserted + 1;
    elsif v_existing.category is not distinct from v_row->>'category' and v_existing.status is not distinct from nullif(v_row->>'status','') and v_existing.is_published is not distinct from coalesce((v_row->>'is_published')::boolean,false) and v_existing.source_name is not distinct from nullif(v_row->>'source_name','') and v_existing.source_url is not distinct from nullif(v_row->>'source_url','') and v_existing.source_date is not distinct from nullif(v_row->>'source_date','')::date and v_existing.details is not distinct from v_row->'details' and v_existing.geojson is not distinct from v_row->'geojson' then
      v_skipped := v_skipped + 1;
    else
      insert into public.location_import_changes(batch_id, location_id, action, before_row) values (v_batch_id, v_existing.id, 'update', to_jsonb(v_existing));
      update public.locations set category=v_row->>'category', section_id=p_section_id, status=nullif(v_row->>'status',''), is_published=coalesce((v_row->>'is_published')::boolean,false), source_name=nullif(v_row->>'source_name',''), source_url=nullif(v_row->>'source_url',''), source_date=nullif(v_row->>'source_date','')::date, details=v_row->'details', geojson=v_row->'geojson', import_batch_id=v_batch_id where id=v_existing.id;
      v_updated := v_updated + 1;
    end if;
    v_touched := array_append(v_touched, v_existing.id);
  end loop;
  if p_mode = 'replace' then
    for v_existing in select * from public.locations where section_id=p_section_id and not (id = any(v_touched)) loop
      insert into public.location_import_changes(batch_id, location_id, action, before_row) values (v_batch_id, v_existing.id, 'delete', to_jsonb(v_existing));
      delete from public.locations where id=v_existing.id; v_deleted := v_deleted + 1;
    end loop;
  end if;
  update public.location_import_batches set summary=jsonb_build_object('inserted',v_inserted,'updated',v_updated,'skipped',v_skipped,'deleted',v_deleted) where id=v_batch_id;
  return jsonb_build_object('batch_id',v_batch_id,'inserted',v_inserted,'updated',v_updated,'skipped',v_skipped,'deleted',v_deleted);
end; $$;

create or replace function public.undo_location_import(p_batch_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_change record; v_row jsonb;
begin
  if not (select public.is_admin()) then raise exception 'Admin permission is required.'; end if;
  if exists(select 1 from public.location_import_batches where id=p_batch_id and reverted_at is not null) then raise exception 'This import has already been reverted.'; end if;
  for v_change in select * from public.location_import_changes where batch_id=p_batch_id order by id desc loop
    if v_change.action='insert' then delete from public.locations where id=v_change.location_id;
    else v_row:=v_change.before_row;
      insert into public.locations(id,name,category,section_id,status,is_published,source_name,source_url,source_date,details,geojson,import_batch_id)
      values ((v_row->>'id')::uuid,v_row->>'name',v_row->>'category',(v_row->>'section_id')::uuid,nullif(v_row->>'status',''),coalesce((v_row->>'is_published')::boolean,false),nullif(v_row->>'source_name',''),nullif(v_row->>'source_url',''),nullif(v_row->>'source_date','')::date,v_row->'details',v_row->'geojson',(v_row->>'import_batch_id')::uuid)
      on conflict (id) do update set name=excluded.name,category=excluded.category,section_id=excluded.section_id,status=excluded.status,is_published=excluded.is_published,source_name=excluded.source_name,source_url=excluded.source_url,source_date=excluded.source_date,details=excluded.details,geojson=excluded.geojson,import_batch_id=excluded.import_batch_id;
    end if;
  end loop;
  update public.location_import_batches set reverted_at=pg_catalog.now() where id=p_batch_id;
end; $$;

revoke all on function public.apply_location_import(uuid,text,text,jsonb), public.undo_location_import(uuid) from public, anon;
grant execute on function public.apply_location_import(uuid,text,text,jsonb), public.undo_location_import(uuid) to authenticated;
notify pgrst, 'reload schema';
