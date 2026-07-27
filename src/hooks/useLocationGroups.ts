import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LocationGroup, LocationGroupDbRow } from '../types/group';
import type { AuthRoleState } from './useAuthRole';

export function useLocationGroups(authRole: AuthRoleState) {
  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const refetch = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    const canRead = authRole.status === 'anonymous' || authRole.status === 'authenticated' || authRole.status === 'admin';
    const request = requestRef.current + 1;
    requestRef.current = request;
    if (!canRead || supabase === null) { setGroups([]); setIsLoading(false); return; }
    setIsLoading(true); setErrorMessage(null);
    void supabase.from('location_groups').select('*').order('sort_order', { ascending: true }).then(({ data, error }) => {
      if (requestRef.current !== request) return;
      if (error !== null) { setGroups([]); setErrorMessage(error.message); setIsLoading(false); return; }
      setGroups((data as LocationGroupDbRow[]).map((row) => ({ id: row.id, key: row.key, label: row.label, color: row.color, isActive: row.is_active, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at })));
      setIsLoading(false);
    });
  }, [authRole.status, reloadKey]);
  return { groups, isLoading, errorMessage, refetch };
}
