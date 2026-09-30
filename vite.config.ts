import { defineConfig } from 'vite';
import { layerAliases } from './aliases.ts';

export default defineConfig({
  resolve: {
    alias: layerAliases,
  },
});
