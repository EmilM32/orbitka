import { PerspectiveCamera, PointsMaterial, ShaderLib } from 'three';
import { expect, test, vi } from 'vitest';

import { STAR_COUNTS } from '@core/starfield.ts';
import { CAMERA_FAR } from '@render/camera.ts';
import {
  STARFIELD_RADIUS,
  STARFIELD_RENDER_ORDER,
  createStarfield,
} from '@render/starfield.ts';

function material(stars: ReturnType<typeof createStarfield>): PointsMaterial {
  const value = stars.points.material;
  if (!(value instanceof PointsMaterial)) {
    throw new Error('expected PointsMaterial');
  }
  return value;
}

test('starfield mesh › points material settings', () => {
  const stars = createStarfield(STAR_COUNTS.high);
  const points = material(stars);
  expect(points.sizeAttenuation).toBe(false);
  expect(points.depthWrite).toBe(false);
  expect(points.vertexColors).toBe(true);
  expect(points.transparent).toBe(true);
  expect(stars.points.frustumCulled).toBe(false);
  expect(stars.points.renderOrder).toBe(STARFIELD_RENDER_ORDER);
  expect(STARFIELD_RADIUS).toBeLessThan(CAMERA_FAR);

  const geometry = stars.points.geometry;
  expect(geometry.drawRange.count).toBe(STAR_COUNTS.high);
  expect(geometry.getAttribute('position').count).toBe(STAR_COUNTS.high);
  expect(geometry.getAttribute('color').count).toBe(STAR_COUNTS.high);
  expect(geometry.getAttribute('starSize').count).toBe(STAR_COUNTS.high);

  stars.setCount(STAR_COUNTS.low);
  expect(stars.points.geometry.drawRange.count).toBe(STAR_COUNTS.low);
  stars.dispose();
});

test('starfield mesh › per-star size patch', () => {
  const stars = createStarfield(10);
  const shader = {
    vertexShader: ShaderLib.points.vertexShader,
    fragmentShader: ShaderLib.points.fragmentShader,
    uniforms: {},
  };
  material(stars).onBeforeCompile(
    shader as unknown as Parameters<PointsMaterial['onBeforeCompile']>[0],
    undefined as never,
  );
  expect(shader.vertexShader).toContain('attribute float starSize;');
  expect(shader.vertexShader).toContain('gl_PointSize = size * starSize;');
  stars.dispose();
});

test('starfield mesh › setCount with the same count does not reallocate', () => {
  const stars = createStarfield(STAR_COUNTS.medium);
  const geometry = stars.points.geometry;
  const dispose = vi.spyOn(geometry, 'dispose');

  stars.setCount(STAR_COUNTS.medium);
  expect(stars.points.geometry).toBe(geometry);
  stars.setCount(STAR_COUNTS.low);
  expect(stars.points.geometry).toBe(geometry);
  stars.setCount(STAR_COUNTS.medium);
  expect(stars.points.geometry).toBe(geometry);
  expect(dispose).not.toHaveBeenCalled();

  // More than ever allocated: a new geometry, the old one freed.
  stars.setCount(STAR_COUNTS.high);
  expect(stars.points.geometry).not.toBe(geometry);
  expect(stars.points.geometry.drawRange.count).toBe(STAR_COUNTS.high);
  expect(dispose).toHaveBeenCalledTimes(1);

  expect(() => stars.setCount(-1)).toThrow(
    'setCount: parameter "count" must be an integer >= 0, got -1',
  );
  stars.dispose();
});

test('starfield mesh › follows the camera position, not its rotation', () => {
  const stars = createStarfield(100);
  const camera = new PerspectiveCamera();
  camera.position.set(12, -4, 90);
  camera.rotation.set(0.3, 1.1, 0);
  stars.update(camera);
  expect(stars.points.position.toArray()).toEqual([12, -4, 90]);
  expect(stars.points.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  stars.dispose();
});

test('starfield mesh › dispose frees geometry and material', () => {
  const stars = createStarfield(100);
  const geometry = vi.spyOn(stars.points.geometry, 'dispose');
  const points = vi.spyOn(material(stars), 'dispose');
  stars.dispose();
  stars.dispose();
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(points).toHaveBeenCalledTimes(1);
});
