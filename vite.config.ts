import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react';
          }

          if (
            id.includes('/leaflet.markercluster/') ||
            id.includes('/react-leaflet-cluster/')
          ) {
            return 'leafletCluster';
          }

          if (
            id.includes('/leaflet/') ||
            id.includes('/react-leaflet/') ||
            id.includes('/@react-leaflet/')
          ) {
            return 'leaflet';
          }

          if (id.includes('/@supabase/')) {
            return 'supabase';
          }

          if (id.includes('/@geoman-io/leaflet-geoman-free/')) {
            return 'geoman';
          }

          if (id.includes('/xlsx/')) {
            return 'xlsx';
          }

          if (id.includes('/lucide-react/') || id.includes('/zod/')) {
            return 'ui';
          }

          return 'vendor';
        },
      },
    },
  },
});
