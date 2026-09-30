import { fileURLToPath, URL } from 'node:url';

const layer = (name: string): string =>
  fileURLToPath(new URL(`./src/${name}`, import.meta.url));

export const layerAliases = {
  '@core': layer('core'),
  '@data': layer('data'),
  '@sim': layer('sim'),
  '@render': layer('render'),
  '@ui': layer('ui'),
  '@content': layer('content'),
} as const;
