import type { Point } from 'geojson';
import L, { type Marker as LeafletMarker } from 'leaflet';
import { Marker } from 'react-leaflet';

import type {
  Location,
} from '../types/location';
import { registerLayerId } from './geomanLayerRegistry';

interface AdminPointMarkersProps {
  locations: readonly Location[];
  onSelectLocation: (location: Location) => void;
  onMarkerReady?: (location: Location, marker: LeafletMarker) => void;
}

type PointLocation = Location & {
  geometry: Point;
};

export function AdminPointMarkers({
  locations,
  onSelectLocation,
  onMarkerReady,
}: AdminPointMarkersProps) {
  const pointLocations = locations.filter(
    (location): location is PointLocation => location.geometry.type === 'Point',
  );

  return (
    <>
      {pointLocations.map((location) => (
        <Marker
          key={location.id}
          position={toLatLng(location.geometry.coordinates)}
          icon={getAdminPointIcon(location)}
          ref={(marker) => {
            if (marker !== null) {
              registerLayerId(marker, location.id);
              marker.options.pmIgnore = false;
              L.PM.reInitLayer(marker);
              onMarkerReady?.(location, marker);
            }
          }}
          eventHandlers={{
            click: () => onSelectLocation(location),
          }}
        />
      ))}
    </>
  );
}

function toLatLng(coordinates: readonly number[]) {
  return L.latLng(coordinates[1], coordinates[0]);
}

function getAdminPointIcon(location: Location) {
  if (!location.isPublished) {
    return draftPointIcon;
  }

  return location.category === 'place' ? placePointIcon : developmentIssuePointIcon;
}

const placePointIcon = L.divIcon({
  className: 'admin-place-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const developmentIssuePointIcon = L.divIcon({
  className: 'admin-development-issue-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const draftPointIcon = L.divIcon({
  className: 'admin-draft-marker',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
