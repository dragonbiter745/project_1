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
    port: 5174,
    host: true,
  },
});
