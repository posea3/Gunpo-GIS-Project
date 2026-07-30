import { Check, Edit3, MapPin, Pentagon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  GeoJSON,
  MapContainer,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { Geometry } from 'geojson';

import { vworldApiKey } from '../lib/supabase';
import type { Location, LocationCreateDraft } from '../types/location';
import type { LocationViewport } from '../types/locationViewport';
import type { LocationSectionWithFields, SectionByCategory } from '../types/section';
import { AdminPointMarkers } from './AdminPointMarkers';
import { GeomanController } from './GeomanController';
import { gunpoBoundaryFeature } from './gunpoBoundary';
import { LocationLayers } from './LocationLayers';
import { ensureGeoman } from './setupLeaflet';
import { VisitorPointMarkers } from './VisitorPointMarkers';

interface GunpoMapProps {
  locations: readonly Location[];
  revision: number;
  isAdmin: boolean;
  authStatus: string;
  onSelectLocation: (location: Location) => void;
  refetch?: () => void;
  panelOffset?: number;
  externalCreateDraft?: LocationCreateDraft | null;
  onExternalCreateConsumed?: () => void;
  sections?: readonly LocationSectionWithFields[];
  sectionsByCategory?: SectionByCategory;
  onViewportChange: (viewport: LocationViewport) => void;
}

const gunpoCityHall: [number, number] = [37.3615, 126.9352];
const defaultZoom = 15;
const minZoom = 14;
const maxZoom = 19;
const gunpoViewBounds: LatLngBoundsExpression = [
  [37.305, 126.873],
  [37.38, 126.963],
];
const outsideWorldRing: LatLngExpression[] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];
type AdminDrawShape = 'Marker' | 'Polygon';

type GeomanControlMap = L.Map & {
  pm?: {
    enableDraw: (shape: AdminDrawShape) => void;
    disableDraw: () => void;
    disableGlobalEditMode: () => void;
    toggleGlobalEditMode: () => void;
  };
};

export function GunpoMap({
  locations,
  revision,
  isAdmin,
  authStatus,
  onSelectLocation,
  refetch,
  panelOffset = 0,
  externalCreateDraft = null,
  onExternalCreateConsumed,
  sections = [],
  sectionsByCategory = {},
  onViewportChange,
}: GunpoMapProps) {
  const hasVworldApiKey = vworldApiKey !== null;
  const [map, setMap] = useState<GeomanControlMap | null>(null);
  const [isGeomanReady, setIsGeomanReady] = useState(false);
  const canUseAdminMapTools = isAdmin && isGeomanReady;
  const boundaryMaskRing = useMemo(
    () => toMaskLatLngRing(gunpoBoundaryFeature.geometry),
    [],
  );

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-slate-100">
      <MapContainer
        center={gunpoCityHall}
        zoom={defaultZoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        maxBounds={gunpoViewBounds}
        maxBoundsViscosity={0.85}
        zoomControl={false}
        className="h-full min-h-0 w-full"
        attributionControl
      >
        <MapInstanceBridge
          isAdmin={isAdmin}
          onReady={(nextMap, nextIsGeomanReady) => {
            setMap(nextMap);
            setIsGeomanReady(nextIsGeomanReady);
          }}
        />
        <MapViewportGuard panelOffset={panelOffset} />
        <MapViewportReporter onViewportChange={onViewportChange} />
        <MapZoomControl />

        {hasVworldApiKey ? (
          <TileLayer
            url={`https://api.vworld.kr/req/wmts/1.0.0/${vworldApiKey}/Base/{z}/{y}/{x}.png`}
            attribution='Map data &copy; <a href="https://www.vworld.kr">VWorld</a>'
            minZoom={minZoom}
            maxZoom={maxZoom}
          />
        ) : null}

        <Polygon
          positions={[outsideWorldRing, boundaryMaskRing]}
          pathOptions={{
            color: '#0f172a',
            weight: 0,
            fillColor: '#0f172a',
            fillOpacity: 0.18,
          }}
          interactive={false}
        />
        <GeoJSON
          data={gunpoBoundaryFeature}
          style={{
            color: '#2563eb',
            weight: 2,
            fillOpacity: 0,
            dashArray: '6, 5',
          }}
          interactive={false}
        />

        <LocationLayers
          locations={locations}
          revision={revision}
          isAdmin={canUseAdminMapTools}
          onSelectLocation={onSelectLocation}
        />

        {canUseAdminMapTools ? (
          <AdminPointMarkers
            locations={locations}
            onSelectLocation={onSelectLocation}
          />
        ) : (
          <VisitorPointMarkers
            locations={locations}
            sections={sections}
            onSelectLocation={onSelectLocation}
          />
        )}

        <GeomanController
          isAdmin={isAdmin}
          locations={locations}
          refetch={refetch ?? noop}
          externalCreateDraft={externalCreateDraft}
          onExternalCreateConsumed={onExternalCreateConsumed}
          sections={sections}
          sectionsByCategory={sectionsByCategory}
        />
      </MapContainer>

      <MapAdminToolbar
        isAdmin={isAdmin}
        authStatus={authStatus}
        map={map}
        isGeomanReady={isGeomanReady}
      />

      {!hasVworldApiKey ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          VWorld API 키가 설정되지 않아 기본 지도가 표시되지 않습니다.
          `.env`에 `VITE_VWORLD_API_KEY`를 설정하면 배경 지도가 표시됩니다.
        </div>
      ) : null}
    </section>
  );
}

function noop() {
  return undefined;
}

function MapViewportReporter({
  onViewportChange,
}: {
  onViewportChange: (viewport: LocationViewport) => void;
}) {
  const map = useMap();

  const reportViewport = () => {
    const bounds = map.getBounds();
    onViewportChange({
      west: Number(bounds.getWest().toFixed(6)),
      south: Number(bounds.getSouth().toFixed(6)),
      east: Number(bounds.getEast().toFixed(6)),
      north: Number(bounds.getNorth().toFixed(6)),
    });
  };

  useEffect(() => {
    reportViewport();
    map.on('moveend', reportViewport);

    return () => {
      map.off('moveend', reportViewport);
    };
  }, [map, onViewportChange]);

  useMapEvents({
    resize: reportViewport,
  });

  return null;
}

function MapAdminToolbar({
  isAdmin,
  authStatus,
  map,
  isGeomanReady,
}: {
  isAdmin: boolean;
  authStatus: string;
  map: GeomanControlMap | null;
  isGeomanReady: boolean;
}) {
  const [activeTool, setActiveTool] = useState<AdminDrawShape | 'edit' | null>(null);

  useEffect(() => {
    if (map === null || map.pm === undefined) {
      return;
    }

    const cancelActiveTool = () => {
      map.pm?.disableDraw();
      map.pm?.disableGlobalEditMode();
      setActiveTool(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelActiveTool();
      }
    };
    const handleCreate = () => setActiveTool(null);

    window.addEventListener('keydown', handleKeyDown);
    map.on('pm:create', handleCreate);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      map.off('pm:create', handleCreate);
    };
  }, [map]);

  if (!isAdmin) {
    if (authStatus !== 'authenticated') {
      return null;
    }

    return (
      <div className="absolute right-4 top-24 z-[1200] max-w-[220px] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 shadow-lg">
        로그인은 되었지만 관리자 권한이 확인되지 않았습니다. `public.user_roles`와
        `is_admin()` RPC 설정을 확인하세요.
      </div>
    );
  }

  if (map === null) {
    return (
      <div className="absolute right-4 top-24 z-[1200] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">
        지도 도구 준비 중
      </div>
    );
  }

  if (!isGeomanReady || map.pm === undefined) {
    return (
      <div className="absolute right-4 top-24 z-[1200] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 shadow-lg">
        Geoman 도구를 초기화하지 못했습니다. 새로고침 후에도 반복되면 설정을
        확인해야 합니다.
      </div>
    );
  }

  const geoman = map.pm;

  const startDraw = (shape: AdminDrawShape) => {
    geoman.disableDraw();
    geoman.disableGlobalEditMode();
    geoman.enableDraw(shape);
    setActiveTool(shape);
  };

  const startEdit = () => {
    geoman.disableDraw();
    geoman.disableGlobalEditMode();
    geoman.toggleGlobalEditMode();
    setActiveTool('edit');
  };

  const finishEdit = () => {
    geoman.disableDraw();
    geoman.disableGlobalEditMode();
    setActiveTool(null);
  };

  return (
    <div className="absolute right-4 top-24 z-[1200] flex flex-col gap-2">
        <AdminToolButton
          label="핀 추가"
          onClick={() => startDraw('Marker')}
        >
          <MapPin className="size-5" />
        </AdminToolButton>
        <div className="group relative">
          <AdminToolButton label="영역" onClick={() => startDraw('Polygon')}>
            <Pentagon className="size-5" />
          </AdminToolButton>
          <div className="pointer-events-none absolute right-[56px] top-0 hidden w-28 flex-col gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-lg group-hover:pointer-events-auto group-hover:flex" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="flex h-8 items-center gap-2 rounded px-2 text-left text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => startDraw('Polygon')}>
              <Pentagon className="size-3.5" /> 영역 추가
            </button>
            <button type="button" className="flex h-8 items-center gap-2 rounded px-2 text-left text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700" onClick={startEdit}>
              <Edit3 className="size-3.5" /> 영역 편집
            </button>
          </div>
        </div>
        {activeTool === 'edit' ? (
          <AdminToolButton label="편집 완료" onClick={finishEdit}>
            <Check className="size-5" />
          </AdminToolButton>
        ) : null}
    </div>
  );
}

/*
 * Kept separate from Leaflet controls on purpose. Leaflet control panes can
 * intercept pointer events differently across plugin states; this toolbar is
 * a plain React overlay.
 */
function AdminToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };

  const stopMapEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className="group relative flex size-14 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg hover:bg-blue-50 hover:text-blue-700"
      onClick={handleClick}
      onMouseDown={stopMapEvent}
      onMouseUp={stopMapEvent}
      onPointerDown={stopMapEvent}
      onDoubleClick={stopMapEvent}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="pointer-events-none absolute right-[62px] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow-md group-hover:block">
        {label}
      </span>
    </button>
  );
}

function MapInstanceBridge({
  isAdmin,
  onReady,
}: {
  isAdmin: boolean;
  onReady: (map: GeomanControlMap, isGeomanReady: boolean) => void;
}) {
  const map = useMap() as GeomanControlMap;

  useEffect(() => {
    let isActive = true;

    if (!isAdmin) {
      onReady(map, map.pm !== undefined);
      return () => {
        isActive = false;
      };
    }

    onReady(map, false);

    ensureGeoman()
      .then(() => {
        if (!isActive) {
          return;
        }

        map.options.pmIgnore = false;
        L.PM.reInitLayer(map);
        onReady(map, map.pm !== undefined);
      })
      .catch(() => {
        if (isActive) {
          onReady(map, false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin, map, onReady]);

  return null;
}

function MapViewportGuard({ panelOffset }: { panelOffset: number }) {
  const map = useMap();
  const previousPanelOffsetRef = useRef(panelOffset);

  useEffect(() => {
    const keepInsideBounds = () => {
      map.panInsideBounds(gunpoViewBounds, { animate: false });
    };

    map.setMaxBounds(gunpoViewBounds);
    map.setMinZoom(minZoom);

    const previousPanelOffset = getResponsivePanelOffset(
      previousPanelOffsetRef.current,
    );
    const nextPanelOffset = getResponsivePanelOffset(panelOffset);
    const panelOffsetDelta = nextPanelOffset - previousPanelOffset;

    if (panelOffsetDelta !== 0) {
      map.panBy([-panelOffsetDelta / 2, 0], { animate: false });
    }

    previousPanelOffsetRef.current = panelOffset;
    map.on('drag', keepInsideBounds);
    map.on('zoomend', keepInsideBounds);

    return () => {
      map.off('drag', keepInsideBounds);
      map.off('zoomend', keepInsideBounds);
    };
  }, [map, panelOffset]);

  return null;
}

function toMaskLatLngRing(geometry: Geometry): LatLngExpression[] {
  if (geometry.type !== 'Polygon') {
    return [];
  }

  return geometry.coordinates[0].map((coordinate) => [
    coordinate[1],
    coordinate[0],
  ]);
}

function getResponsivePanelOffset(panelOffset: number) {
  if (typeof window === 'undefined' || window.innerWidth < 768) {
    return 0;
  }

  return panelOffset;
}

function MapZoomControl() {
  const map = useMap();

  const zoomIn = () => {
    map.zoomIn();
  };

  const zoomOut = () => {
    map.zoomOut();
  };

  return (
    <div className="leaflet-bottom leaflet-right">
      <div className="leaflet-control mb-8 mr-3 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
        <button
          type="button"
          className="flex size-11 items-center justify-center border-b border-slate-200 text-xl font-semibold text-slate-800 hover:bg-slate-50"
          onClick={zoomIn}
          aria-label="확대"
          title="확대"
        >
          +
        </button>
        <button
          type="button"
          className="flex size-11 items-center justify-center text-xl font-semibold text-slate-800 hover:bg-slate-50"
          onClick={zoomOut}
          aria-label="축소"
          title="축소"
        >
          -
        </button>
      </div>
    </div>
  );
}
