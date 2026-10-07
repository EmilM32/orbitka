import { type Selection } from '@core/selection.ts';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

const WRITE_GAP_SECONDS = 1;

export type Announcer = {
  element: HTMLElement;
  update(dtSeconds: number): void;
  dispose(): void;
};

export function createAnnouncer(
  parent: HTMLElement,
  selection: Selection,
  i18n: AppI18n,
): Announcer {
  const element = document.createElement('div');
  element.id = 'bodies-announcer';
  element.className = 'visually-hidden';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  parent.append(element);

  let disposed = false;
  let lastText = '';
  let pending: string | null = null;
  let sinceWrite = WRITE_GAP_SECONDS;

  const unsubscribe = selection.subscribe((event) => {
    if (disposed) {
      return;
    }
    if (event.kind === 'selected') {
      const name = i18n.t(`bodies.${event.id}.name`);
      request(i18n.t('selection.announce.selected', { name }));
      return;
    }
    if (event.kind === 'system') {
      request(i18n.t('selection.announce.system'));
    }
  });

  return { element, update, dispose };

  function request(text: string): void {
    if (text === (pending ?? lastText)) {
      return;
    }
    if (sinceWrite >= WRITE_GAP_SECONDS) {
      write(text);
      return;
    }
    pending = text;
  }

  function write(text: string): void {
    pending = null;
    sinceWrite = 0;
    if (text === lastText) {
      return;
    }
    element.textContent = text;
    lastText = text;
  }

  function update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      throw new RangeError(
        `update: parameter "dtSeconds" must be finite and >= 0, got ${dtSeconds}`,
      );
    }
    if (disposed) {
      return;
    }
    sinceWrite += dtSeconds;
    if (sinceWrite > WRITE_GAP_SECONDS) {
      sinceWrite = WRITE_GAP_SECONDS;
    }
    if (pending !== null && sinceWrite >= WRITE_GAP_SECONDS) {
      write(pending);
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    unsubscribe();
    element.remove();
  }
}
