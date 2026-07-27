# Gunpo GIS MVP

군포시의 재건축, 개발 호재, 맛집·관광지 정보를 React + Leaflet 지도에서 시각화하는 웹 MVP입니다.

## 기술 스택

- React 18.3.1
- Vite 5.3.4
- TypeScript 5.5.3
- Tailwind CSS 3.4.6
- Leaflet 1.9.4
- React-Leaflet 4.2.1
- Leaflet MarkerCluster
- Leaflet Geoman 2.15.0
- Supabase JS 2.44.4
- Zod 3.23.8

## 설치 방법

```bash
npm ci
```

`package-lock.json`이 없으면 다음 명령을 사용합니다.

```bash
npm install
```

## .env 설정

`.env.example`을 기준으로 `.env`를 만들고 값을 채웁니다.

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_JWT
VITE_VWORLD_API_KEY=YOUR_VWORLD_API_KEY
```

`VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`는 필수입니다. `VITE_SUPABASE_ANON_KEY`에는 Supabase Dashboard의 `anon public` JWT 값을 넣습니다. `service_role` 키를 넣으면 안 됩니다.

`VITE_VWORLD_API_KEY`는 선택값이지만, 없으면 배경 지도 대신 안내 UI가 표시됩니다.

`.env`를 수정한 뒤에는 개발 서버를 반드시 재시작해야 합니다. Vite는 서버 시작 시점에 `.env`를 읽습니다.

프론트엔드에는 Supabase `service_role` 키를 넣지 않습니다.

## Supabase 스키마 적용

[supabase/schema.sql](supabase/schema.sql)은 신규 Supabase 프로젝트에서 초기 1회 실행하는 SQL입니다. 반복 실행 가능한 migration으로 작성된 파일이 아닙니다.

Supabase Dashboard의 SQL Editor에서 내용을 확인한 뒤 실행합니다. 원격 DB에는 사용자가 직접 적용해야 합니다.

`Could not find the table 'public.locations' in the schema cache` 오류가 나오면 실제 Supabase DB에 `public.locations` 테이블이 아직 없는 상태입니다. 관리자 등록 SQL만 실행하지 말고 [supabase/schema.sql](supabase/schema.sql) 전체를 먼저 SQL Editor에서 실행하세요. 테이블을 방금 만들었는데 같은 오류가 계속되면 Supabase Dashboard에서 API schema cache가 갱신될 때까지 잠시 기다린 뒤 앱을 새로고침합니다.

## 최초 관리자 등록 예시

먼저 Supabase Auth에서 이메일/비밀번호 사용자를 생성합니다. 그 뒤 `auth.users`에 생성된 사용자의 UUID를 확인하고, Supabase SQL Editor에서 아래 SQL의 마지막 UUID를 실제 사용자 UUID로 바꿔 실행합니다.

이 SQL은 현재 프로젝트 설계인 `public.user_roles`와 `public.is_admin()` RPC 방식을 유지하면서, 관련 객체가 이미 있어도 다시 실행할 수 있도록 작성한 관리자 권한 보강용 SQL입니다.

```sql
create table if not exists public.user_roles (
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

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  ) then
    alter table public.locations enable row level security;
    grant select on table public.locations to anon;
    grant select, insert, update, delete on table public.locations to authenticated;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'admins read all'
  ) then
    create policy "admins read all"
    on public.locations
    for select
    to authenticated
    using (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'admins insert'
  ) then
    create policy "admins insert"
    on public.locations
    for insert
    to authenticated
    with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'admins update'
  ) then
    create policy "admins update"
    on public.locations
    for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'locations'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'locations'
      and policyname = 'admins delete'
  ) then
    create policy "admins delete"
    on public.locations
    for delete
    to authenticated
    using (public.is_admin());
  end if;
end;
$$;

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'admin')
on conflict (user_id)
do update set role = excluded.role;
```

실제 UUID나 개인정보는 문서나 클라이언트 코드에 커밋하지 않습니다.

## 관리자 로그인 방법

1. Supabase Dashboard에서 Auth 사용자를 생성합니다.
2. SQL Editor에서 해당 사용자의 UUID를 `public.user_roles`에 `admin`으로 등록합니다.
3. 앱을 실행한 뒤 우측 상단 `로그인` 버튼을 누릅니다.
4. Supabase Auth에 등록한 이메일과 비밀번호로 로그인합니다.
5. 로그인 세션만으로는 관리자가 되지 않습니다. 앱은 `supabase.rpc('is_admin')` 결과가 `true`일 때만 관리자 모드로 전환합니다.
6. 관리자 모드가 되면 비공개 초안 데이터와 지도 오른쪽 관리자 도구가 표시됩니다.
7. 지도 오른쪽 도구의 핀 추가 또는 영역 추가 버튼으로 새 위치를 추가합니다.

관리자로 전환되지 않으면 다음을 확인합니다.

- `public.user_roles.user_id`가 로그인한 Auth 사용자 UUID와 정확히 같은지 확인합니다.
- `role` 값이 정확히 `admin`인지 확인합니다.
- [supabase/schema.sql](supabase/schema.sql)의 `is_admin()` 함수와 RLS 정책을 적용했는지 확인합니다.
- 브라우저를 새로고침하거나 로그아웃 후 다시 로그인합니다.

## 개발 서버 실행

```bash
npm run dev -- --host 127.0.0.1
```

브라우저에서는 다음 주소로 접속합니다.

```text
http://127.0.0.1:5173/
```

`localhost`는 환경에 따라 IPv6 주소(`[::1]`)로 연결되어 이전 dev server를 보는 경우가 있습니다. 테스트 중에는 `127.0.0.1`을 권장합니다.

환경변수를 바꿨는데 반영되지 않으면 dev server를 종료한 뒤 강제 재최적화로 실행합니다.

```bash
npm run dev -- --host 127.0.0.1 --force
```

## 빌드 방법

```bash
npm run build
```

## 실행 문제 해결

환경변수 문제가 있으면 앱 화면에 진단 패널이 표시됩니다. 예시는 다음과 같습니다.

```text
브라우저 런타임 진단: URL 있음, anon key 있음, anon key 길이 208, JWT 형태 예
```

`URL 없음` 또는 `anon key 없음`이 표시되면 Vite가 `.env`를 읽지 못한 것입니다.

- `.env`가 프로젝트 루트에 있는지 확인합니다.
- dev server를 완전히 종료하고 다시 실행합니다.
- `127.0.0.1:5173`으로 접속합니다.
- 필요하면 `npm run dev -- --host 127.0.0.1 --force`를 사용합니다.

`anon key 길이`가 너무 짧거나 `JWT 형태 아니오`가 표시되면 Supabase Dashboard의 `anon public` 키가 아닌 다른 값을 넣은 것입니다.

## 데이터 모델

주요 테이블은 `public.locations`입니다.

- `category`: `redevelopment`, `development_issue`, `place`
- `status`: 재건축 단계. `redevelopment`에서만 필수입니다.
- `is_published`: 방문자 공개 여부
- `source_name`, `source_url`, `source_date`: 출처 정보
- `details`: JSON 객체
- `geojson`: 순수 GeoJSON Geometry
- `created_by`, `updated_by`, `updated_at`: 감사 필드

## Geometry 지원 범위

DB의 `geojson`에는 `Feature`나 `FeatureCollection`을 저장하지 않고 다음 Geometry만 저장합니다.

- `Point`
- `Polygon`
- `MultiPolygon`

카테고리별 허용 범위는 다음과 같습니다.

- `place`: `Point`
- `redevelopment`: `Polygon`, `MultiPolygon`
- `development_issue`: `Point`, `Polygon`, `MultiPolygon`

## 관리자 기능

관리자 여부는 클라이언트 세션만으로 판단하지 않고 `supabase.rpc('is_admin')` 결과가 `true`일 때만 인정합니다.

관리자에게만 다음 기능이 활성화됩니다.

- 비공개 초안 데이터 조회
- 지도 오른쪽 관리자 도구 표시
- Marker 생성
- Polygon 생성
- 기존 DB 레이어 편집
- 삭제 확인 모달을 통한 삭제

관리자 기능은 지도 오른쪽의 아이콘 도구로 제공됩니다. 핀 추가 또는 영역 추가를 선택해 지도 위에 Marker 또는 Polygon을 그리면 위치 입력 모달이 열리고, 저장 시 `locations.geojson`에는 순수 Geometry만 저장됩니다. 편집과 삭제도 같은 도구 묶음에서 실행합니다.

관리자 목록 패널에서도 각 지역정보 옆의 수정/삭제 버튼으로 기존 데이터를 관리할 수 있습니다.

방문자와 관리자는 접이식 위치 목록 또는 지도 위 Marker/Polygon을 선택해 상세 정보 모달을 열 수 있습니다. 모바일 화면에서는 목록이 지도 아래쪽 패널로 열리도록 구성되어 있습니다.

## 사진 업로드

위치 입력 모달은 로컬 이미지 파일 첨부를 지원합니다. 파일은 Supabase Storage의 `location-photos` 버킷에 업로드되고, 업로드된 공개 URL은 `locations.details.사진` 배열에 저장됩니다. 선택한 파일은 저장 전 각 항목의 `첨부 취소` 버튼으로 제외할 수 있습니다.

`location-photos` 버킷은 방문자 지도에서 사진을 표시하기 위해 Public bucket으로 구성했습니다. 업로드·수정·삭제는 `public.is_admin()`이 `true`인 인증 사용자만 수행할 수 있습니다. JPEG, PNG, WebP, GIF 파일만 허용하며, 파일당 최대 크기는 10MB입니다.

## 수집 항목과 섹션 확장

현재 DB 스키마는 위치 데이터의 `locations.category`를 `redevelopment`, `development_issue`, `place` 세 값으로 제한합니다. 동시에 섹션 메타데이터와 수집 항목 정의를 관리하기 위해 `location_sections`, `location_section_fields` 테이블을 둡니다.

현재 단계에서는 기존 3개 섹션 안에서 입력 모달에 카테고리별 수집 안내를 표시하고, 관리자 목록 패널의 `섹션 관리` 버튼으로 DB에 등록된 섹션과 수집 항목을 확인할 수 있습니다.

- 재건축: 추진 단계, 기준일/고시일, 출처, 구역명, 면적, 세대수, 시공사 등
- 개발호재: 사업명, 사업 유형, 진행 상황, 발표 기관, 예상 일정 등
- 맛집·관광지: 주소, 영업시간, 대표 메뉴, 연락처, 사진 등

신규 섹션을 실제 위치 등록 카테고리로 사용하려면 다음 단계에서 `locations.section_id`를 추가하고, 기존 `locations.category` check 제약을 섹션 FK 기반으로 전환해야 합니다. 이 전환 전까지 새 섹션은 수집 항목 정의에는 보이지만 위치 등록 카테고리로는 사용하지 않습니다.

기존 Supabase DB에 섹션 테이블만 추가하려면 [supabase/section_schema_idempotent.sql](supabase/section_schema_idempotent.sql)을 Supabase SQL Editor에 붙여넣어 실행합니다. 이 파일은 `user_roles`나 `locations`를 다시 만들지 않고, 섹션 메타데이터 테이블과 기본 수집 항목만 생성/갱신합니다.

섹션 테이블을 적용한 뒤 위치 데이터와 섹션 메타데이터를 연결하려면 [supabase/locations_section_id_idempotent.sql](supabase/locations_section_id_idempotent.sql)을 추가로 실행합니다. 이 SQL은 `locations.section_id`를 추가하고 기존 `category` 값과 같은 key를 가진 섹션으로 연결합니다. 기존 `locations.category` 제약은 유지하므로 앱의 기존 등록/조회 흐름은 그대로 동작합니다.

## 보안 주의사항

- 브라우저에서 `public.user_roles`를 직접 조회하지 않습니다.
- 관리자 판단은 `is_admin()` RPC만 사용합니다.
- RPC 실패 또는 권한 조회 실패는 관리자 권한 없음으로 처리합니다.
- 위치 데이터와 관리자 데이터를 `localStorage`에 캐싱하지 않습니다.
- 세션 토큰이나 개인정보를 로그로 출력하지 않습니다.
- Supabase `service_role` 키를 프론트엔드에 포함하지 않습니다.

## VWorld API 키 주의사항

`VITE_VWORLD_API_KEY`가 없으면 VWorld tile URL을 빈 키로 요청하지 않습니다. 앱은 계속 동작하며 지도 영역 안에 설정 안내 UI를 표시합니다.
