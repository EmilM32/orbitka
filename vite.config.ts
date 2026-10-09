import { defineConfig } from 'vite';
import { layerAliases } from './aliases.ts';
import { htmlCopy } from './htmlCopy.ts';

export default defineConfig({
  plugins: [htmlCopy()],
  resolve: {
    alias: layerAliases,
  },
  build: {
    // kB after minification, per chunk. three.js has a chunk of its own
    // (EMI-235), so the limit guards both the library and the app; the app
    // chunk has its own tighter check in tests/repo/bundleSize.test.ts.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
