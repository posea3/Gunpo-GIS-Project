import type { BuiltInLocationCategory, LocationCategory } from './location';

export type LocationFieldType = 'text' | 'textarea' | 'number' | 'date' | 'url';
export type SectionGeometryKind = 'point' | 'area' | 'mixed';

export interface LocationSection {
  id: string;
  groupId: string | null;
  key: string;
  label: string;
  baseCategory: BuiltInLocationCategory;
  geometryKind: SectionGeometryKind;
  requiresStatus: boolean;
  description: string | null;
  color: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationSectionField {
  id: string;
  sectionId: string;
  fieldKey: string;
  label: string;
  fieldType: LocationFieldType;
  isRequired: boolean;
  helpText: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationSectionWithFields extends LocationSection {
  fields: LocationSectionField[];
}

export type SectionByCategory = Partial<
  Record<LocationCategory, LocationSectionWithFields>
>;

export interface LocationSectionDbRow {
  id: string;
  group_id?: string | null;
  key: string;
  label: string;
  base_category?: BuiltInLocationCategory | null;
  geometry_kind?: SectionGeometryKind | null;
  requires_status?: boolean | null;
  description: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LocationSectionFieldDbRow {
  id: string;
  section_id: string;
  field_key: string;
  label: string;
  field_type: LocationFieldType;
  is_required: boolean;
  help_text: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
