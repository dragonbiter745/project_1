import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5186, host: true },
  build: {
    // The 3D world is the product demo; it is meant to be heavy and is split from the page shell.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // React stays in its own chunk so the page text renders before the 3D libraries arrive.
        manualChunks(id) {
          if (id.includes('preload-helper')) return 'vendor';
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three';
          if (/@react-three|postprocessing|three-stdlib|camera-controls|maath|troika|n8ao|suspend-react|its-fine|three-mesh-bvh|meshline|stats-gl|detect-gpu|hls|tunnel-rat|glsl-noise|@monogrid|@use-gesture/.test(id)) return 'r3f';
          return 'vendor';
        },
      },
    },
  },
});
