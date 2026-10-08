import './pageHeader.css';

import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

// The top bar: the hidden h1 for screen readers and the visible "Orbitka"
// mark, which is decoration (aria-hidden, not a link). The scale chip is
// mounted into the same header by main.ts.
export function createPageHeader(
  parent: HTMLElement,
  i18n: AppI18n,
  before?: Node,
): HTMLElement {
  const header = document.createElement('header');
  header.className = 'topbar';
  const heading = document.createElement('h1');
  heading.className = 'visually-hidden';
  heading.textContent = i18n.t('app.title');
  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.textContent = i18n.t('app.brand');
  brand.append(createIcon('orbit'), name);
  header.append(heading, brand);
  parent.insertBefore(header, before ?? null);
  return header;
}
