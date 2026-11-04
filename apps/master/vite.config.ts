import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  envPrefix: ['VITE_', 'USE_'],
  plugins: [react()],
  server: {
    port: 5175,
    host: true,
  },
});
