import './viewControls.css';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { type Selection } from '@core/selection.ts';

import { type Dictionary, type I18n } from './i18n.ts';
import {
  loadOrbitsVisible,
  saveOrbitsVisible,
  type OrbitsStorage,
} from './orbitsPreference.ts';

type AppI18n = I18n<Dictionary>;

export type ViewControls = {
  element: HTMLElement;
  isOrbitsVisible(): boolean;
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

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createViewControls(
  parent: HTMLElement,
  options: ViewControlsOptions,
): ViewControls {
  const { i18n, selection, storage, onZoom, onOrbitsChange } = options;
  let visible = loadOrbitsVisible(storage);
  let disposed = false;

  const element = document.createElement('div');
  element.setAttribute('id', 'view-controls');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', i18n.t('view.group.label'));
  element.setAttribute('data-testid', 'view-controls');

  const reset = button('view-reset', i18n.t('view.reset.text'));
  const orbits = button('view-orbits', '');
  orbits.classList.add('view-orbits');
  orbits.setAttribute('title', i18n.t('view.orbits.title'));
  orbits.setAttribute('aria-pressed', visible ? 'true' : 'false');
  orbits.append(orbitIcon(), label(i18n.t('view.orbits.text')));
  const zoomIn = button('view-zoom-in', i18n.t('view.zoomIn.text'));
  zoomIn.setAttribute('aria-label', i18n.t('view.zoomIn.ariaLabel'));
  const zoomOut = button('view-zoom-out', i18n.t('view.zoomOut.text'));
  zoomOut.setAttribute('aria-label', i18n.t('view.zoomOut.ariaLabel'));
  element.append(reset, orbits, zoomIn, zoomOut);

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

function button(testId: string, text: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.setAttribute('type', 'button');
  control.setAttribute('data-testid', testId);
  control.textContent = text;
  return control;
}

function label(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function orbitIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const ellipse = document.createElementNS(SVG_NS, 'ellipse');
  ellipse.setAttribute('cx', '12');
  ellipse.setAttribute('cy', '12');
  ellipse.setAttribute('rx', '8');
  ellipse.setAttribute('ry', '4');
  ellipse.setAttribute('fill', 'none');
  ellipse.setAttribute('stroke', 'currentColor');
  ellipse.setAttribute('stroke-width', '1.5');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '18');
  dot.setAttribute('cy', '10');
  dot.setAttribute('r', '2');
  dot.setAttribute('fill', 'currentColor');
  const slash = document.createElementNS(SVG_NS, 'line');
  slash.setAttribute('class', 'view-orbits-off');
  slash.setAttribute('x1', '5');
  slash.setAttribute('y1', '19');
  slash.setAttribute('x2', '19');
  slash.setAttribute('y2', '5');
  slash.setAttribute('stroke', 'currentColor');
  slash.setAttribute('stroke-width', '1.5');
  svg.append(ellipse, dot, slash);
  return svg;
}
