import type { Feature, MultiPolygon, Point, Polygon } from 'geojson';

export type BuiltInLocationCategory =
  | 'redevelopment'
  | 'development_issue'
  | 'place';

export type LocationCategory = string;

export type RedevelopmentStatus =
  | '추진위승인'
  | '조합설립'
  | '사업시행인가'
  | '관리처분인가'
  | '착공'
  | '준공';

export type SupportedGeometry = Point | Polygon | MultiPolygon;

export interface LocationFeatureProperties {
  id: string;
  category: LocationCategory;
  status: RedevelopmentStatus | null;
  is_published: boolean;
}

interface LocationBase {
  id: string;
  name: string;
  category: LocationCategory;
  sectionId: string | null;
  isPublished: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceDate: string | null;
  details: Record<string, unknown>;
  geometry: SupportedGeometry;
  createdBy: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PlaceLocation extends LocationBase {
  category: 'place';
  status: null;
  geometry: Point;
}

export interface RedevelopmentLocation extends LocationBase {
  category: 'redevelopment';
  status: RedevelopmentStatus;
  geometry: Polygon | MultiPolygon;
}

export interface DevelopmentIssueLocation extends LocationBase {
  category: 'development_issue';
  status: null;
  geometry: Point | Polygon | MultiPolygon;
}

export interface CustomSectionLocation extends LocationBase {
  category: string;
  status: RedevelopmentStatus | null;
  geometry: SupportedGeometry;
}

export type Location =
  | PlaceLocation
  | RedevelopmentLocation
  | DevelopmentIssueLocation
  | CustomSectionLocation;

export interface LocationDbRow {
  id: string;
  name: string;
  category: LocationCategory;
  status: RedevelopmentStatus | null;
  section_id?: string | null;
  is_published: boolean;
  source_name: string | null;
  source_url: string | null;
  source_date: string | null;
  details: Record<string, unknown>;
  geojson: SupportedGeometry;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
}

type LocationEditableFields =
  | 'name'
  | 'category'
  | 'sectionId'
  | 'status'
  | 'isPublished'
  | 'sourceName'
  | 'sourceUrl'
  | 'sourceDate'
  | 'details'
  | 'geometry';

export type LocationInsertInput = Pick<Location, LocationEditableFields>;

export type LocationUpdateInput = Partial<LocationInsertInput>;

export type LocationFeature = Feature<SupportedGeometry, LocationFeatureProperties>;

export interface LocationCreateDraft {
  geometry: SupportedGeometry;
  name?: string;
  details?: Record<string, unknown>;
}

export interface LocationPhotoUpload {
  file: File;
}
