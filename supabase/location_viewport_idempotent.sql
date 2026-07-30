-- Viewport queries keep the initial map response small while table RLS remains in force.
create or replace function public.location_geojson_bounds(p_geojson jsonb)
returns box
language sql
immutable
strict
set search_path = ''
as $$
  with positions as (
    select
      (position ->> 0)::double precision as longitude,
      (position ->> 1)::double precision as latitude
    from jsonb_path_query(
      p_geojson,
      '$.coordinates.** ? (@.type() == "array" && @.size() >= 2 && @[0].type() == "number" && @[1].type() == "number")'
    ) as position
  )
  select box(
    point(min(longitude), min(latitude)),
    point(max(longitude), max(latitude))
  )
  from positions;
$$;

revoke all on function public.location_geojson_bounds(jsonb) from public;

alter table public.locations
  add column if not exists geojson_bounds box
  generated always as (public.location_geojson_bounds(geojson)) stored;

create index if not exists idx_locations_geojson_bounds
  on public.locations
  using gist (geojson_bounds);

create or replace function public.get_locations_in_bounds(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision
)
returns setof public.locations
language sql
stable
security invoker
set search_path = ''
as $$
  with viewport as (
    select box(
      point(p_west, p_south),
      point(p_east, p_north)
    ) as bounds
  )
  select location.*
  from public.locations as location
  cross join viewport
  where location.geojson_bounds && viewport.bounds
  order by location.category asc, location.name asc, location.updated_at desc;
$$;

revoke all on function public.get_locations_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision
) from public;

grant execute on function public.get_locations_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision
) to anon, authenticated;
