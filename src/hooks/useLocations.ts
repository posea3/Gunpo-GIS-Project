import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { Location } from '../types/location';
import type { LocationViewport } from '../types/locationViewport';
import { parseLocationRows, type InvalidLocationRow } from '../utils/geojson';
import type { AuthRoleState } from './useAuthRole';

interface UseLocationsState {
  locations: Location[];
  invalidRows: InvalidLocationRow[];
  isLoading: boolean;
  errorMessage: string | null;
  revision: number;
}

const initialState: UseLocationsState = {
  locations: [],
  invalidRows: [],
  isLoading: false,
  errorMessage: null,
  revision: 0,
};

const authenticatedRoleResolutionDelayMs = 300;

const locationSelectColumns = [
  'id',
  'name',
  'category',
  'status',
  'section_id',
  'is_published',
  'source_name',
  'source_url',
  'source_date',
  'details',
  'geojson',
  'created_by',
  'updated_by',
  'updated_at',
];

const legacyLocationSelectColumns = locationSelectColumns.filter(
  (column) => column !== 'section_id',
);

export function useLocations(
  authRole: AuthRoleState,
  viewport: LocationViewport | null,
) {
  const [state, setState] = useState<UseLocationsState>(initialState);
  const requestSequence = useRef(0);
  const previousAccessScope = useRef<'none' | 'public' | 'admin'>('none');
  const accessScope = getLocationAccessScope(authRole);
  const fetchDelayMs =
    authRole.status === 'authenticated'
      ? authenticatedRoleResolutionDelayMs
      : 0;

  const fetchLocations = useCallback(
    async (requestId: number, nextViewport: LocationViewport) => {
      if (supabase === null) {
        setState((current) => ({
          locations: [],
          invalidRows: [],
          isLoading: false,
          errorMessage: 'Supabase 환경변수 설정을 확인하세요.',
          revision: current.revision,
        }));
        return;
      }

      const { data, error } = await fetchLocationRows(
        locationSelectColumns.join(','),
        nextViewport,
      );

      const response =
        error !== null && isMissingSectionIdError(error.message)
          ? await fetchLocationRows(
              legacyLocationSelectColumns.join(','),
              nextViewport,
            )
          : { data, error };

      if (requestSequence.current !== requestId) {
        return;
      }

      if (response.error) {
        setState((current) => ({
          locations: [],
          invalidRows: [],
          isLoading: false,
          errorMessage: '위치 정보를 불러오지 못했습니다.',
          revision: current.revision,
        }));
        return;
      }

      const parsed = parseLocationRows(response.data ?? []);

      if (requestSequence.current !== requestId) {
        return;
      }

      setState((current) => ({
        locations: parsed.locations,
        invalidRows: parsed.invalidRows,
        isLoading: false,
        errorMessage: null,
        revision: current.revision + 1,
      }));
    },
    [],
  );

  const refetch = useCallback(() => {
    if (accessScope === 'none' || viewport === null) {
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    setState((current) => ({
      ...current,
      isLoading: true,
      errorMessage: null,
    }));

    const timeoutId = window.setTimeout(() => {
      void fetchLocations(requestId, viewport);
    }, fetchDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [accessScope, fetchDelayMs, fetchLocations, viewport]);

  useEffect(() => {
    const previousScope = previousAccessScope.current;
    previousAccessScope.current = accessScope;

    if (accessScope === 'none') {
      requestSequence.current += 1;
      setState(initialState);
      return;
    }

    if (viewport === null) {
      return;
    }

    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    setState((current) => ({
      ...current,
      // Published rows are safe to keep while an admin-only refresh adds drafts.
      // On privilege loss, immediately clear any previously loaded admin drafts.
      locations:
        previousScope === 'admin' && accessScope === 'public'
          ? []
          : current.locations,
      invalidRows:
        previousScope === 'admin' && accessScope === 'public'
          ? []
          : current.invalidRows,
      isLoading: true,
      errorMessage: null,
    }));

    void fetchLocations(requestId, viewport);
  }, [accessScope, fetchLocations, viewport]);

  return {
    ...state,
    refetch,
  };
}

function getLocationAccessScope(authRole: AuthRoleState) {
  if (authRole.status === 'admin') {
    return 'admin' as const;
  }

  if (
    authRole.status === 'anonymous' ||
    authRole.status === 'authenticated'
  ) {
    return 'public' as const;
  }

  return 'none' as const;
}

async function fetchLocationRows(
  selectColumns: string,
  viewport: LocationViewport,
) {
  if (supabase === null) {
    return {
      data: null,
      error: new Error('Supabase client is not initialized.'),
    };
  }

  const response = await supabase
    .rpc('get_locations_in_bounds', {
      p_west: viewport.west,
      p_south: viewport.south,
      p_east: viewport.east,
      p_north: viewport.north,
    })
    .select(selectColumns);

  if (!isMissingViewportFunctionError(response.error?.message ?? '')) {
    return response;
  }

  return supabase
    .from('locations')
    .select(selectColumns)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .order('updated_at', { ascending: false });
}

function isMissingSectionIdError(message: string) {
  return (
    message.includes('section_id') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

function isMissingViewportFunctionError(message: string) {
  return (
    message.includes('get_locations_in_bounds') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}
