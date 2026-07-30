import type { Geometry, Position } from 'geojson';

export interface LocationViewport {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function areLocationViewportsEqual(
  left: LocationViewport | null,
  right: LocationViewport,
) {
  return (
    left !== null &&
    left.west === right.west &&
    left.south === right.south &&
    left.east === right.east &&
    left.north === right.north
  );
}

export function doesGeometryIntersectViewport(
  geometry: Geometry,
  viewport: LocationViewport | null,
) {
  if (viewport === null) {
    return false;
  }

  const bounds = getGeometryBounds(geometry);

  return (
    bounds.west <= viewport.east &&
    bounds.east >= viewport.west &&
    bounds.south <= viewport.north &&
    bounds.north >= viewport.south
  );
}

function getGeometryBounds(geometry: Geometry) {
  const coordinates = getGeometryCoordinates(geometry);
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    const longitude = coordinate[0];
    const latitude = coordinate[1];

    if (longitude === undefined || latitude === undefined) {
      continue;
    }

    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  return { west, south, east, north };
}

function getGeometryCoordinates(geometry: Geometry): Position[] {
  if (geometry.type === 'Point') {
    return [geometry.coordinates];
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2);
  }

  return [];
}
