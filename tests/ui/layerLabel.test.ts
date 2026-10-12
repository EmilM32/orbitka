// @vitest-environment jsdom

import { afterEach, expect, test } from 'vitest';

import {
  LAYER_LABEL_GAP_PX,
  createLayerLabel,
  placeLayerLabel,
  type LayerLabelPlacement,
} from '@ui/layerLabel.ts';

afterEach(() => {
  document.body.replaceChildren();
});

function placement(): LayerLabelPlacement {
  return { x: 0, y: 0, alignRight: false };
}

test('layerLabel › the pill sits outside the body on the ray to the layer', () => {
  const out = placement();
  placeLayerLabel(
    { anchorX: 380, anchorY: 300, centerX: 400, centerY: 300, radiusPx: 100 },
    out,
  );
  expect(out.x).toBeCloseTo(400 - 100 - LAYER_LABEL_GAP_PX);
  expect(out.y).toBeCloseTo(300);
  expect(out.alignRight).toBe(true);

  placeLayerLabel(
    { anchorX: 400, anchorY: 300, centerX: 400, centerY: 300, radiusPx: 50 },
    out,
  );
  expect(out.x).toBeLessThan(400);
  expect(out.y).toBeLessThan(300);
});

test('layerLabel › shows only with a text and a point', () => {
  const label = createLayerLabel(document.body);
  const point = {
    anchorX: 420,
    anchorY: 280,
    centerX: 400,
    centerY: 300,
    radiusPx: 80,
  };
  expect(label.element.getAttribute('aria-hidden')).toBe('true');
  label.update(point);
  expect(label.element.hidden).toBe(true);

  label.setText('Płaszcz');
  label.update(point);
  expect(label.element.hidden).toBe(false);
  expect(label.element.textContent).toBe('Płaszcz');
  expect(label.element.querySelector('line')?.getAttribute('x1')).toBe('420');

  label.update(null);
  expect(label.element.hidden).toBe(true);
  label.update(point);
  label.setText(null);
  expect(label.element.hidden).toBe(true);

  label.dispose();
  expect(document.getElementById('layer-label')).toBeNull();
});
