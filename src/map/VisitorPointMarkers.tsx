import L from 'leaflet';
import type { Point } from 'geojson';
import { Marker } from 'react-leaflet';

import type { Location } from '../types/location';

interface VisitorPointMarkersProps {
  locations: readonly Location[];
  onSelectLocation: (location: Location) => void;
}

type PointLocation = Location & {
  geometry: Point;
};

export function VisitorPointMarkers({
  locations,
  onSelectLocation,
}: VisitorPointMarkersProps) {
  const pointLocations = locations.filter(
    (location): location is PointLocation => location.geometry.type === 'Point',
  );
  return (
    <>
      {pointLocations.map((location) => (
        <Marker
          key={location.id}
          position={toLatLng(location.geometry.coordinates)}
          icon={location.category === 'development_issue' ? developmentIssueIcon : placeIcon}
          pmIgnore
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

const developmentIssueIcon = L.divIcon({
  className: 'development-issue-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const placeIcon = L.divIcon({
  className: 'place-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
