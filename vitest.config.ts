import { defineConfig } from 'vitest/config';
import { layerAliases } from './aliases.ts';

// The same extensions as SOURCE_EXTENSIONS in eslint.config.js.
const SIM_SOURCES = 'src/sim/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';

export default defineConfig({
  resolve: {
    alias: layerAliases,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [SIM_SOURCES],
      thresholds: {
        [SIM_SOURCES]: {
          lines: 90,
        },
      },
    },
  },
});
