import { defineConfig } from 'vite';
import { layerAliases } from './aliases.ts';

export default defineConfig({
  resolve: {
    alias: layerAliases,
  },
  build: {
    // kB after minification. The bundle is about 550 kB, almost all three.js,
    // well inside the ADR-006 budget of about 10 MB transfer. The limit sits
    // above that so the warning comes back only on a real jump in size.
    chunkSizeWarningLimit: 700,
  },
});
