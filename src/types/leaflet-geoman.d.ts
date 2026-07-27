import type { Layer, LayerOptions, MapOptions } from 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    pmIgnore?: boolean;
  }

  interface LayerOptions {
    pmIgnore?: boolean;
  }

  interface Layer {
    dbId?: string;
  }

  namespace PM {
    function setOptIn(value: boolean): void;
    function reInitLayer(layer: Layer | Map): void;
  }
}
