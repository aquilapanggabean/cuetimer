import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    outDir: 'dist',
    target: 'esnext'
  },
  test: {
    environment: 'node',
    globals: true
  }
} as any);
