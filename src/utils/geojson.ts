import type {
  Feature,
  GeoJsonObject,
  Geometry,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson';
import type { Layer } from 'leaflet';
import { z } from 'zod';

import type {
  Location,
  LocationCategory,
  LocationDbRow,
  LocationFeature,
  LocationFeatureProperties,
  RedevelopmentStatus,
  SupportedGeometry,
} from '../types/location';

const GUNPO_BOUNDS = {
  minLongitude: 126.85,
  maxLongitude: 127.05,
  minLatitude: 37.25,
  maxLatitude: 37.45,
};

const redevelopmentStatuses = [
  '추진위승인',
  '조합설립',
  '사업시행인가',
  '관리처분인가',
  '착공',
  '준공',
] as const satisfies readonly RedevelopmentStatus[];

const finiteNumberSchema = z
  .number()
  .finite()
  .refine((value) => !Number.isNaN(value), 'Coordinate must not be NaN.');

const positionSchema = z
  .tuple([finiteNumberSchema, finiteNumberSchema])
  .rest(finiteNumberSchema)
  .superRefine(([longitude, latitude], context) => {
    if (
      longitude < GUNPO_BOUNDS.minLongitude ||
      longitude > GUNPO_BOUNDS.maxLongitude
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Longitude is outside the supported Gunpo bounds.',
      });
    }

    if (
      latitude < GUNPO_BOUNDS.minLatitude ||
      latitude > GUNPO_BOUNDS.maxLatitude
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latitude is outside the supported Gunpo bounds.',
      });
    }
  });

const linearRingSchema = z.array(positionSchema).superRefine((ring, context) => {
  if (ring.length < 4) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Polygon linear rings must contain at least four positions.',
    });
    return;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Polygon linear rings must be closed.',
    });
  }
});

const pointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
}) satisfies z.ZodType<Point>;

const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRingSchema).nonempty(),
}) satisfies z.ZodType<Polygon>;

const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(linearRingSchema).nonempty()).nonempty(),
}) satisfies z.ZodType<MultiPolygon>;

const supportedGeometrySchema = z.discriminatedUnion('type', [
  pointGeometrySchema,
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
]);

const locationDbRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    category: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
    status: z.enum(redevelopmentStatuses).nullable(),
    section_id: z.string().uuid().nullable().optional(),
    is_published: z.boolean(),
    source_name: z.string().max(200).nullable(),
    source_url: z
      .string()
      .max(2000)
      .regex(/^https?:\/\//i)
      .nullable(),
    source_date: z.string().nullable(),
    details: z.record(z.unknown()),
    geojson: supportedGeometrySchema,
    created_by: z.string().uuid().nullable(),
    updated_by: z.string().uuid().nullable(),
    updated_at: z.string(),
  })
  .superRefine((row, context) => {
    validateCategoryGeometry(row.category, row.geojson, context);

    if (row.category === 'redevelopment' && row.status === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Redevelopment locations require a status.',
      });
    }

    if (
      row.category === 'development_issue' ||
      row.category === 'place'
    ) {
      if (row.status !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'Only redevelopment locations may have a status.',
      });
      }
    }
  });

export interface InvalidLocationRow {
  id: string | null;
  errors: string[];
}

export interface ParseLocationRowsResult {
  locations: Location[];
  invalidRows: InvalidLocationRow[];
}

interface GeoJsonExportLayer extends Layer {
  toGeoJSON(): GeoJsonObject;
}

export function parseLocationRow(row: unknown): Location {
  const parsed = locationDbRowSchema.parse(row);
  return mapDbRowToLocation(parsed);
}

export function parseLocationRows(rows: readonly unknown[]): ParseLocationRowsResult {
  const locations: Location[] = [];
  const invalidRows: InvalidLocationRow[] = [];

  rows.forEach((row) => {
    const parsed = locationDbRowSchema.safeParse(row);

    if (parsed.success) {
      locations.push(mapDbRowToLocation(parsed.data));
      return;
    }

    invalidRows.push({
      id: extractRowId(row),
      errors: parsed.error.issues.map((issue) => issue.message),
    });
  });

  return { locations, invalidRows };
}

export function parseGeometry(geometry: unknown): SupportedGeometry {
  return supportedGeometrySchema.parse(geometry);
}

export function validateGeometryBounds(geometry: unknown): SupportedGeometry {
  return parseGeometry(geometry);
}

export function wrapLocationAsFeature(location: Location): LocationFeature {
  return {
    type: 'Feature',
    geometry: location.geometry,
    properties: {
      id: location.id,
      category: location.category,
      status: location.status,
      is_published: location.isPublished,
    },
  };
}

export function extractSupportedGeometry(layer: GeoJsonExportLayer): SupportedGeometry {
  const geojson = layer.toGeoJSON();
  const geometry = extractGeometryFromGeoJsonObject(geojson);
  return parseGeometry(geometry);
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function validateCategoryGeometry(
  category: LocationCategory,
  geometry: SupportedGeometry,
  context: z.RefinementCtx,
) {
  if (category === 'place' && geometry.type !== 'Point') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['geojson'],
      message: 'Place locations require Point geometry.',
    });
  }

  if (
    category === 'redevelopment' &&
    geometry.type !== 'Polygon' &&
    geometry.type !== 'MultiPolygon'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['geojson'],
      message: 'Redevelopment locations require Polygon or MultiPolygon geometry.',
    });
  }
}

function mapDbRowToLocation(row: LocationDbRow): Location {
  const base = {
    id: row.id,
    name: row.name,
    isPublished: row.is_published,
    sectionId: row.section_id ?? null,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceDate: row.source_date,
    details: row.details,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };

  if (row.category === 'place' && row.geojson.type === 'Point') {
    return {
      ...base,
      category: row.category,
      status: null,
      geometry: row.geojson,
    };
  }

  if (
    row.category === 'redevelopment' &&
    row.status !== null &&
    (row.geojson.type === 'Polygon' || row.geojson.type === 'MultiPolygon')
  ) {
    return {
      ...base,
      category: row.category,
      status: row.status,
      geometry: row.geojson,
    };
  }

  if (row.category === 'development_issue') {
    return {
      ...base,
      category: row.category,
      status: null,
      geometry: row.geojson,
    };
  }

  return {
    ...base,
    category: row.category,
    status: row.status,
    geometry: row.geojson,
  };
}

function extractRowId(row: unknown): string | null {
  if (
    typeof row === 'object' &&
    row !== null &&
    'id' in row &&
    typeof row.id === 'string'
  ) {
    return row.id;
  }

  return null;
}

function extractGeometryFromGeoJsonObject(
  geojson: GeoJsonObject,
): Geometry | null {
  if (geojson.type === 'Feature') {
    const feature = geojson as Feature;
    return feature.geometry;
  }

  if (
    geojson.type === 'Point' ||
    geojson.type === 'MultiPoint' ||
    geojson.type === 'LineString' ||
    geojson.type === 'MultiLineString' ||
    geojson.type === 'Polygon' ||
    geojson.type === 'MultiPolygon' ||
    geojson.type === 'GeometryCollection'
  ) {
    return geojson as Geometry;
  }

  return null;
}
