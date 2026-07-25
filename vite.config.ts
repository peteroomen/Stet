import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works from a subpath, a file:// open, or any static host.
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { target: 'es2020', outDir: 'dist' },
});
