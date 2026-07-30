import { useState } from 'react';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import L, { type Layer, type PathOptions } from 'leaflet';
import { GeoJSON, Marker, useMap, useMapEvents } from 'react-leaflet';

import type { Location, LocationFeature } from '../types/location';
import { wrapLocationAsFeature } from '../utils/geojson';
import { registerLayerId } from './geomanLayerRegistry';

interface LocationLayersProps {
  locations: readonly Location[];
  revision: number;
  isAdmin: boolean;
  onSelectLocation: (location: Location) => void;
  onLayerReady?: (location: Location, layer: Layer) => void;
}

const categoryStyles: Record<string, PathOptions> = {
  redevelopment: {
    color: '#b91c1c',
    fillColor: '#ef4444',
    weight: 2,
    fillOpacity: 0.18,
  },
  development_issue: {
    color: '#0369a1',
    fillColor: '#38bdf8',
    weight: 2,
    fillOpacity: 0.16,
  },
  place: {
    color: '#047857',
    fillColor: '#34d399',
    weight: 2,
    fillOpacity: 0.16,
  },
};

type PolygonLocation = Location & {
  geometry: Polygon | MultiPolygon;
};

export function LocationLayers({
  locations,
  revision,
  isAdmin,
  onSelectLocation,
  onLayerReady,
}: LocationLayersProps) {
  const polygonLocations = locations.filter(isPolygonLocation);
  const locationById = new Map(
    polygonLocations.map((location) => [location.id, location]),
  );
  const featureCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: polygonLocations.map(wrapLocationAsFeature),
  };
  const polygonRenderKey = polygonLocations
    .map((location) => location.id)
    .join('-');

  return (
    <>
      <GeoJSON
        key={`location-polygons-${revision}-${polygonRenderKey}`}
        data={featureCollection}
        style={(feature) => {
          const location = getLocationFromFeature(feature, locationById);
          return location === null
            ? categoryStyles.development_issue
            : getLocationPathStyle(location, isAdmin);
        }}
        onEachFeature={(feature, layer) => {
          const location = getLocationFromFeature(feature, locationById);

          if (location !== null) {
            if (isAdmin) {
              prepareAdminEditableLocationLayer(layer, location.id);
              L.PM.reInitLayer(layer);
            } else {
              prepareReadOnlyLocationLayer(layer);
            }

            onLayerReady?.(location, layer);
            layer.on('click', () => onSelectLocation(location));
            return;
          }

          prepareReadOnlyLocationLayer(layer);
        }}
      />
      <PolygonNameLabels
        locations={polygonLocations.filter((location) => location.status !== null)}
      />
    </>
  );
}

const minimumPolygonLabelZoom = 17;

function PolygonNameLabels({ locations }: { locations: readonly PolygonLocation[] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  if (zoom < minimumPolygonLabelZoom) {
    return null;
  }

  return (
    <>
      {locations.map((location) => (
        <Marker
          key={`location-polygon-label-${location.id}`}
          position={getPolygonLabelPosition(location.geometry)}
          icon={createPolygonLabelIcon(location)}
          interactive={false}
          pmIgnore
        />
      ))}
    </>
  );
}

export function prepareReadOnlyLocationLayer(layer: Layer) {
  layer.options.pmIgnore = true;

  if (layer instanceof L.LayerGroup) {
    layer.eachLayer((childLayer) => prepareReadOnlyLocationLayer(childLayer));
  }
}

export function prepareAdminEditableLocationLayer(layer: Layer, locationId: string) {
  registerLayerId(layer, locationId);
  layer.dbId = locationId;
  layer.options.pmIgnore = false;

  if (layer instanceof L.LayerGroup) {
    layer.eachLayer((childLayer) =>
      prepareAdminEditableLocationLayer(childLayer, locationId),
    );
  }
}

function isPolygonLocation(location: Location): location is PolygonLocation {
  return (
    location.geometry.type === 'Polygon' || location.geometry.type === 'MultiPolygon'
  );
}

function getPolygonLabelPosition(geometry: Polygon | MultiPolygon): [number, number] {
  const coordinates = getPolygonPositions(geometry);
  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  coordinates.forEach(([longitude, latitude]) => {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  });

  return [
    (minLatitude + maxLatitude) / 2,
    (minLongitude + maxLongitude) / 2,
  ];
}

function createPolygonLabelIcon(
  location: PolygonLocation,
) {
  const labelHtml = formatPolygonLabelName(location.name);
  const statusHtml = location.status === null
    ? ''
    : `<span class="polygon-project-badge__status">${escapeHtml(location.status)}</span>`;

  return L.divIcon({
    className: 'polygon-label-anchor',
    html: `<div class="polygon-project-badge" title="${escapeHtml(location.name)}"><span class="polygon-project-badge__name">${labelHtml}</span>${statusHtml}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPolygonLabelName(name: string) {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);

  if (name.length <= 16 || words.length < 2) {
    return escapeHtml(name);
  }

  const targetLength = name.length / 2;
  let currentLength = 0;
  let splitIndex = 1;

  for (let index = 0; index < words.length - 1; index += 1) {
    currentLength += words[index].length + (index === 0 ? 0 : 1);
    if (currentLength >= targetLength) {
      splitIndex = index + 1;
      break;
    }
  }

  const firstLine = words.slice(0, splitIndex).join(' ');
  const secondLine = words.slice(splitIndex).join(' ');

  return `${escapeHtml(firstLine)}<br>${escapeHtml(secondLine)}`;
}

function getPolygonPositions(geometry: Polygon | MultiPolygon): readonly Position[] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }

  return geometry.coordinates.flat(2);
}

function getLocationPathStyle(location: Location, isAdmin: boolean): PathOptions {
  const baseStyle = categoryStyles[location.category];
  const style = baseStyle ?? categoryStyles.development_issue;

  if (isAdmin && !location.isPublished) {
    return {
      ...style,
      dashArray: '5, 5',
      fillOpacity: 0.3,
    };
  }

  return style;
}

function getLocationFromFeature(
  feature: GeoJSON.Feature | undefined,
  locationById: ReadonlyMap<string, Location>,
) {
  const featureId = (feature as LocationFeature | undefined)?.properties.id;

  if (featureId === undefined) {
    return null;
  }

  return locationById.get(featureId) ?? null;
}
