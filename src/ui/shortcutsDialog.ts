import './shortcutsDialog.css';

import { type Dictionary, type I18n } from './i18n.ts';
import { createFocusTrap } from './focusTrap.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

export type ShortcutsDialog = {
  /** Opens the list; the focus comes back to where it was when it closes. */
  open(): void;
  isOpen(): boolean;
  dispose(): void;
};

type Row = {
  key: string;
  text: string;
};

// A modal dialog like "Dlaczego?" (SPEC §5.11): role="dialog", the page behind
// it inert, the focus kept inside, Esc and the scrim close it.
export function createShortcutsDialog(
  parent: HTMLElement,
  i18n: AppI18n,
): ShortcutsDialog {
  const page = parent.ownerDocument.body;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.setAttribute('data-testid', 'shortcuts-scrim');
  scrim.hidden = true;

  const dialog = document.createElement('div');
  dialog.id = 'shortcuts-dialog';
  dialog.className = 'o-glass';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'shortcuts-title');
  dialog.setAttribute('data-testid', 'shortcuts-dialog');
  dialog.hidden = true;

  const head = document.createElement('div');
  head.className = 'shortcuts-head';
  const title = document.createElement('h2');
  title.id = 'shortcuts-title';
  title.textContent = i18n.t('shortcuts.title');
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'o-btn shortcuts-dismiss';
  dismiss.setAttribute('aria-label', i18n.t('shortcuts.closeLabel'));
  dismiss.setAttribute('data-testid', 'shortcuts-dismiss');
  dismiss.append(createIcon('close'));
  head.append(title, dismiss);

  const body = document.createElement('div');
  body.className = 'shortcuts-body';
  body.append(
    group(i18n.t('shortcuts.group.page'), [
      {
        key: i18n.t('shortcuts.pause.key'),
        text: i18n.t('shortcuts.pause.text'),
      },
      { key: i18n.t('shortcuts.sun.key'), text: i18n.t('shortcuts.sun.text') },
      {
        key: i18n.t('shortcuts.planets.key'),
        text: i18n.t('shortcuts.planets.text'),
      },
      {
        key: i18n.t('shortcuts.today.key'),
        text: i18n.t('shortcuts.today.text'),
      },
      {
        key: i18n.t('shortcuts.fullscreen.key'),
        text: i18n.t('shortcuts.fullscreen.text'),
      },
      {
        key: i18n.t('shortcuts.help.key'),
        text: i18n.t('shortcuts.help.text'),
      },
    ]),
    group(i18n.t('shortcuts.group.scene'), [
      {
        key: i18n.t('shortcuts.rotate.key'),
        text: i18n.t('shortcuts.rotate.text'),
      },
      {
        key: i18n.t('shortcuts.zoom.key'),
        text: i18n.t('shortcuts.zoom.text'),
      },
      {
        key: i18n.t('shortcuts.system.key'),
        text: i18n.t('shortcuts.system.text'),
      },
    ]),
  );

  const foot = document.createElement('div');
  foot.className = 'shortcuts-foot';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'o-btn o-btn--primary';
  confirm.setAttribute('data-testid', 'shortcuts-confirm');
  confirm.textContent = i18n.t('shortcuts.confirm');
  foot.append(confirm);

  dialog.append(head, body, foot);
  page.append(scrim, dialog);

  const trap = createFocusTrap(dialog);
  // Containers this dialog made inert; ones inert for another reason stay so.
  const madeInert: Element[] = [];
  let returnFocus: HTMLElement | null = null;
  let disposed = false;
  let isOpen = false;

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

  function open(): void {
    if (disposed || isOpen) {
      return;
    }
    isOpen = true;
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    scrim.hidden = false;
    dialog.hidden = false;
    setBackgroundInert(true);
    trap.activate(confirm);
  }

  function close(): void {
    if (disposed || !isOpen) {
      return;
    }
    isOpen = false;
    trap.deactivate();
    setBackgroundInert(false);
    scrim.hidden = true;
    dialog.hidden = true;
    // The opener may be gone (the settings panel closed): the page then keeps
    // the focus on the body.
    if (returnFocus !== null && returnFocus.isConnected) {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.key !== 'Escape' || !isOpen) {
      return;
    }
    // Esc closes the dialog only; it must not reach the canvas (system view).
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  confirm.addEventListener('click', close);
  dismiss.addEventListener('click', close);
  scrim.addEventListener('click', close);
  dialog.addEventListener('keydown', onKeyDown);
  scrim.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointerdown', onPointerDown);

  return {
    open,
    isOpen: () => isOpen,
    dispose() {
      if (disposed) {
        return;
      }
      trap.dispose();
      setBackgroundInert(false);
      disposed = true;
      isOpen = false;
      confirm.removeEventListener('click', close);
      dismiss.removeEventListener('click', close);
      scrim.removeEventListener('click', close);
      dialog.removeEventListener('keydown', onKeyDown);
      scrim.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerdown', onPointerDown);
      scrim.remove();
      dialog.remove();
    },
  };
}

function group(heading: string, rows: readonly Row[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'shortcuts-group';
  const title = document.createElement('h3');
  title.textContent = heading;
  const list = document.createElement('dl');
  for (const row of rows) {
    const key = document.createElement('dt');
    const cap = document.createElement('kbd');
    cap.textContent = row.key;
    key.append(cap);
    const text = document.createElement('dd');
    text.textContent = row.text;
    list.append(key, text);
  }
  section.append(title, list);
  return section;
}
