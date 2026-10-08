import './scaleNotice.css';

import { createFocusTrap } from './focusTrap.ts';
import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

const POINTS = [1, 2, 3, 4] as const;

/** Links for the sources and licenses section; main.ts passes them in. */
export type SourceLinks = {
  textures: { name: string; url: string; licenseUrl: string };
};

function externalLink(href: string, text: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}

// The CC BY 4.0 attribution for the textures (name, license, changes) and the
// other sources, folded under a link-style button.
function createSources(
  i18n: AppI18n,
  links: SourceLinks,
): { toggle: HTMLButtonElement; section: HTMLElement } {
  const toggle = document.createElement('button');
  toggle.setAttribute('type', 'button');
  toggle.setAttribute('id', 'sources-toggle');
  toggle.className = 'o-btn scale-sources-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'sources');
  toggle.textContent = i18n.t('sources.toggle');

  const section = document.createElement('section');
  section.setAttribute('id', 'sources');
  section.setAttribute('aria-labelledby', 'sources-toggle');
  section.hidden = true;
  const list = document.createElement('ul');
  list.className = 'scale-sources';

  const data = document.createElement('li');
  data.textContent = i18n.t('sources.data');

  const { name, url, licenseUrl } = links.textures;
  const textures = document.createElement('li');
  const line = i18n.t('sources.textures', { name });
  const at = line.indexOf(name);
  textures.append(
    line.slice(0, at),
    externalLink(url, name),
    `${line.slice(at + name.length)}, `,
    externalLink(licenseUrl, i18n.t('sources.texturesLicense')),
    `. ${i18n.t('sources.texturesChanges')}`,
  );
  const disclaimer = document.createElement('p');
  disclaimer.className = 'scale-sources-note';
  disclaimer.setAttribute('data-i18n', 'attribution.textures.disclaimer');
  disclaimer.textContent = i18n.t('attribution.textures.disclaimer');
  textures.append(disclaimer);

  const fonts = document.createElement('li');
  fonts.textContent = i18n.t('sources.fonts');
  const icons = document.createElement('li');
  icons.textContent = i18n.t('sources.icons');

  list.append(data, textures, fonts, icons);
  section.append(list);
  return { toggle, section };
}

// The scale chip in the top bar and its "Dlaczego?" dialog (SPEC §5.11). The
// dialog is not a native <dialog>: the top layer would ignore the --z-*
// tokens, and the "Gotowe!" toast must stay above it (SPEC §4). So the focus
// trap and inert are done by hand. The dialog and its scrim live in <body>,
// next to the containers they make inert.
export function createScaleNotice(
  parent: HTMLElement,
  i18n: AppI18n,
  sourceLinks: SourceLinks,
  before?: Node | null,
): { dispose(): void } {
  const page = parent.ownerDocument.body;

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
  whyButton.textContent = i18n.t('scaleNotice.why');
  whyButton.setAttribute('aria-label', i18n.t('scaleNotice.buttonLabel'));
  root.append(badge, whyButton);

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.setAttribute('data-testid', 'scale-scrim');
  scrim.hidden = true;

  const dialog = document.createElement('div');
  dialog.setAttribute('id', 'scale-explanation');
  dialog.className = 'o-glass';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'scale-explanation-title');
  dialog.hidden = true;

  const head = document.createElement('div');
  head.className = 'scale-explanation-head';
  const title = document.createElement('h2');
  title.setAttribute('id', 'scale-explanation-title');
  title.textContent = i18n.t('scaleNotice.title');
  const dismiss = document.createElement('button');
  dismiss.setAttribute('type', 'button');
  dismiss.setAttribute('id', 'scale-dismiss');
  dismiss.className = 'o-btn';
  dismiss.setAttribute('aria-label', i18n.t('scaleNotice.closeLabel'));
  dismiss.append(createIcon('close'));
  head.append(title, dismiss);

  // Only the points scroll; the footer with "Rozumiem" stays in view.
  const body = document.createElement('div');
  body.setAttribute('class', 'scale-explanation-body');
  const list = document.createElement('ol');
  list.className = 'scale-points';
  for (const point of POINTS) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = i18n.t(`scaleNotice.point${point}.title`);
    text.append(strong, ` ${i18n.t(`scaleNotice.point${point}.body`)}`);
    item.append(text);
    list.append(item);
  }
  const sources = createSources(i18n, sourceLinks);
  body.append(list, sources.section);

  const foot = document.createElement('div');
  foot.className = 'scale-explanation-foot';
  const source = document.createElement('p');
  source.className = 'scale-source';
  source.textContent = i18n.t('scaleNotice.source');
  const credits = document.createElement('div');
  credits.className = 'scale-credits';
  credits.append(source, sources.toggle);
  const confirm = document.createElement('button');
  confirm.setAttribute('type', 'button');
  confirm.setAttribute('id', 'scale-close');
  confirm.className = 'o-btn o-btn--primary';
  confirm.textContent = i18n.t('scaleNotice.confirm');
  foot.append(credits, confirm);

  dialog.append(head, body, foot);
  parent.insertBefore(root, before ?? null);
  page.append(scrim, dialog);

  const trap = createFocusTrap(dialog);
  // Containers this dialog made inert; ones inert for another reason stay so.
  const madeInert: Element[] = [];
  let disposed = false;
  let open = false;

  function setBackgroundInert(inert: boolean): void {
    if (!inert) {
      for (const element of madeInert) {
        element.removeAttribute('inert');
      }
      madeInert.length = 0;
      return;
    }
    for (const element of page.children) {
      if (
        element === scrim ||
        element === dialog ||
        element.hasAttribute('inert')
      ) {
        continue;
      }
      element.setAttribute('inert', '');
      madeInert.push(element);
    }
  }

  // The points get a Tab stop only when they scroll (keyboard scrolling).
  function updateScrollStop(): void {
    if (body.scrollHeight > body.clientHeight) {
      body.setAttribute('tabindex', '0');
    } else {
      body.removeAttribute('tabindex');
    }
  }

  function setSourcesOpen(expanded: boolean): void {
    sources.toggle.setAttribute('aria-expanded', String(expanded));
    sources.section.hidden = !expanded;
    updateScrollStop();
  }

  function toggleSources(): void {
    const expanded = sources.toggle.getAttribute('aria-expanded') !== 'true';
    setSourcesOpen(expanded);
    if (expanded) {
      sources.section.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function openDialog(): void {
    if (disposed || open) {
      return;
    }
    open = true;
    scrim.hidden = false;
    dialog.hidden = false;
    setBackgroundInert(true);
    updateScrollStop();
    window.addEventListener('resize', updateScrollStop);
    trap.activate(confirm);
  }

  function closeDialog(): void {
    if (disposed || !open) {
      return;
    }
    open = false;
    trap.deactivate();
    window.removeEventListener('resize', updateScrollStop);
    setBackgroundInert(false);
    scrim.hidden = true;
    dialog.hidden = true;
    setSourcesOpen(false);
    whyButton.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.key !== 'Escape' || !open) {
      return;
    }
    // Esc closes the dialog only; it must not reach the canvas (whole system view).
    event.preventDefault();
    event.stopPropagation();
    closeDialog();
  }

  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  whyButton.addEventListener('click', openDialog);
  sources.toggle.addEventListener('click', toggleSources);
  confirm.addEventListener('click', closeDialog);
  dismiss.addEventListener('click', closeDialog);
  scrim.addEventListener('click', closeDialog);
  dialog.addEventListener('keydown', onKeyDown);
  root.addEventListener('pointerdown', onPointerDown);
  scrim.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointerdown', onPointerDown);

  return {
    dispose() {
      if (disposed) {
        return;
      }

      trap.dispose();
      setBackgroundInert(false);
      window.removeEventListener('resize', updateScrollStop);
      disposed = true;
      whyButton.removeEventListener('click', openDialog);
      sources.toggle.removeEventListener('click', toggleSources);
      confirm.removeEventListener('click', closeDialog);
      dismiss.removeEventListener('click', closeDialog);
      scrim.removeEventListener('click', closeDialog);
      dialog.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('pointerdown', onPointerDown);
      scrim.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerdown', onPointerDown);
      root.remove();
      scrim.remove();
      dialog.remove();
    },
  };
}
