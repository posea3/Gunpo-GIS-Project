import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJsonObject } from 'geojson';
import L, { type Layer } from 'leaflet';
import { useMap } from 'react-leaflet';

import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { LocationEditModal } from '../components/LocationEditModal';
import { supabase, vworldApiKey } from '../lib/supabase';
import type {
  Location,
  LocationCreateDraft,
  LocationInsertInput,
  LocationPhotoUpload,
  LocationUpdateInput,
  SupportedGeometry,
} from '../types/location';
import type { LocationSectionWithFields, SectionByCategory } from '../types/section';
import { extractSupportedGeometry } from '../utils/geojson';
import {
  isCompleteLocationInput,
  prepareLocationWriteInput,
  toLocationWritePayload,
} from '../utils/locationPersistence';
import { geocodeVworldAddress, reverseGeocodeVworldPoint } from '../utils/vworld';
import { registerLayerId, resolveLayerId } from './geomanLayerRegistry';
import { ensureGeoman } from './setupLeaflet';

interface GeomanControllerProps {
  isAdmin: boolean;
  locations: readonly Location[];
  refetch: () => void;
  externalCreateDraft?: LocationCreateDraft | null;
  onExternalCreateConsumed?: () => void;
  sections?: readonly LocationSectionWithFields[];
  sectionsByCategory?: SectionByCategory;
}

interface GeoJsonExportLayer extends Layer {
  toGeoJSON(): GeoJsonObject;
}

interface PendingCreate {
  layer: Layer | null;
  geometry: SupportedGeometry;
  initialLocation?: Partial<LocationInsertInput>;
}

interface PendingDelete {
  id: string;
  location: Location;
}

type GeomanMap = L.Map & { pm?: L.PM.PMMap };

export function GeomanController({
  isAdmin,
  locations,
  refetch,
  externalCreateDraft = null,
  onExternalCreateConsumed,
  sections = [],
  sectionsByCategory = {},
}: GeomanControllerProps) {
  const map = useMap() as GeomanMap;
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [isCreateSaving, setIsCreateSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [isGeomanReady, setIsGeomanReady] = useState(false);
  const pendingCreateLayerRef = useRef<Layer | null>(null);
  const editSnapshotsRef = useRef(new WeakMap<Layer, SupportedGeometry>());
  const updatingLayerIdsRef = useRef(new Set<string>());
  const isMountedRef = useRef(true);

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const removePendingCreateLayer = useCallback(() => {
    const layer = pendingCreateLayerRef.current;

    if (layer !== null) {
      layer.remove();
      pendingCreateLayerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || externalCreateDraft === null || pendingCreate !== null) {
      return;
    }

    setCreateErrorMessage(null);
    setPendingCreate({
      layer: null,
      geometry: externalCreateDraft.geometry,
      initialLocation: {
        name: externalCreateDraft.name,
        details: externalCreateDraft.details,
      },
    });
    onExternalCreateConsumed?.();
  }, [externalCreateDraft, isAdmin, onExternalCreateConsumed, pendingCreate]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!isAdmin) {
      setIsGeomanReady(false);
      return () => {
        isActive = false;
      };
    }

    ensureGeoman()
      .then(() => {
        if (isActive) {
          setIsGeomanReady(true);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsGeomanReady(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin]);

  const updateEditedLayer = useCallback(
    async (layer: Layer) => {
      const id = resolveLayerId(layer);

      if (id === null || updatingLayerIdsRef.current.has(id)) {
        refetch();
        return;
      }

      if (!isSupportedEditLayer(layer)) {
        refetch();
        return;
      }

      const nextGeometry = safelyExtractGeometry(layer);
      const previousGeometry =
        editSnapshotsRef.current.get(layer) ?? locationById.get(id)?.geometry;

      if (nextGeometry === null || previousGeometry === undefined) {
        refetch();
        return;
      }

      if (sameGeometry(previousGeometry, nextGeometry)) {
        return;
      }

      updatingLayerIdsRef.current.add(id);

      if (supabase === null) {
        updatingLayerIdsRef.current.delete(id);
        refetch();
        return;
      }

      const { error } = await supabase
        .from('locations')
        .update({ geojson: nextGeometry })
        .eq('id', id);

      updatingLayerIdsRef.current.delete(id);

      if (!isMountedRef.current) {
        return;
      }

      if (error) {
        refetch();
        return;
      }

      refetch();
    },
    [locationById, refetch],
  );

  useEffect(() => {
    if (isAdmin && !isGeomanReady) {
      return;
    }

    if (map.pm === undefined) {
      if (!isAdmin) {
        map.options.pmIgnore = true;
        return;
      }

      map.options.pmIgnore = false;
      L.PM.reInitLayer(map);

      if (map.pm === undefined) {
        return;
      }
    }

    if (!isAdmin) {
      map.pm.removeControls();
      map.options.pmIgnore = true;
      setPendingCreate(null);
      setPendingDelete(null);
      removePendingCreateLayer();
      return;
    }

    map.options.pmIgnore = false;

    const handleCreate: L.PM.CreateEventHandler = (event) => {
      if (pendingCreateLayerRef.current !== null) {
        event.layer.remove();
        return;
      }

      if (!isSupportedCreateLayer(event.layer)) {
        event.layer.remove();
        return;
      }

      const geometry = safelyExtractGeometry(event.layer);

      if (
        geometry === null ||
        (geometry.type !== 'Point' && geometry.type !== 'Polygon')
      ) {
        event.layer.remove();
        return;
      }

      event.layer.options.pmIgnore = false;
      L.PM.reInitLayer(event.layer);
      pendingCreateLayerRef.current = event.layer;
      map.pm.disableDraw();
      setCreateErrorMessage(null);
      setPendingCreate({ layer: event.layer, geometry });

      if (geometry.type === 'Point' && vworldApiKey !== null) {
        const [longitude, latitude] = geometry.coordinates;

        void reverseGeocodeVworldPoint(longitude, latitude, vworldApiKey).then((address) => {
          if (!isMountedRef.current || address === null || pendingCreateLayerRef.current !== event.layer) {
            return;
          }

          setPendingCreate((current) => {
            if (current === null || current.layer !== event.layer) {
              return current;
            }

            return {
              ...current,
              initialLocation: {
                ...current.initialLocation,
                details: { 주소: address },
              },
            };
          });
        });
      }
    };

    const handleEditStart: L.PM.EnableEventHandler = (event) => {
      const id = resolveLayerId(event.layer);

      if (id === null || !isSupportedEditLayer(event.layer)) {
        return;
      }

      const geometry = safelyExtractGeometry(event.layer);

      if (geometry !== null) {
        editSnapshotsRef.current.set(event.layer, geometry);
      }
    };

    const handleUpdate: L.PM.UpdateEventHandler = (event) => {
      void updateEditedLayer(event.layer);
    };

    const handleRemove: L.PM.RemoveEventHandler = (event) => {
      if (pendingDelete !== null || isDeleting) {
        refetch();
        return;
      }

      const id = resolveLayerId(event.layer);

      if (id === null) {
        refetch();
        return;
      }

      const location = locationById.get(id);

      if (location === undefined) {
        refetch();
        return;
      }

      setPendingDelete({ id, location });
    };

    map.on('pm:create', handleCreate);
    map.on('pm:enable', handleEditStart);
    map.on('pm:update', handleUpdate);
    map.on('pm:remove', handleRemove);

    return () => {
      map.off('pm:create', handleCreate);
      map.off('pm:enable', handleEditStart);
      map.off('pm:update', handleUpdate);
      map.off('pm:remove', handleRemove);
      map.pm.disableDraw();
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalRemovalMode();
      map.pm.removeControls();
      removePendingCreateLayer();
    };
  }, [
    isAdmin,
    isGeomanReady,
    isDeleting,
    locationById,
    map,
    pendingDelete,
    refetch,
    removePendingCreateLayer,
    updateEditedLayer,
  ]);

  const handleCreateCancel = useCallback(() => {
    removePendingCreateLayer();
    setPendingCreate(null);
    refetch();
  }, [refetch, removePendingCreateLayer]);

  const handleCreateSave = useCallback(
    async (
      input: LocationInsertInput | LocationUpdateInput,
      photoUploads: readonly LocationPhotoUpload[],
    ) => {
      if (
        pendingCreate === null ||
        isCreateSaving ||
        !isCompleteLocationInput(input)
      ) {
        return;
      }

      setIsCreateSaving(true);
      setCreateErrorMessage(null);

      try {
        if (supabase === null) {
          setCreateErrorMessage('Supabase 환경변수 설정을 확인하세요.');
          return;
        }

        const inputWithPhotos = await prepareLocationWriteInput(
          input,
          photoUploads,
          supabase,
        );
        const resolvedInput = await resolveAddressGeometry(inputWithPhotos);

        if (!resolvedInput.success) {
          setCreateErrorMessage(resolvedInput.message);
          return;
        }

        const { error } = await supabase
          .from('locations')
          .insert(toLocationWritePayload(resolvedInput.input));

        if (!isMountedRef.current) {
          return;
        }

        if (error) {
          setCreateErrorMessage(`저장에 실패했습니다: ${error.message}`);
          return;
        }

        removePendingCreateLayer();
        setPendingCreate(null);
        refetch();
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }

        setCreateErrorMessage(
          error instanceof Error
            ? `저장 처리 중 오류가 발생했습니다: ${error.message}`
            : '저장 처리 중 알 수 없는 오류가 발생했습니다.',
        );
      } finally {
        if (isMountedRef.current) {
          setIsCreateSaving(false);
        }
      }
    },
    [
      isCreateSaving,
      pendingCreate,
      refetch,
      removePendingCreateLayer,
    ],
  );

  const handleDeleteCancel = useCallback(() => {
    setPendingDelete(null);
    refetch();
  }, [refetch]);

  const handleDeleteConfirm = useCallback(async () => {
    if (pendingDelete === null || isDeleting) {
      return;
    }

    setIsDeleting(true);

    if (supabase === null) {
      setIsDeleting(false);
      setPendingDelete(null);
      refetch();
      return;
    }

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', pendingDelete.id);

    if (!isMountedRef.current) {
      return;
    }

    setIsDeleting(false);
    setPendingDelete(null);
    refetch();

    if (error) {
      return;
    }
  }, [isDeleting, pendingDelete, refetch]);

  return (
    <>
      {pendingCreate !== null ? (
        <LocationEditModal
          isOpen
          geometry={pendingCreate.geometry}
          initialLocation={pendingCreate.initialLocation}
          sections={sections}
          sectionsByCategory={sectionsByCategory}
          isSubmitting={isCreateSaving}
          submitErrorMessage={createErrorMessage}
          onCancel={handleCreateCancel}
          onSave={handleCreateSave}
        />
      ) : null}

      <ConfirmDeleteModal
        isOpen={pendingDelete !== null}
        targetName={pendingDelete?.location.name ?? ''}
        isDeleting={isDeleting}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

async function resolveAddressGeometry(
  input: LocationInsertInput,
): Promise<
  | { success: true; input: LocationInsertInput }
  | { success: false; message: string }
> {
  const address = getAddressFromDetails(input.details);

  if (
    input.geometry.type !== 'Point' ||
    address === null
  ) {
    return { success: true, input };
  }

  if (vworldApiKey === null) {
    return {
      success: false,
      message: '주소 기준 위치를 잡으려면 VWorld API 키가 필요합니다.',
    };
  }

  const geocodeResult = await geocodeVworldAddress(address, vworldApiKey);

  if (geocodeResult === null) {
    return {
      success: false,
      message: '입력한 주소를 찾지 못했습니다. 주소를 확인하거나 비워두세요.',
    };
  }

  return {
    success: true,
    input: {
      ...input,
      geometry: geocodeResult.geometry,
    },
  };
}

function getAddressFromDetails(details: Record<string, unknown>) {
  const address = details['주소'];
  return typeof address === 'string' && address.trim().length > 0
    ? address.trim()
    : null;
}


function isSupportedCreateLayer(layer: Layer): layer is L.Marker | L.Polygon {
  return layer instanceof L.Marker || layer instanceof L.Polygon;
}

function isSupportedEditLayer(layer: Layer): layer is L.Marker | L.Polygon {
  return layer instanceof L.Marker || layer instanceof L.Polygon;
}

function safelyExtractGeometry(layer: L.Marker | L.Polygon) {
  try {
    return extractSupportedGeometry(layer as GeoJsonExportLayer);
  } catch {
    return null;
  }
}

function sameGeometry(
  previousGeometry: SupportedGeometry,
  nextGeometry: SupportedGeometry,
) {
  return JSON.stringify(previousGeometry) === JSON.stringify(nextGeometry);
}
