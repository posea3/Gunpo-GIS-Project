import type { FeatureCollection } from 'geojson';
import L, { type Layer, type PathOptions } from 'leaflet';
import { GeoJSON } from 'react-leaflet';

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

  return (
    <GeoJSON
      key={`location-polygons-${revision}`}
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

function isPolygonLocation(location: Location) {
  return (
    location.geometry.type === 'Polygon' || location.geometry.type === 'MultiPolygon'
  );
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
