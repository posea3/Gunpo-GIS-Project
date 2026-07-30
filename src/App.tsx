import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FolderTree,
  ListFilter,
  LogIn,
  LogOut,
  Pencil,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

import { useAuthRole } from './hooks/useAuthRole';
import { useLocations } from './hooks/useLocations';
import { useLocationSections } from './hooks/useLocationSections';
import { useLocationGroups } from './hooks/useLocationGroups';
import { supabase, supabaseConfigState, vworldApiKey } from './lib/supabase';
import { GunpoMap } from './map/GunpoMap';
import type {
  Location,
  LocationCreateDraft,
  LocationInsertInput,
  LocationPhotoUpload,
  LocationUpdateInput,
} from './types/location';
import type { SectionByCategory } from './types/section';
import {
  areLocationViewportsEqual,
  doesGeometryIntersectViewport,
  type LocationViewport,
} from './types/locationViewport';
import { getLocationPhotoUrls } from './utils/locationPhotos';
import {
  isCompleteLocationInput,
  prepareLocationWriteInput,
  toLocationWritePayload,
} from './utils/locationPersistence';
import { geocodeVworldAddress } from './utils/vworld';

const BulkLocationImportModal = lazy(() =>
  import('./components/BulkLocationImportModal').then((module) => ({
    default: module.BulkLocationImportModal,
  })),
);

const ConfirmDeleteModal = lazy(() =>
  import('./components/ConfirmDeleteModal').then((module) => ({
    default: module.ConfirmDeleteModal,
  })),
);
const GroupManagerModal = lazy(() =>
  import('./components/GroupManagerModal').then((module) => ({
    default: module.GroupManagerModal,
  })),
);
const LocationDetailModal = lazy(() =>
  import('./components/LocationDetailModal').then((module) => ({
    default: module.LocationDetailModal,
  })),
);
const LocationEditModal = lazy(() =>
  import('./components/LocationEditModal').then((module) => ({
    default: module.LocationEditModal,
  })),
);
const LoginModal = lazy(() =>
  import('./components/LoginModal').then((module) => ({
    default: module.LoginModal,
  })),
);
const SectionManagerModal = lazy(() =>
  import('./components/SectionManagerModal').then((module) => ({
    default: module.SectionManagerModal,
  })),
);

const initialLocationListPageSize = 50;

export function App() {
  const { authRole, signOut } = useAuthRole();
  const [locationViewport, setLocationViewport] =
    useState<LocationViewport | null>(null);
  const {
    locations,
    invalidRows,
    isLoading: isLocationsLoading,
    errorMessage: locationsErrorMessage,
    revision,
    refetch,
  } = useLocations(authRole, locationViewport);
  const {
    sections,
    sectionsByCategory,
    isLoading: isSectionsLoading,
    errorMessage: sectionsErrorMessage,
    refetch: refetchSections,
  } = useLocationSections(authRole);
  const { groups, refetch: refetchGroups } = useLocationGroups(authRole);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSectionManagerOpen, setIsSectionManagerOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');
  const [panelLocationScope, setPanelLocationScope] = useState<
    'viewport' | 'filter'
  >('viewport');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelRightEdge, setPanelRightEdge] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 372 : 0,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [externalCreateDraft, setExternalCreateDraft] =
    useState<LocationCreateDraft | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const handleViewportChange = useCallback((nextViewport: LocationViewport) => {
    setLocationViewport((currentViewport) =>
      areLocationViewportsEqual(currentViewport, nextViewport)
        ? currentViewport
        : nextViewport,
    );
  }, []);
  const isAdmin = authRole.status === 'admin' && authRole.isAdmin;
  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const groupFilters = useMemo(
    () => [{ value: 'all', label: '전체' }, ...groups.filter((group) => group.isActive).map((group) => ({ value: group.id, label: group.label }))],
    [groups],
  );
  const sectionFilters = useMemo(
    () => [
      { value: 'all', label: '전체' },
      ...sections
        .filter((section) => section.isActive && (selectedGroupFilter === 'all' || section.groupId === selectedGroupFilter))
        .map((section) => ({ value: section.id, label: section.label })),
    ],
    [sections, selectedGroupFilter],
  );
  const visibleLocations = useMemo(
    () =>
      selectedSectionFilter === 'all'
        ? locations
        : locations.filter((location) =>
          matchesSectionFilter(location, selectedSectionFilter, sectionById),
        ),
    [locations, sectionById, selectedSectionFilter],
  );
  const filteredLocations = useMemo(() => selectedGroupFilter === 'all' ? visibleLocations : visibleLocations.filter((location) => sectionById.get(location.sectionId ?? '')?.groupId === selectedGroupFilter), [visibleLocations, selectedGroupFilter, sectionById]);
  const viewportFilteredLocations = useMemo(
    () =>
      filteredLocations.filter((location) =>
        doesGeometryIntersectViewport(location.geometry, locationViewport),
      ),
    [filteredLocations, locationViewport],
  );
  const panelLocations =
    panelLocationScope === 'viewport'
      ? viewportFilteredLocations
      : filteredLocations;

  useEffect(() => {
    if (!isAdmin) {
      setSelectedLocation(null);
      setEditingLocation(null);
      setDeletingLocation(null);
      setIsSectionManagerOpen(false);
      setIsGroupManagerOpen(false);
      setIsBulkImportOpen(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (searchMessage === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSearchMessage(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [searchMessage]);

  useEffect(() => {
    const panelElement = panelRef.current;

    if (!isPanelOpen || panelElement === null) {
      setPanelRightEdge(0);
      return;
    }

    const updatePanelEdge = () => {
      setPanelRightEdge(panelElement.getBoundingClientRect().right);
    };

    updatePanelEdge();

    const resizeObserver = new ResizeObserver(updatePanelEdge);
    resizeObserver.observe(panelElement);
    window.addEventListener('resize', updatePanelEdge);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePanelEdge);
    };
  }, [isPanelOpen]);

  const handleLogout = async () => {
    setSelectedLocation(null);
    setIsLoginOpen(false);
    await signOut();
    refetch();
  };

  const handleAddressSearch = async () => {
    const query = searchQuery.trim();

    if (query.length === 0 || isSearching) {
      return;
    }

    if (!isAdmin) {
      setSearchMessage('주소 검색 등록은 관리자 로그인 후 사용할 수 있습니다.');
      return;
    }

    if (vworldApiKey === null) {
      setSearchMessage('VWorld API 키가 없어 주소 검색을 사용할 수 없습니다.');
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);

    try {
      const result = await geocodeVworldAddress(query, vworldApiKey);

      if (result === null) {
        setSearchMessage('검색 결과가 없습니다.');
        return;
      }

      setExternalCreateDraft({
        name: result.title,
        details: {
          주소: result.address,
        },
        geometry: result.geometry,
      });
      setSearchMessage(`${result.title} 위치로 등록 창을 열었습니다.`);
    } catch {
      setSearchMessage('주소 검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleEditSave = async (
    input: LocationInsertInput | LocationUpdateInput,
    photoUploads: readonly LocationPhotoUpload[],
  ) => {
    if (
      editingLocation === null ||
      isEditSaving ||
      !isAdmin ||
      !isCompleteLocationInput(input)
    ) {
      return;
    }

    setIsEditSaving(true);
    setEditErrorMessage(null);

    try {
      if (supabase === null) {
        setEditErrorMessage('Supabase 환경변수 설정을 확인하세요.');
        return;
      }

      const inputWithPhotos = await prepareLocationWriteInput(
        input,
        photoUploads,
        supabase,
      );
      const { error } = await supabase
        .from('locations')
        .update(toLocationWritePayload(inputWithPhotos))
        .eq('id', editingLocation.id);

      if (error) {
        setEditErrorMessage(`수정에 실패했습니다: ${error.message}`);
        return;
      }

      setEditingLocation(null);
      setSelectedLocation(null);
      refetch();
    } catch (error) {
      setEditErrorMessage(
        error instanceof Error
          ? error.message
          : '수정 처리 중 알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deletingLocation === null || isDeleting || !isAdmin) {
      return;
    }

    setIsDeleting(true);

    try {
      if (supabase === null) {
        return;
      }

      await supabase.from('locations').delete().eq('id', deletingLocation.id);
      setDeletingLocation(null);
      setSelectedLocation(null);
      refetch();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="z-[700] flex h-[60px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="군포시 로고"
            className="h-11 w-[58px] rounded-sm object-cover"
          />
          <div className="hidden leading-tight sm:block">
            <p className="text-base font-bold text-slate-950">군포시 GIS 프로젝트</p>
            <p className="text-xs text-slate-500">재건축 · 개발 호재 · 맛집관광</p>
          </div>
        </div>

        <form
          className="hidden min-w-[260px] max-w-lg flex-1 items-center gap-2 md:flex"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAddressSearch();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">주소 검색</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="군포시 주소 검색 후 위치 등록"
              type="search"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
            disabled={isSearching}
          >
            {isSearching ? '검색 중' : '검색'}
          </button>
        </form>

        <div className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-2">
            <AuthStatusBadge status={authRole.status} />
            {authRole.session === null ? (
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => setIsLoginOpen(true)}
              >
                <LogIn className="size-4" />
                로그인
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" />
                로그아웃
              </button>
            )}
        </div>
      </header>

      <section className="relative min-h-0 flex-1">
        <GunpoMap
            locations={filteredLocations}
            revision={revision}
            isAdmin={isAdmin}
            authStatus={authRole.status}
            onSelectLocation={setSelectedLocation}
            refetch={refetch}
            panelOffset={panelRightEdge}
            externalCreateDraft={externalCreateDraft}
            onExternalCreateConsumed={() => setExternalCreateDraft(null)}
            sections={sections}
            sectionsByCategory={sectionsByCategory}
            onViewportChange={handleViewportChange}
        />

        <div className="pointer-events-none absolute left-3 top-3 z-[650] flex flex-wrap gap-2">
          <div className="pointer-events-auto hidden gap-2 rounded-md border border-slate-200 bg-white p-1 shadow-md md:flex">
            {groupFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`h-8 rounded px-3 text-sm font-medium ${
                  selectedGroupFilter === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => { setSelectedGroupFilter(filter.value); setSelectedSectionFilter('all'); setIsPanelOpen(true); }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {selectedGroupFilter !== 'all' ? <div className="pointer-events-auto hidden gap-2 rounded-md border border-slate-200 bg-white p-1 shadow-md md:flex">{sectionFilters.map((filter) => <button key={filter.value} type="button" className={`h-8 rounded px-3 text-sm font-medium ${selectedSectionFilter === filter.value ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`} onClick={() => onFilterClick(filter.value, setSelectedSectionFilter, setIsPanelOpen)}>{filter.label}</button>)}</div> : null}
        </div>

        <button
          type="button"
          className={`absolute top-1/2 z-[670] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-slate-200 bg-white text-slate-700 shadow-md hover:bg-slate-50 ${
            isPanelOpen ? 'left-0 md:left-[372px]' : 'left-0'
          }`}
          onClick={() => setIsPanelOpen((current) => !current)}
          aria-label={isPanelOpen ? '목록 닫기' : '목록 열기'}
          title={isPanelOpen ? '목록 닫기' : '목록 열기'}
        >
          {isPanelOpen ? (
            <ChevronLeft className="size-5" />
          ) : (
            <ChevronRight className="size-5" />
          )}
        </button>

        {isPanelOpen ? (
          <LocationExplorerPanel
            locations={panelLocations}
            viewportLocationCount={viewportFilteredLocations.length}
            filteredLocationCount={filteredLocations.length}
            locationScope={panelLocationScope}
            allLocationCount={locations.length}
            selectedFilterLabel={getCurrentFilterLabel(
              selectedGroupFilter,
              selectedSectionFilter,
              groupById,
              sectionById,
            )}
            isAdmin={isAdmin}
            isLoading={isLocationsLoading}
            authStatus={authRole.status}
            authErrorMessage={
              supabaseConfigState.status === 'error'
                ? supabaseConfigState.message
                : authRole.status === 'error'
                  ? authRole.message
                  : null
            }
            locationsErrorMessage={locationsErrorMessage}
            invalidRowCount={invalidRows.length}
            onSelectLocation={setSelectedLocation}
            onEditLocation={(location) => {
              setEditErrorMessage(null);
              setEditingLocation(location);
            }}
            onDeleteLocation={setDeletingLocation}
            onOpenSectionManager={() => setIsSectionManagerOpen(true)}
            onOpenGroupManager={() => setIsGroupManagerOpen(true)}
            onOpenBulkImport={() => setIsBulkImportOpen(true)}
            onLocationScopeChange={setPanelLocationScope}
            onClose={() => setIsPanelOpen(false)}
            panelRef={panelRef}
            sectionsByCategory={sectionsByCategory}
          />
        ) : null}

        {supabaseConfigState.status === 'error' ? (
          <EnvironmentErrorPanel
            fields={supabaseConfigState.fields}
            message={supabaseConfigState.message}
            diagnostics={supabaseConfigState.diagnostics}
          />
        ) : null}
        {searchMessage !== null ? (
          <div className="absolute left-1/2 top-14 z-[900] max-w-sm -translate-x-1/2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-lg">
            {searchMessage}
          </div>
        ) : null}
      </section>

      {isLoginOpen ? (
        <Suspense fallback={null}>
          <LoginModal isOpen onClose={() => setIsLoginOpen(false)} />
        </Suspense>
      ) : null}
      {selectedLocation !== null ? (
        <Suspense fallback={null}>
          <LocationDetailModal
            location={selectedLocation}
            sections={sections}
            isAdmin={isAdmin}
            onEdit={
              isAdmin
                ? () => {
                    setEditErrorMessage(null);
                    setEditingLocation(selectedLocation);
                    setSelectedLocation(null);
                  }
                : undefined
            }
            onDelete={
              isAdmin
                ? () => {
                    setDeletingLocation(selectedLocation);
                    setSelectedLocation(null);
                  }
                : undefined
            }
            onClose={() => setSelectedLocation(null)}
          />
        </Suspense>
      ) : null}
      {isGroupManagerOpen ? (
        <Suspense fallback={null}>
          <GroupManagerModal
            isOpen
            groups={groups}
            onChanged={() => {
              refetchGroups();
              refetchSections();
            }}
            onClose={() => setIsGroupManagerOpen(false)}
          />
        </Suspense>
      ) : null}
      {editingLocation !== null ? (
        <Suspense fallback={null}>
          <LocationEditModal
            isOpen
            geometry={editingLocation.geometry}
            location={editingLocation}
            sections={sections}
            sectionsByCategory={sectionsByCategory}
            isSubmitting={isEditSaving}
            submitErrorMessage={editErrorMessage}
            onCancel={() => setEditingLocation(null)}
            onSave={handleEditSave}
          />
        </Suspense>
      ) : null}
      {deletingLocation !== null ? (
        <Suspense fallback={null}>
          <ConfirmDeleteModal
            isOpen
            targetName={deletingLocation.name}
            isDeleting={isDeleting}
            onCancel={() => setDeletingLocation(null)}
            onConfirm={handleDeleteConfirm}
          />
        </Suspense>
      ) : null}
      {isSectionManagerOpen ? (
        <Suspense fallback={null}>
          <SectionManagerModal
            isOpen
            sections={sections}
            groups={groups}
            isLoading={isSectionsLoading}
            errorMessage={sectionsErrorMessage}
            onChanged={refetchSections}
            onClose={() => setIsSectionManagerOpen(false)}
          />
        </Suspense>
      ) : null}
      {isAdmin && isBulkImportOpen ? (
        <Suspense fallback={null}>
          <BulkLocationImportModal
            isOpen
            sections={sections}
            onClose={() => setIsBulkImportOpen(false)}
            onImported={refetch}
          />
        </Suspense>
      ) : null}
    </main>
  );
}

const categoryLabels: Record<string, string> = {
  redevelopment: '재건축',
  development_issue: '개발 호재',
  place: '맛집·관광지',
};

function MapLoadingFallback() {
  return (
    <section className="flex h-full min-h-0 w-full items-center justify-center bg-slate-100">
      <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        지도 준비 중
      </div>
    </section>
  );
}

function LocationExplorerPanel({
  locations,
  viewportLocationCount,
  filteredLocationCount,
  locationScope,
  allLocationCount,
  selectedFilterLabel,
  isAdmin,
  isLoading,
  authStatus,
  authErrorMessage,
  locationsErrorMessage,
  invalidRowCount,
  onSelectLocation,
  onEditLocation,
  onDeleteLocation,
  onOpenSectionManager,
  onOpenGroupManager,
  onOpenBulkImport,
  onLocationScopeChange,
  onClose,
  panelRef,
  sectionsByCategory,
}: {
  locations: readonly Location[];
  viewportLocationCount: number;
  filteredLocationCount: number;
  locationScope: 'viewport' | 'filter';
  allLocationCount: number;
  selectedFilterLabel: string;
  isAdmin: boolean;
  isLoading: boolean;
  authStatus: string;
  authErrorMessage: string | null;
  locationsErrorMessage: string | null;
  invalidRowCount: number;
  onSelectLocation: (location: Location) => void;
  onEditLocation: (location: Location) => void;
  onDeleteLocation: (location: Location) => void;
  onOpenSectionManager: () => void;
  onOpenGroupManager: () => void;
  onOpenBulkImport: () => void;
  onLocationScopeChange: (scope: 'viewport' | 'filter') => void;
  onClose: () => void;
  panelRef: RefObject<HTMLElement>;
  sectionsByCategory: SectionByCategory;
}) {
  const [visibleLocationCount, setVisibleLocationCount] = useState(
    initialLocationListPageSize,
  );
  const visibleLocations = locations.slice(0, visibleLocationCount);
  const hasMoreLocations = visibleLocations.length < locations.length;

  useEffect(() => {
    setVisibleLocationCount(initialLocationListPageSize);
  }, [locations]);

  return (
    <aside
      ref={panelRef}
      className="absolute inset-x-3 bottom-3 z-[640] flex max-h-[46vh] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl md:bottom-auto md:left-3 md:right-auto md:top-[60px] md:h-[calc(100%-76px)] md:max-h-none md:w-[360px]"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <ListFilter className="size-3.5" />
              Locations
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">
              군포 지역 정보
            </h2>
          </div>
          {isAdmin ? (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              전체 {allLocationCount}개
            </span>
          ) : null}
          <button
            type="button"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:hidden"
            onClick={onClose}
            aria-label="목록 닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          현재 필터: {selectedFilterLabel}
        </p>

        <div
          className="mt-3 grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1"
          role="tablist"
          aria-label="Location list range"
        >
          <button
            type="button"
            role="tab"
            aria-selected={locationScope === 'viewport'}
            className={`h-8 rounded px-2 text-xs font-semibold transition-colors ${
              locationScope === 'viewport'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
            onClick={() => onLocationScopeChange('viewport')}
          >
            현재 화면 {viewportLocationCount}개
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={locationScope === 'filter'}
            className={`h-8 rounded px-2 text-xs font-semibold transition-colors ${
              locationScope === 'filter'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
            onClick={() => onLocationScopeChange('filter')}
          >
            현재 필터 전체 {filteredLocationCount}개
          </button>
        </div>

        {isAdmin ? (
          <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
            <p>
              관리자 모드입니다. 지도 오른쪽 도구에서 핀 추가 또는 영역 추가를
              선택하면 위치 입력 창이 열립니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 font-semibold text-blue-800 hover:bg-blue-100" onClick={onOpenGroupManager}><FolderTree className="size-3.5" />분야 관리</button>
              <button
                type="button"
                className="hidden"
                onClick={onOpenSectionManager}
              >
                <Settings2 className="size-3.5" />
                새 섹션
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 font-semibold text-blue-800 hover:bg-blue-100"
                onClick={onOpenSectionManager}
              >
                <Settings2 className="size-3.5" />
                섹션 관리
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 font-semibold text-blue-800 hover:bg-blue-100"
                onClick={onOpenBulkImport}
              >
                <FileSpreadsheet className="size-3.5" />
                엑셀 등록
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {authStatus === 'loading' ? (
            <StatusMessage tone="neutral" message="인증 상태 확인 중" />
          ) : null}
          {authErrorMessage !== null ? (
            <StatusMessage tone="danger" message={authErrorMessage} />
          ) : null}
          {locationsErrorMessage !== null ? (
            <StatusMessage tone="danger" message={locationsErrorMessage} />
          ) : null}
          {invalidRowCount > 0 ? (
            <StatusMessage
              tone="warning"
              message={`검증 제외 ${invalidRowCount}개`}
            />
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-5 text-sm text-slate-500">
            위치 정보를 불러오는 중입니다.
          </p>
        ) : locations.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500">
            표시할 위치 정보가 없습니다.
          </p>
        ) : (
          <>
            <div className="flex justify-end border-b border-slate-100 px-4 py-2">
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                현재 필터 {locations.length}개
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {visibleLocations.map((location) => (
                <li key={location.id} className="location-list-item">
                  <div className="px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      {getLocationPhotoUrls(location.details)[0] !== undefined ? (
                        <img
                          src={getLocationPhotoUrls(location.details)[0]}
                          alt=""
                          className="mt-0.5 size-11 shrink-0 rounded-md object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left focus:outline-none"
                        onClick={() => onSelectLocation(location)}
                      >
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {location.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getCategoryLabel(location.category, sectionsByCategory)}
                          {location.status === null ? '' : ` · ${location.status}`}
                        </p>
                      </button>
                      {isAdmin ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                            aria-label={`${location.name} 수정`}
                            title="수정"
                            onClick={() => onEditLocation(location)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={`${location.name} 삭제`}
                            title="삭제"
                            onClick={() => onDeleteLocation(location)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      ) : null}
                      {!location.isPublished ? (
                        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          초안
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="mt-2 block w-full text-left focus:outline-none"
                      onClick={() => onSelectLocation(location)}
                    >
                      <p className="line-clamp-2 text-xs leading-5 text-slate-600">
                        {summarizeLocation(location)}
                      </p>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {hasMoreLocations ? (
              <div className="border-t border-slate-100 p-3">
                <button
                  type="button"
                  className="h-9 w-full rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() =>
                    setVisibleLocationCount((current) =>
                      Math.min(current + initialLocationListPageSize, locations.length),
                    )
                  }
                >
                  위치 {Math.min(initialLocationListPageSize, locations.length - visibleLocations.length)}개 더 보기
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function summarizeLocation(location: Location) {
  const address = location.details['주소'];

  return typeof address === 'string' ? address.trim() : '';
}

function onFilterClick(
  filterValue: string,
  setSelectedSectionFilter: (filterValue: string) => void,
  setIsPanelOpen: (isOpen: boolean) => void,
) {
  setSelectedSectionFilter(filterValue);
  setIsPanelOpen(true);
}

function getCategoryLabel(
  category: Location['category'],
  sectionsByCategory: SectionByCategory,
) {
  return sectionsByCategory[category]?.label ?? categoryLabels[category];
}

function getCurrentFilterLabel(
  groupFilterValue: string,
  sectionFilterValue: string,
  groupById: ReadonlyMap<string, { label: string }>,
  sectionById: ReadonlyMap<string, { label: string }>,
) {
  if (groupFilterValue === 'all') {
    return sectionFilterValue === 'all'
      ? '전체 분야 / 전체'
      : `전체 분야 / ${sectionById.get(sectionFilterValue)?.label ?? '선택한 섹션'}`;
  }

  const groupLabel = groupById.get(groupFilterValue)?.label ?? '선택한 분야';
  return sectionFilterValue === 'all'
    ? `${groupLabel} / 전체`
    : `${groupLabel} / ${sectionById.get(sectionFilterValue)?.label ?? '선택한 섹션'}`;
}

function matchesSectionFilter(
  location: Location,
  filterValue: string,
  sectionById: ReadonlyMap<
    string,
    { key: string; baseCategory: Location['category'] }
  >,
) {
  if (location.sectionId === filterValue) {
    return true;
  }

  const section = sectionById.get(filterValue);

  if (section === undefined) {
    return false;
  }

  return location.sectionId === null && location.category === section.key;
}

function EnvironmentErrorPanel({
  fields,
  message,
  diagnostics,
}: {
  fields: readonly string[];
  message: string;
  diagnostics: {
    hasUrl: boolean;
    hasAnonKey: boolean;
    anonKeyLength: number;
    anonKeyLooksLikeJwt: boolean;
  };
}) {
  return (
    <div className="absolute inset-x-3 top-[116px] z-[660] rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-md md:left-[380px] md:right-3 md:top-3">
      <p className="font-semibold">환경변수 설정 오류로 데이터 연결을 시작하지 못했습니다.</p>
      <p className="mt-1">
        {message}
      </p>
      <p className="mt-1">
        실패 필드: {fields.length === 0 ? '확인되지 않음' : fields.join(', ')}
      </p>
      <p className="mt-1">
        브라우저 런타임 진단: URL {diagnostics.hasUrl ? '있음' : '없음'},
        anon key {diagnostics.hasAnonKey ? '있음' : '없음'}, anon key 길이{' '}
        {diagnostics.anonKeyLength}, JWT 형태{' '}
        {diagnostics.anonKeyLooksLikeJwt ? '예' : '아니오'}
      </p>
    </div>
  );
}

function AuthStatusBadge({ status }: { status: string }) {
  const label = getAuthStatusLabel(status);

  return (
    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
      {label}
    </span>
  );
}

function StatusMessage({
  tone,
  message,
}: {
  tone: 'neutral' | 'warning' | 'danger';
  message: string;
}) {
  const className =
    tone === 'danger'
      ? 'bg-red-50 text-red-700'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-md px-3 py-1.5 ${className}`}>{message}</span>;
}

function getAuthStatusLabel(status: string) {
  if (status === 'admin') {
    return '관리자';
  }

  if (status === 'authenticated') {
    return '로그인됨';
  }

  if (status === 'loading') {
    return '확인 중';
  }

  if (status === 'error') {
    return '인증 오류';
  }

  return '방문자';
}
