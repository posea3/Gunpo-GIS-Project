import L, { type Layer } from 'leaflet';

const layerIdMap = new WeakMap<Layer, string>();

export function registerLayerId(layer: Layer, id: string) {
  layer.dbId = id;
  layerIdMap.set(layer, id);

  if (layer instanceof L.LayerGroup) {
    layer.eachLayer((childLayer) => registerLayerId(childLayer, id));
  }
}

export function resolveLayerId(layer: Layer): string | null {
  return layer.dbId ?? layerIdMap.get(layer) ?? null;
}
