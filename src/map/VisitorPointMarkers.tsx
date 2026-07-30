import L from 'leaflet';
import type { Point } from 'geojson';
import { useEffect, useMemo, useState } from 'react';
import { Marker } from 'react-leaflet';

import type { Location } from '../types/location';
import type { LocationSectionWithFields } from '../types/section';

interface VisitorPointMarkersProps {
  locations: readonly Location[];
  sections: readonly LocationSectionWithFields[];
  onSelectLocation: (location: Location) => void;
}

type PointLocation = Location & {
  geometry: Point;
};

const markerRenderBatchSize = 75;

export function VisitorPointMarkers({
  locations,
  sections,
  onSelectLocation,
}: VisitorPointMarkersProps) {
  const pointLocations = useMemo(
    () =>
      locations.filter(
        (location): location is PointLocation => location.geometry.type === 'Point',
      ),
    [locations],
  );
  const [visibleMarkerCount, setVisibleMarkerCount] = useState(0);
  const sectionIconsById = useMemo(
    () =>
      new Map(
        sections.map((section) => [
          section.id,
          createSectionPointIcon(section.color),
        ]),
      ),
    [sections],
  );

  useEffect(() => {
    let nextMarkerCount = Math.min(pointLocations.length, markerRenderBatchSize);
    let animationFrameId: number | null = null;

    setVisibleMarkerCount(nextMarkerCount);

    const renderNextBatch = () => {
      if (nextMarkerCount >= pointLocations.length) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        nextMarkerCount = Math.min(
          nextMarkerCount + markerRenderBatchSize,
          pointLocations.length,
        );
        setVisibleMarkerCount(nextMarkerCount);
        renderNextBatch();
      });
    };

    renderNextBatch();

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [pointLocations]);

  const visiblePointLocations = pointLocations.slice(0, visibleMarkerCount);

  return (
    <>
      {visiblePointLocations.map((location) => (
        <Marker
          key={location.id}
          position={toLatLng(location.geometry.coordinates)}
          icon={
            (location.sectionId === null
              ? undefined
              : sectionIconsById.get(location.sectionId)) ??
            (location.category === 'development_issue'
              ? developmentIssueIcon
              : placeIcon)
          }
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

function createSectionPointIcon(color: string) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#64748b';

  return L.divIcon({
    className: 'section-marker',
    html: `<span style="background-color: ${safeColor}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
