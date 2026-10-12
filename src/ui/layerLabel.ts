import './layerLabel.css';

// The label of the chosen cutaway layer (EMI-267): a pill beside the body
// and a thin line to the layer. The legend on the card says the same thing
// to screen readers, so this layer is hidden from them.

const SVG_NS = 'http://www.w3.org/2000/svg';
// The pill sits this far outside the body's outline, CSS px.
export const LAYER_LABEL_GAP_PX = 36;

export type LayerLabelPoint = {
  anchorX: number;
  anchorY: number;
  centerX: number;
  centerY: number;
  radiusPx: number;
};

export type LayerLabelPlacement = {
  x: number;
  y: number;
  /** The pill grows to the left of `x` when true. */
  alignRight: boolean;
};

/**
 * Puts the pill on the ray from the body center through the layer, just
 * outside the outline. A layer at the center falls back to the upper left.
 */
export function placeLayerLabel(
  point: LayerLabelPoint,
  out: LayerLabelPlacement,
): void {
  let dx = point.anchorX - point.centerX;
  let dy = point.anchorY - point.centerY;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    dx = -Math.SQRT1_2;
    dy = -Math.SQRT1_2;
  } else {
    dx /= length;
    dy /= length;
  }
  const reach = Math.max(point.radiusPx, 0) + LAYER_LABEL_GAP_PX;
  out.x = point.centerX + dx * reach;
  out.y = point.centerY + dy * reach;
  out.alignRight = dx < 0;
}

export type LayerLabel = {
  readonly element: HTMLElement;
  setText(text: string | null): void;
  /** Null hides the label. */
  update(point: LayerLabelPoint | null): void;
  dispose(): void;
};

export function createLayerLabel(parent: HTMLElement): LayerLabel {
  const element = document.createElement('div');
  element.id = 'layer-label';
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('layer-label__leader');
  const line = document.createElementNS(SVG_NS, 'line');
  svg.append(line);
  const pill = document.createElement('span');
  pill.className = 'layer-label__pill';
  pill.setAttribute('data-testid', 'layer-label');
  element.append(svg, pill);
  parent.append(element);

  const placement: LayerLabelPlacement = { x: 0, y: 0, alignRight: false };
  let text: string | null = null;
  let disposed = false;

  return {
    element,
    setText(next: string | null): void {
      if (disposed || next === text) {
        return;
      }
      text = next;
      pill.textContent = next ?? '';
      if (next === null) {
        element.hidden = true;
      }
    },
    update(point: LayerLabelPoint | null): void {
      if (disposed) {
        return;
      }
      if (point === null || text === null) {
        element.hidden = true;
        return;
      }
      placeLayerLabel(point, placement);
      line.setAttribute('x1', round(point.anchorX));
      line.setAttribute('y1', round(point.anchorY));
      line.setAttribute('x2', round(placement.x));
      line.setAttribute('y2', round(placement.y));
      pill.style.transform =
        `translate(${round(placement.x)}px, ${round(placement.y)}px) ` +
        `translate(${placement.alignRight ? '-100%' : '0'}, -50%)`;
      element.hidden = false;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      element.remove();
    },
  };
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}
