import './scaleNotice.css';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

const PARAGRAPH_KEYS = [
  'scaleNotice.paragraph1',
  'scaleNotice.paragraph2',
  'scaleNotice.paragraph3',
  'scaleNotice.paragraph4',
  'scaleNotice.paragraph5',
] as const;

export function createScaleNotice(
  parent: HTMLElement,
  i18n: AppI18n,
  before?: Node | null,
): { dispose(): void } {
  const root = document.createElement('div');
  root.setAttribute('id', 'scale-notice');
  root.className = 'o-glass o-chip';

  const badge = document.createElement('p');
  badge.setAttribute('id', 'scale-badge');
  badge.setAttribute('class', 'scale-badge');
  badge.textContent = i18n.t('scaleNotice.badge');

  const whyButton = document.createElement('button');
  whyButton.setAttribute('type', 'button');
  whyButton.setAttribute('id', 'scale-why');
  whyButton.className = 'o-btn';
  whyButton.setAttribute('aria-haspopup', 'dialog');
  whyButton.setAttribute('aria-expanded', 'false');
  whyButton.setAttribute('aria-controls', 'scale-explanation');
  whyButton.textContent = i18n.t('scaleNotice.why');
  whyButton.setAttribute('aria-label', i18n.t('scaleNotice.buttonLabel'));

  const panel = document.createElement('section');
  panel.setAttribute('id', 'scale-explanation');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'scale-explanation-title');
  panel.hidden = true;

  const title = document.createElement('h2');
  title.setAttribute('id', 'scale-explanation-title');
  title.setAttribute('tabindex', '-1');
  title.textContent = i18n.t('scaleNotice.title');

  const paragraphs = PARAGRAPH_KEYS.map((key) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = i18n.t(key);
    return paragraph;
  });

  const closeButton = document.createElement('button');
  closeButton.setAttribute('type', 'button');
  closeButton.setAttribute('id', 'scale-close');
  closeButton.textContent = i18n.t('scaleNotice.closeLabel');

  // Only the text scrolls; the close button stays below it.
  const body = document.createElement('div');
  body.setAttribute('class', 'scale-explanation-body');
  body.append(title, ...paragraphs);
  panel.append(body, closeButton);
  root.append(badge, whyButton, panel);
  parent.insertBefore(root, before ?? null);

  let disposed = false;
  let open = false;

  function setOpen(next: boolean, restoreFocus: boolean): void {
    if (disposed) {
      return;
    }

    open = next;
    panel.hidden = !next;
    root.classList.toggle('is-open', next);
    whyButton.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      title.focus();
      return;
    }

    if (restoreFocus) {
      whyButton.focus();
    }
  }

  function onWhyClick(): void {
    setOpen(!open, false);
  }

  function onCloseClick(): void {
    setOpen(false, true);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.key !== 'Escape' || !open) {
      return;
    }

    if (!root.contains(document.activeElement)) {
      return;
    }

    setOpen(false, true);
  }

  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  whyButton.addEventListener('click', onWhyClick);
  closeButton.addEventListener('click', onCloseClick);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('pointerdown', onPointerDown);

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      whyButton.removeEventListener('click', onWhyClick);
      closeButton.removeEventListener('click', onCloseClick);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('pointerdown', onPointerDown);
      root.remove();
    },
  };
}
