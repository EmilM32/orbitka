import './viewControls.css';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { parseQualityLevel, type QualityLevel } from '@core/quality.ts';
import { type Selection } from '@core/selection.ts';

import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';
import {
  loadOrbitsVisible,
  saveOrbitsVisible,
  type OrbitsStorage,
} from './orbitsPreference.ts';

type AppI18n = I18n<Dictionary>;

// How long the "link copied" note stays in the settings panel.
const COPY_STATUS_MS = 4000;

export type ViewControls = {
  element: HTMLElement;
  isOrbitsVisible(): boolean;
  /** Full screen on or off, as the button does; nothing where the browser has none. */
  toggleFullscreen(): void;
  /**
   * `atMin`: the camera is closest, so zoom in is disabled. `atMax`: the
   * camera is farthest, so zoom out is disabled. The DOM changes only when a
   * value changes, so calling it every frame is cheap.
   */
  setZoomLimits(atMin: boolean, atMax: boolean): void;
  dispose(): void;
};

export type ViewControlsOptions = {
  i18n: AppI18n;
  selection: Selection;
  storage: OrbitsStorage | null;
  onZoom: (factor: number) => void;
  onOrbitsChange: (visible: boolean) => void;
  /** `null` = automatic. */
  onQualityChange: (level: QualityLevel | null) => void;
  /** The saved manual level; `null` = automatic. */
  qualityValue: QualityLevel | null;
  /** Opens the list of keyboard shortcuts. */
  onShowShortcuts: () => void;
  /** Copies the link to this view; true when it was copied. */
  onCopyLink: () => Promise<boolean>;
  /** `?quality=` in the address fixes the level, so the select is off. */
  qualityLocked: boolean;
  before?: Node;
};

export function createViewControls(
  parent: HTMLElement,
  options: ViewControlsOptions,
): ViewControls {
  const { i18n, selection, storage, onZoom, onOrbitsChange } = options;
  const { onQualityChange } = options;
  let visible = loadOrbitsVisible(storage);
  let disposed = false;
  let atMin = false;
  let atMax = false;
  let panelOpen = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const element = document.createElement('div');
  element.setAttribute('id', 'view-controls');
  element.className = 'o-glass';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', i18n.t('view.group.label'));
  element.setAttribute('data-testid', 'view-controls');

  const reset = button('view-reset');
  reset.append(createIcon('system'), label(i18n.t('view.reset.text')));
  // Text on every breakpoint and a switch that shows the state (SPEC §5.2).
  const orbits = button('view-orbits');
  orbits.classList.add('o-toggle', 'view-orbits');
  orbits.setAttribute('title', i18n.t('view.orbits.title'));
  orbits.setAttribute('aria-pressed', visible ? 'true' : 'false');
  const orbitsSwitch = document.createElement('span');
  orbitsSwitch.className = 'o-toggle__switch';
  orbitsSwitch.setAttribute('aria-hidden', 'true');
  orbits.append(
    createIcon('orbits'),
    label(i18n.t('view.orbits.text')),
    orbitsSwitch,
  );
  const zoomOut = button('view-zoom-out');
  zoomOut.classList.add('view-zoom');
  zoomOut.setAttribute('aria-label', i18n.t('view.zoomOut.ariaLabel'));
  zoomOut.append(createIcon('minus'));
  const zoomIn = button('view-zoom-in');
  zoomIn.classList.add('view-zoom');
  zoomIn.setAttribute('aria-label', i18n.t('view.zoomIn.ariaLabel'));
  zoomIn.append(createIcon('plus'));
  // Full screen for a projector in the classroom (EMI-247). Where the browser
  // has no such mode (an iPhone) there is no button.
  const fullscreenSupported = document.fullscreenEnabled === true;
  const fullscreen = button('view-fullscreen');
  fullscreen.classList.add('view-fullscreen');
  fullscreen.setAttribute('aria-label', i18n.t('view.fullscreen.ariaLabel'));
  fullscreen.setAttribute('aria-pressed', 'false');
  fullscreen.append(createIcon('maximize'));
  fullscreen.hidden = !fullscreenSupported;
  const settings = button('view-settings');
  settings.classList.add('view-settings');
  settings.setAttribute('aria-label', i18n.t('view.settings.ariaLabel'));
  settings.setAttribute('aria-expanded', 'false');
  settings.setAttribute('aria-controls', 'view-settings-panel');
  settings.append(createIcon('settings'));

  const panel = document.createElement('div');
  panel.id = 'view-settings-panel';
  panel.className = 'o-glass view-settings-panel';
  panel.setAttribute('data-testid', 'view-settings-panel');
  panel.hidden = true;
  const select = document.createElement('select');
  select.id = 'view-quality';
  select.className = 'view-quality';
  select.setAttribute('data-testid', 'view-quality');
  const selectLabel = document.createElement('label');
  selectLabel.htmlFor = select.id;
  selectLabel.textContent = i18n.t('view.quality.label');
  for (const value of ['auto', 'high', 'medium', 'low'] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = i18n.t(`view.quality.${value}`);
    select.append(option);
  }
  select.value = options.qualityValue ?? 'auto';
  const shortcuts = document.createElement('button');
  shortcuts.type = 'button';
  shortcuts.className = 'o-btn o-btn--outline view-shortcuts';
  shortcuts.setAttribute('data-testid', 'view-shortcuts');
  shortcuts.setAttribute('aria-haspopup', 'dialog');
  shortcuts.append(
    createIcon('keyboard'),
    label(i18n.t('view.shortcuts.text')),
  );
  const copyLink = document.createElement('button');
  copyLink.type = 'button';
  copyLink.className = 'o-btn o-btn--outline view-copy-link';
  copyLink.setAttribute('data-testid', 'view-copy-link');
  copyLink.append(createIcon('link'), label(i18n.t('view.copyLink.text')));
  const copyStatus = document.createElement('p');
  copyStatus.className = 'view-copy-status';
  // aria-live, not role="status": the announcer owns the one status region.
  copyStatus.setAttribute('aria-live', 'polite');
  copyStatus.setAttribute('data-testid', 'view-copy-status');
  panel.append(selectLabel, select, copyLink, copyStatus, shortcuts);
  if (options.qualityLocked) {
    const hint = document.createElement('p');
    hint.id = 'view-quality-hint';
    hint.className = 'view-quality-hint';
    hint.textContent = i18n.t('view.quality.lockedHint');
    select.disabled = true;
    select.setAttribute('aria-describedby', hint.id);
    panel.append(hint);
  }
  element.append(reset, orbits, zoomOut, zoomIn, fullscreen, settings, panel);

  element.addEventListener('click', onClick);
  element.addEventListener('keydown', onKeyDown);
  select.addEventListener('change', onSelectChange);
  if (fullscreenSupported) {
    document.addEventListener('fullscreenchange', syncFullscreen);
  }
  copyLink.addEventListener('click', onCopyClick);
  shortcuts.addEventListener('click', onShortcutsClick);
  if (options.before === undefined) {
    parent.append(element);
  } else {
    parent.insertBefore(element, options.before);
  }
  onOrbitsChange(visible);

  function setPanelOpen(open: boolean, restoreFocus: boolean): void {
    if (panelOpen === open) {
      return;
    }
    panelOpen = open;
    panel.hidden = !open;
    element.classList.toggle('has-panel', open);
    settings.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      document.addEventListener('pointerdown', onOutsidePointer, true);
    } else {
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      if (restoreFocus) {
        settings.focus();
      }
    }
  }

  function onOutsidePointer(event: Event): void {
    if (event.target instanceof Node && !element.contains(event.target)) {
      setPanelOpen(false, false);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.key !== 'Escape' || !panelOpen) {
      return;
    }
    // Esc closes the panel only; the card and the lists keep their state.
    event.stopPropagation();
    setPanelOpen(false, true);
  }

  function toggleFullscreen(): void {
    if (disposed || !fullscreenSupported) {
      return;
    }
    // The browser may refuse (no user gesture, a policy): the button then
    // simply stays as it is.
    const request =
      document.fullscreenElement === null
        ? document.documentElement.requestFullscreen()
        : document.exitFullscreen();
    request.catch(() => undefined);
  }

  function syncFullscreen(): void {
    const on = document.fullscreenElement !== null;
    fullscreen.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullscreen.replaceChildren(createIcon(on ? 'minimize' : 'maximize'));
  }

  function onShortcutsClick(): void {
    if (disposed) {
      return;
    }
    // The panel closes (a click on the dialog counts as outside it) and the
    // focus goes to the gear, which is where it comes back to.
    setPanelOpen(false, true);
    options.onShowShortcuts();
  }

  function onCopyClick(): void {
    if (disposed) {
      return;
    }
    void options.onCopyLink().then((copied) => {
      if (disposed) {
        return;
      }
      showCopyStatus(
        i18n.t(copied ? 'view.copyLink.done' : 'view.copyLink.failed'),
      );
    });
  }

  // The status is read out (aria-live) and leaves the panel soon after.
  function showCopyStatus(text: string): void {
    copyStatus.textContent = text;
    if (copyTimer !== null) {
      clearTimeout(copyTimer);
    }
    copyTimer = setTimeout(() => {
      copyTimer = null;
      copyStatus.textContent = '';
    }, COPY_STATUS_MS);
  }

  function onSelectChange(): void {
    // 'auto' is not a level, so the parse gives null: automatic.
    onQualityChange(parseQualityLevel(select.value));
  }

  function onClick(event: Event): void {
    if (disposed) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const control = target.closest('button');
    if (control === null || !element.contains(control)) {
      return;
    }
    // A zoom button at its limit stays in the Tab order and does nothing.
    if (control.getAttribute('aria-disabled') === 'true') {
      return;
    }
    const testId = control.getAttribute('data-testid');
    if (testId === 'view-fullscreen') {
      toggleFullscreen();
      return;
    }
    if (testId === 'view-settings') {
      setPanelOpen(!panelOpen, false);
      return;
    }
    if (testId === 'view-reset') {
      selection.showSystem();
      return;
    }
    if (testId === 'view-zoom-in') {
      onZoom(CAMERA_CONFIG.zoomStepIn);
      return;
    }
    if (testId === 'view-zoom-out') {
      onZoom(CAMERA_CONFIG.zoomStepOut);
      return;
    }
    if (testId !== 'view-orbits') {
      return;
    }
    visible = !visible;
    orbits.setAttribute('aria-pressed', visible ? 'true' : 'false');
    onOrbitsChange(visible);
    saveOrbitsVisible(storage, visible);
  }

  return {
    element,
    isOrbitsVisible(): boolean {
      return visible;
    },
    toggleFullscreen,
    setZoomLimits(nextAtMin: boolean, nextAtMax: boolean): void {
      if (disposed) {
        return;
      }
      if (nextAtMin !== atMin) {
        atMin = nextAtMin;
        setDisabled(zoomIn, atMin);
      }
      if (nextAtMax !== atMax) {
        atMax = nextAtMax;
        setDisabled(zoomOut, atMax);
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKeyDown);
      select.removeEventListener('change', onSelectChange);
      copyLink.removeEventListener('click', onCopyClick);
      shortcuts.removeEventListener('click', onShortcutsClick);
      if (copyTimer !== null) {
        clearTimeout(copyTimer);
        copyTimer = null;
      }
      element.remove();
    },
  };
}

function setDisabled(control: HTMLButtonElement, disabled: boolean): void {
  if (disabled) {
    control.setAttribute('aria-disabled', 'true');
  } else {
    control.removeAttribute('aria-disabled');
  }
}

function button(testId: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.setAttribute('type', 'button');
  control.className = 'o-btn';
  control.setAttribute('data-testid', testId);
  return control;
}

function label(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}
