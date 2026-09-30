import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const layer = (name: string) =>
  fileURLToPath(new URL(`./src/${name}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': layer('core'),
      '@data': layer('data'),
      '@sim': layer('sim'),
      '@render': layer('render'),
      '@ui': layer('ui'),
      '@content': layer('content'),
    },
  },
});
