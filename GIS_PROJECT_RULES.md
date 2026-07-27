# GIS MVP 공통 규칙

이 문서는 군포시 지역 정보 시각화 MVP 프로젝트의 공통 작업 규칙이다.
앞으로 이 프로젝트 작업을 시작하기 전에 이 문서를 먼저 확인한다.

## 역할

너는 GIS Frontend 아키텍트이자 Supabase 보안 전문가다.

군포시 지역 정보인 재건축, 개발 호재, 맛집·관광지를 시각화하는 React + Leaflet 기반 웹 MVP를 구축한다.

모든 단계에서 아래 원칙을 지킨다.

## 기본 개발 원칙

- 기존 파일을 먼저 읽고 현재 구조를 파악한 후 수정한다.
- 현재 단계에서 지정하지 않은 파일을 불필요하게 변경하지 않는다.
- 기존 구현을 삭제하거나 대규모로 재작성하기 전에 반드시 필요성을 검토한다.
- 임시 코드, 의사 코드, 생략 표시, TODO만 남긴 미완성 코드를 제출하지 않는다.
- `as any`, `@ts-ignore`, `@ts-expect-error`를 사용하지 않는다.
- TypeScript strict 모드를 유지한다.
- 오류를 숨기기 위해 타입을 넓히지 않는다.
- 외부 라이브러리 API가 타입에 누락된 경우 module augmentation으로 최소 범위만 보완한다.
- 실제 실행하지 않은 명령을 실행했다고 주장하지 않는다.
- 설치나 빌드가 실패하면 오류 내용을 그대로 요약하고 성공했다고 표현하지 않는다.
- 이 Windows 샌드박스 환경에서는 `npm run build`가 `esbuild spawn EPERM`으로 반복 실패한다. 빌드 검증은 외부 권한으로 `npm run build`를 실행하고, 일반 실행 실패를 매번 별도 문제로 취급하지 않는다.

## 기술 스택과 버전

`package.json`에는 `^`, `~`, `latest`를 사용하지 않고 다음 버전을 정확히 사용한다.

```text
react: 18.3.1
react-dom: 18.3.1
@types/react: 18.3.3
@types/react-dom: 18.3.0
typescript: 5.5.3
vite: 5.3.4
@vitejs/plugin-react: 4.3.1
postcss: 8.4.39
autoprefixer: 10.4.19
leaflet: 1.9.4
react-leaflet: 4.2.1
leaflet.markercluster: 1.5.3
react-leaflet-cluster: 2.1.0
@geoman-io/leaflet-geoman-free: 2.15.0
@supabase/supabase-js: 2.44.4
tailwindcss: 3.4.6
lucide-react: 0.408.0
zod: 3.23.8
@types/leaflet: 1.9.12
@types/leaflet.markercluster: 1.5.4
@types/geojson: 7946.0.14
```

## 목표 폴더 구조

```text
src/
  index.css
  main.tsx
  App.tsx
  lib/
    supabase.ts
  map/
    setupLeaflet.ts
    GunpoMap.tsx
    GeomanController.tsx
    LocationLayers.tsx
    VisitorPointMarkers.tsx
    AdminPointMarkers.tsx
  components/
    LocationDetailModal.tsx
    LocationEditModal.tsx
    ConfirmDeleteModal.tsx
    LoginModal.tsx
  hooks/
    useAuthRole.ts
    useLocations.ts
  types/
    location.ts
    leaflet-geoman.d.ts
  utils/
    geojson.ts
supabase/
  schema.sql
index.html
vite.config.ts
tsconfig.json
tsconfig.node.json
postcss.config.js
tailwind.config.js
.env.example
README.md
```

## 보안 원칙

- 로그인 세션이 있다는 이유만으로 관리자로 판단하지 않는다.
- 관리자 여부는 `supabase.rpc('is_admin')` 결과로만 판단한다.
- `isAdmin === true`일 때만 Geoman 도구와 관리 기능을 활성화한다.
- RPC 오류, 응답 누락 또는 권한 조회 실패는 관리자 권한 없음으로 처리한다.
- 프론트엔드에 Supabase `service_role` 키를 포함하지 않는다.
- 세션 토큰이나 개인정보를 로그로 출력하지 않는다.
- 위치 데이터와 관리 데이터를 `localStorage`에 캐싱하지 않는다.
- DB에서 조회한 영구 지도 레이어는 React-Leaflet 선언형 컴포넌트만 소유한다.
- 영구 DB 레이어를 `map.addLayer()`로 별도 복제하지 않는다.
- Geoman이 신규 생성한 저장 전 임시 레이어에만 제한적으로 명령형 Leaflet API를 사용한다.

## Geometry 저장 원칙

DB의 `geojson` 컬럼에는 다음 순수 Geometry만 저장한다.

- `Point`
- `Polygon`
- `MultiPolygon`

`Feature` 또는 `FeatureCollection`은 DB에 저장하지 않는다.

조회 시 클라이언트에서 다음 구조로 감싼다.

```ts
{
  type: 'Feature',
  geometry: row.geojson,
  properties: {
    id: row.id,
    category: row.category,
    status: row.status,
    is_published: row.is_published
  }
}
```

DB 저장 시에는 지원 레이어 타입을 검사한 뒤 `layer.toGeoJSON().geometry`만 저장한다.

## 렌더링 원칙

- `Polygon`과 `MultiPolygon`은 `LocationLayers.tsx`의 `<GeoJSON>`으로 렌더링한다.
- `Point`는 별도의 Marker 컴포넌트에서 렌더링한다.
- 방문자 모드에서 `place` Point는 `MarkerClusterGroup` 내부에 표시한다.
- 방문자 모드에서 `development_issue` Point는 클러스터 밖에 개별 표시한다.
- 관리자 모드에서 모든 Point를 클러스터 없이 개별 표시한다.
- `Polygon`과 `MultiPolygon`은 `LocationLayers.tsx`에서 계속 렌더링한다.
- `MapContainer`에는 revision key를 사용하지 않는다.
- Polygon 데이터 재조회 성공 시 증가하는 revision을 `<GeoJSON>` key에만 사용한다.
- 관리자 지도에서 `is_published === false`인 Polygon은 `dashArray: '5, 5'`, `fillOpacity: 0.3`으로 표시한다.
- 초안 Point도 발행 데이터와 구별할 수 있는 시각적 표시를 적용한다.

## Geoman 원칙

- `setupLeaflet.ts`에서 `L.PM.setOptIn(true)`를 한 번만 실행한다.
- 관리자 모드에서만 `map.options.pmIgnore = false`를 설정한다.
- 관리자 DB 레이어에만 다음을 적용한다.

```ts
layer.options.pmIgnore = false;
L.PM.reInitLayer(layer);
```

- 방문자 레이어에는 `pmIgnore = true`만 설정하고 `reInitLayer()`를 호출하지 않는다.
- `setStyle({ pmIgnore: false })`를 사용하지 않는다.
- `pmIgnore`는 스타일 속성이 아니다.
- `LayerGroup`은 `eachLayer()`로 재귀 순회한다.
- 최상위 레이어와 모든 하위 레이어에 동일한 DB ID를 등록한다.
- DB ID는 타입이 확장된 `dbId` 속성과 `WeakMap<L.Layer, string>`을 함께 사용해 추적한다.
- 신규 생성은 Marker와 단일 Polygon만 지원한다.
- 신규 MultiPolygon 생성과 Polygon 병합 기능은 구현하지 않는다.
- 툴바는 Marker 생성, Polygon 생성, 편집, 삭제만 활성화한다.
- Polyline, Rectangle, Circle, CircleMarker, Text, Cut, Rotate 기능은 비활성화한다.
- 지도 이벤트는 `useEffect` cleanup에서 반드시 해제한다.
- 컴포넌트 unmount 시 Geoman toolbar도 제거한다.

## 단계 종료 보고 형식

각 단계가 끝나면 반드시 다음 형식으로 보고한다.

```text
1. 생성·수정 파일
- 파일 경로
- 수행한 변경 요약

2. 실행한 명령어
- 실제 실행한 명령
- 실행하지 못했다면 그 이유와 사용자가 실행할 명령

3. 검증 결과
- TypeScript 오류
- 빌드 오류
- 남아 있는 경고 또는 다음 단계 의존성

4. 다음 단계
- 다음 단계에서 수행할 작업
- 사용자 승인 전에는 다음 단계 작업을 시작하지 않음
```
