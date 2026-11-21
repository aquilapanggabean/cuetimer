import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'esnext'
  },
  test: {
    environment: 'node',
    globals: true
  }
} as any);
