import './viewControls.css';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
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
  before?: Node;
};

export function createViewControls(
  parent: HTMLElement,
  options: ViewControlsOptions,
): ViewControls {
  const { i18n, selection, storage, onZoom, onOrbitsChange } = options;
  let visible = loadOrbitsVisible(storage);
  let disposed = false;
  let atMin = false;
  let atMax = false;

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
  element.append(reset, orbits, zoomOut, zoomIn);

  element.addEventListener('click', onClick);
  if (options.before === undefined) {
    parent.append(element);
  } else {
    parent.insertBefore(element, options.before);
  }
  onOrbitsChange(visible);

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
      element.removeEventListener('click', onClick);
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
