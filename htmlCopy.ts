import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import type { Plugin } from 'vite';

// ADR-008: no Polish in index.html. The page title and description come
// from pl.json and are written into the HTML at dev and build time, so the
// first paint and crawlers already see them (EMI-236).
const LOCALE = fileURLToPath(
  new URL('./src/content/locales/pl.json', import.meta.url),
);

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function message(messages: Record<string, unknown>, key: string): string {
  const value = messages[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`htmlCopy: pl.json has no string "${key}"`);
  }
  return escapeHtml(value);
}

export function htmlCopy(): Plugin {
  return {
    name: 'orbitka-html-copy',
    transformIndexHtml(html) {
      const messages = JSON.parse(readFileSync(LOCALE, 'utf8')) as Record<
        string,
        unknown
      >;
      const title = message(messages, 'app.title');
      const description = message(messages, 'app.description');
      if (
        !html.includes('<title>') ||
        !html.includes('<!--app-description-->')
      ) {
        throw new Error(
          'htmlCopy: index.html lost its title or description slot',
        );
      }
      return html
        .replace(/<title>[^<]*<\/title>/u, `<title>${title}</title>`)
        .replace(
          '<!--app-description-->',
          `<meta name="description" content="${description}" />`,
        );
    },
  };
}
