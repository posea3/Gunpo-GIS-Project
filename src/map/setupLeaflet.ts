import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

let isLeafletConfigured = false;
let geomanImportPromise: Promise<void> | null = null;
let isGeomanConfigured = false;

export function setupLeaflet() {
  if (isLeafletConfigured) {
    return;
  }

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL(
      'leaflet/dist/images/marker-icon-2x.png',
      import.meta.url,
    ).href,
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url)
      .href,
    shadowUrl: new URL(
      'leaflet/dist/images/marker-shadow.png',
      import.meta.url,
    ).href,
  });

  isLeafletConfigured = true;
}

setupLeaflet();

export async function ensureGeoman() {
  if (isGeomanConfigured) {
    return;
  }

  geomanImportPromise ??= Promise.all([
    import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'),
    import('@geoman-io/leaflet-geoman-free'),
  ]).then(() => {
    L.PM.setOptIn(true);
    isGeomanConfigured = true;
  });

  await geomanImportPromise;
}
