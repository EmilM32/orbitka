import { defineConfig } from 'vitest/config';
import { layerAliases } from './aliases.ts';

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
      include: ['src/sim/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        'src/sim/**/*.ts': {
          lines: 90,
        },
      },
    },
  },
});
