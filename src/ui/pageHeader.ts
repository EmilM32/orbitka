import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

export function createPageHeader(
  parent: HTMLElement,
  i18n: AppI18n,
  before?: Node,
): HTMLElement {
  const header = document.createElement('header');
  const heading = document.createElement('h1');
  heading.className = 'visually-hidden';
  heading.textContent = i18n.t('app.title');
  header.append(heading);
  parent.insertBefore(header, before ?? null);
  return header;
}
