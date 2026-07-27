import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { BuiltInLocationCategory } from '../types/location';
import type { AuthRoleState } from './useAuthRole';
import type {
  LocationFieldType,
  LocationSectionDbRow,
  LocationSectionFieldDbRow,
  LocationSectionWithFields,
  SectionByCategory,
} from '../types/section';

interface LocationSectionsState {
  sections: LocationSectionWithFields[];
  sectionsByCategory: SectionByCategory;
  isLoading: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

const fieldTypes = ['text', 'textarea', 'number', 'date', 'url'] as const;

export function useLocationSections(authRole: AuthRoleState): LocationSectionsState {
  const [sections, setSections] = useState<LocationSectionWithFields[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestSeqRef = useRef(0);
  const previousAccessScope = useRef<'none' | 'public' | 'admin'>('none');
  const accessScope = getSectionAccessScope(authRole);

  const refetch = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const previousScope = previousAccessScope.current;
    previousAccessScope.current = accessScope;

    if (accessScope === 'none') {
      requestSeqRef.current += 1;
      setSections([]);
      setIsLoading(false);
      return;
    }

    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    if (previousScope === 'admin' && accessScope === 'public') {
      setSections([]);
    }
    setIsLoading(true);
    setErrorMessage(null);

    async function loadSections() {
      if (supabase === null) {
        if (requestSeqRef.current === requestSeq) {
          setSections([]);
          setIsLoading(false);
        }
        return;
      }

      const [sectionsResult, fieldsResult] = await Promise.all([
        supabase
          .from('location_sections')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('location_section_fields')
          .select('*')
          .order('sort_order', { ascending: true }),
      ]);

      if (requestSeqRef.current !== requestSeq) {
        return;
      }

      if (sectionsResult.error !== null) {
        setSections([]);
        setErrorMessage(sectionsResult.error.message);
        setIsLoading(false);
        return;
      }

      if (fieldsResult.error !== null) {
        setSections([]);
        setErrorMessage(fieldsResult.error.message);
        setIsLoading(false);
        return;
      }

      setSections(
        mapSectionRows(
          sectionsResult.data as LocationSectionDbRow[],
          fieldsResult.data as LocationSectionFieldDbRow[],
        ),
      );
      setIsLoading(false);
    }

    void loadSections();
  }, [accessScope, reloadKey]);

  const sectionsByCategory = useMemo(() => {
    const nextSectionsByCategory: SectionByCategory = {};

    sections.forEach((section) => {
      nextSectionsByCategory[section.key] = section;
    });

    return nextSectionsByCategory;
  }, [sections]);

  return {
    sections,
    sectionsByCategory,
    isLoading,
    errorMessage,
    refetch,
  };
}

function getSectionAccessScope(authRole: AuthRoleState) {
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

function mapSectionRows(
  sectionRows: readonly LocationSectionDbRow[],
  fieldRows: readonly LocationSectionFieldDbRow[],
) {
  const fieldsBySectionId = new Map<string, LocationSectionFieldDbRow[]>();

  fieldRows.forEach((fieldRow) => {
    if (!isFieldType(fieldRow.field_type)) {
      return;
    }

    const fields = fieldsBySectionId.get(fieldRow.section_id) ?? [];
    fields.push(fieldRow);
    fieldsBySectionId.set(fieldRow.section_id, fields);
  });

  return sectionRows.map((sectionRow) => ({
    id: sectionRow.id,
    groupId: sectionRow.group_id ?? null,
    key: sectionRow.key,
    label: sectionRow.label,
    baseCategory: getBaseCategory(sectionRow),
    geometryKind: getGeometryKind(sectionRow),
    requiresStatus: sectionRow.requires_status ?? sectionRow.key === 'redevelopment',
    description: sectionRow.description,
    color: sectionRow.color,
    isActive: sectionRow.is_active,
    sortOrder: sectionRow.sort_order,
    createdAt: sectionRow.created_at,
    updatedAt: sectionRow.updated_at,
    fields: (fieldsBySectionId.get(sectionRow.id) ?? []).map((fieldRow) => ({
      id: fieldRow.id,
      sectionId: fieldRow.section_id,
      fieldKey: fieldRow.field_key,
      label: fieldRow.label,
      fieldType: fieldRow.field_type,
      isRequired: fieldRow.is_required,
      helpText: fieldRow.help_text,
      sortOrder: fieldRow.sort_order,
      createdAt: fieldRow.created_at,
      updatedAt: fieldRow.updated_at,
    })),
  }));
}

function isFieldType(value: string): value is LocationFieldType {
  return fieldTypes.some((fieldType) => fieldType === value);
}

function getBaseCategory(sectionRow: LocationSectionDbRow): BuiltInLocationCategory {
  if (
    sectionRow.base_category === 'redevelopment' ||
    sectionRow.base_category === 'development_issue' ||
    sectionRow.base_category === 'place'
  ) {
    return sectionRow.base_category;
  }

  if (
    sectionRow.key === 'redevelopment' ||
    sectionRow.key === 'development_issue' ||
    sectionRow.key === 'place'
  ) {
    return sectionRow.key;
  }

  return 'place';
}

function getGeometryKind(sectionRow: LocationSectionDbRow) {
  if (
    sectionRow.geometry_kind === 'point' ||
    sectionRow.geometry_kind === 'area' ||
    sectionRow.geometry_kind === 'mixed'
  ) {
    return sectionRow.geometry_kind;
  }

  if (sectionRow.key === 'redevelopment') {
    return 'area';
  }

  if (sectionRow.key === 'development_issue') {
    return 'mixed';
  }

  return 'point';
}
