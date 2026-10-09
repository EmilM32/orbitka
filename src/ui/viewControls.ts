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

export type ViewControls = {
  element: HTMLElement;
  isOrbitsVisible(): boolean;
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
  panel.append(selectLabel, select);
  if (options.qualityLocked) {
    const hint = document.createElement('p');
    hint.id = 'view-quality-hint';
    hint.className = 'view-quality-hint';
    hint.textContent = i18n.t('view.quality.lockedHint');
    select.disabled = true;
    select.setAttribute('aria-describedby', hint.id);
    panel.append(hint);
  }
  element.append(reset, orbits, zoomOut, zoomIn, settings, panel);

  element.addEventListener('click', onClick);
  element.addEventListener('keydown', onKeyDown);
  select.addEventListener('change', onSelectChange);
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
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKeyDown);
      select.removeEventListener('change', onSelectChange);
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
