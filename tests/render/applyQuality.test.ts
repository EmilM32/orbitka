import { SphereGeometry } from 'three';
import { expect, test, vi } from 'vitest';

import type { QualityLevel } from '@core/quality.ts';
import { bodies } from '@data/bodies.ts';
import { applyQualityLevel } from '@render/applyQuality.ts';
import { createBodies } from '@render/bodies.ts';
import { TEXTURE_LIMITS } from '@render/textureStore.ts';

const EXPECTED: Record<
  QualityLevel,
  {
    segments: { sun: number; planet: number; moon: number };
    stars: number;
    pixelRatioCap: number | null;
  }
> = {
  high: {
    segments: { sun: 96, planet: 64, moon: 32 },
    stars: 4000,
    pixelRatioCap: null,
  },
  medium: {
    segments: { sun: 96, planet: 64, moon: 32 },
    stars: 2500,
    pixelRatioCap: null,
  },
  low: {
    segments: { sun: 64, planet: 48, moon: 32 },
    stars: 1200,
    pixelRatioCap: 1,
  },
};

function widthSegments(geometry: unknown): number {
  if (!(geometry instanceof SphereGeometry)) {
    throw new Error('expected a sphere geometry');
  }
  return geometry.parameters.widthSegments;
}

function mount() {
  const view = createBodies(bodies);
  const starfield = { setCount: vi.fn<(count: number) => void>() };
  const textureStore = { setLimits: vi.fn() };
  const pixelView = { setPixelRatioCap: vi.fn() };
  const targets = {
    spheres: view.spheres,
    starfield,
    textureStore,
    view: pixelView,
  };
  return { view, targets, starfield, textureStore, pixelView };
}

test('applies level table', () => {
  for (const level of ['high', 'medium', 'low'] as const) {
    const { view, targets, starfield, textureStore, pixelView } = mount();

    applyQualityLevel(level, targets);

    const expected = EXPECTED[level];
    for (const sphere of view.spheres) {
      expect(widthSegments(sphere.mesh.geometry)).toBe(
        expected.segments[sphere.kind],
      );
    }
    expect(starfield.setCount).toHaveBeenLastCalledWith(expected.stars);
    expect(pixelView.setPixelRatioCap).toHaveBeenLastCalledWith(
      expected.pixelRatioCap,
    );
    expect(textureStore.setLimits).toHaveBeenLastCalledWith(
      TEXTURE_LIMITS[level],
    );
    view.dispose();
  }
});

test('texture limits per level', () => {
  expect(TEXTURE_LIMITS.high).toEqual({
    detailedResolution: '2k',
    detailedSlots: 2,
    memoryMiB: 48,
  });
  expect(TEXTURE_LIMITS.medium).toEqual({
    detailedResolution: '1k',
    detailedSlots: 2,
    memoryMiB: 24,
  });
  expect(TEXTURE_LIMITS.low).toEqual({
    detailedResolution: '1k',
    detailedSlots: 1,
    memoryMiB: 16,
  });
});

test('swaps the geometry on the same mesh and disposes the old one', () => {
  const { view, targets } = mount();
  const earth = view.meshes.get('earth');
  if (earth === undefined) {
    throw new Error('missing Earth');
  }
  const before = earth.geometry;
  const dispose = vi.spyOn(before, 'dispose');
  const position = earth.position.clone();
  const children = view.group.children.length;

  applyQualityLevel('low', targets);

  expect(view.meshes.get('earth')).toBe(earth);
  expect(earth.geometry).not.toBe(before);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(earth.position.equals(position)).toBe(true);
  expect(view.group.children).toHaveLength(children);
  expect(widthSegments(earth.geometry)).toBe(48);
  expect((earth.geometry as SphereGeometry).parameters.radius).toBeCloseTo(
    view.radii.get('earth') ?? 0,
    9,
  );
  view.dispose();
});

test('keeps the geometry when the segments are the same', () => {
  const { view, targets } = mount();
  const earth = view.meshes.get('earth');
  const before = earth?.geometry;

  applyQualityLevel('medium', targets);
  applyQualityLevel('high', targets);

  expect(earth?.geometry).toBe(before);
  view.dispose();
});

test('goes back to the detailed spheres after low', () => {
  const { view, targets } = mount();

  applyQualityLevel('low', targets);
  applyQualityLevel('high', targets);

  const sun = view.meshes.get('sun');
  expect(widthSegments(sun?.geometry)).toBe(96);
  view.dispose();
});

test('keeps the ring on Saturn after a swap', () => {
  const { view, targets } = mount();
  const saturn = view.meshes.get('saturn');
  const ring = view.rings.get('saturn');

  applyQualityLevel('low', targets);

  expect(ring).toBeDefined();
  expect(saturn?.children).toContain(ring?.mesh);
  view.dispose();
});
