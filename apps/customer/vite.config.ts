import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: ['VITE_', 'USE_'],
  define: {
    'process.env.USE_FIREBASE_EMULATOR': JSON.stringify(process.env.USE_FIREBASE_EMULATOR ?? 'true'),
    'import.meta.env.USE_FIREBASE_EMULATOR': JSON.stringify(process.env.USE_FIREBASE_EMULATOR ?? 'true'),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy /api to the local Functions emulator so CORS is not an issue in dev.
      '/api': {
        target: 'http://127.0.0.1:5001/demo-foodcourt/asia-south1/catalog',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
});
