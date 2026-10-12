import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  Raycaster,
  Scene,
  ShaderLib,
  Vector3,
} from 'three';
import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import { createBodies } from '@render/bodies.ts';
import {
  GRAVITY_GRID_DENSITY,
  buildGridPoints,
  createGravityGrid,
  patchGravityGrid,
} from '@render/gravityGrid.ts';
import { WELL, gridRadius } from '@sim/gravity.ts';

type FakeShader = {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, unknown>;
};

function setup() {
  const view = createBodies(bodies);
  const grid = createGravityGrid(bodies, view.meshes, 'high');
  const scene = new Scene();
  scene.add(view.group, grid.lines);
  return { view, grid, scene };
}

function geometry(grid: ReturnType<typeof setup>['grid']): BufferGeometry {
  return grid.lines.geometry;
}

// The lowest grid point within `radius` of (x, z), as a depth below the plane.
function deepestNear(
  grid: ReturnType<typeof setup>['grid'],
  x: number,
  z: number,
  radius: number,
): number {
  const position = geometry(grid).getAttribute('position');
  let deepest = 0;
  for (let index = 0; index < position.count; index += 1) {
    const dx = position.getX(index) - x;
    const dz = position.getZ(index) - z;
    if (Math.hypot(dx, dz) <= radius) {
      deepest = Math.max(deepest, -position.getY(index) - WELL.planeOffset);
    }
  }
  return deepest;
}

test('gravityGrid › grid points lie on the disc and pair up into segments', () => {
  const points = buildGridPoints(10, 2, 0.5);
  expect(points.xs.length).toBe(points.zs.length);
  for (let index = 0; index < points.xs.length; index += 1) {
    expect(
      Math.hypot(points.xs[index] ?? 0, points.zs[index] ?? 0),
    ).toBeLessThanOrEqual(10 + 1e-4);
  }
  expect(points.indices.length % 2).toBe(0);
  for (let index = 0; index < points.indices.length; index += 2) {
    const a = points.indices[index] ?? 0;
    const b = points.indices[index + 1] ?? 0;
    expect(b).toBe(a + 1);
    const length = Math.hypot(
      (points.xs[b] ?? 0) - (points.xs[a] ?? 0),
      (points.zs[b] ?? 0) - (points.zs[a] ?? 0),
    );
    expect(length).toBeLessThanOrEqual(0.5 + 1e-4);
  }
  // 11 lines along each axis (−10 … 10 every 2).
  const onAxis = [...points.zs.keys()].filter(
    (index) => points.zs[index] === 0 && (points.xs[index] ?? 0) < -9.99,
  );
  expect(onAxis).toHaveLength(1);
  expect(() => buildGridPoints(0, 1, 1)).toThrow(
    'buildGridPoints: parameter "radius" must be finite and > 0, got 0',
  );
  expect(() => buildGridPoints(10, Number.NaN, 1)).toThrow(RangeError);
});

test('gravityGrid › hidden at the start, a funnel under the Sun and each planet', () => {
  const { view, grid } = setup();
  expect(grid.isVisible()).toBe(false);
  expect(grid.lines.visible).toBe(false);

  // Hidden: nothing is computed, the grid stays flat.
  const position = geometry(grid).getAttribute('position');
  expect(position.getY(0)).toBe(-WELL.planeOffset);

  const earth = view.meshes.get('earth');
  const jupiter = view.meshes.get('jupiter');
  if (!earth || !jupiter) {
    throw new Error('missing meshes');
  }
  earth.position.set(8, 0, 0);
  jupiter.position.set(-18, 0, 6);
  grid.setVisible(true);
  expect(grid.isVisible()).toBe(true);

  const sunDepth = deepestNear(grid, 0, 0, 1);
  expect(sunDepth).toBeGreaterThan(0.9 * WELL.depth);
  // A planet's funnel is deeper than the grid just beside it.
  const besideEarth = deepestNear(grid, 8, 6, 0.4);
  expect(deepestNear(grid, 8, 0, 0.4)).toBeGreaterThan(besideEarth + 0.5);
  expect(deepestNear(grid, -18, 6, 1)).toBeGreaterThan(
    deepestNear(grid, -18, -6, 1) + 1,
  );
  for (let index = 0; index < position.count; index += 1) {
    expect(-position.getY(index) - WELL.planeOffset).toBeLessThanOrEqual(
      WELL.maxDepth + 1e-4,
    );
  }

  // The funnel follows the planet.
  earth.position.set(0, 0, -8);
  grid.update();
  expect(deepestNear(grid, 0, -8, 0.4)).toBeGreaterThan(
    deepestNear(grid, 6, -8, 0.4) + 0.5,
  );
});

test('gravityGrid › an unchanged frame does not upload the positions', () => {
  const { grid } = setup();
  grid.setVisible(true);
  const position = geometry(grid).getAttribute('position');
  if (!(position instanceof BufferAttribute)) {
    throw new Error('position is not a BufferAttribute');
  }
  const version = position.version;
  grid.update();
  expect(position.version).toBe(version);
});

test('gravityGrid › quality changes the density and keeps the funnels', () => {
  const { grid } = setup();
  grid.setVisible(true);
  const high = geometry(grid);
  const highCount = high.getAttribute('position').count;
  grid.setQuality('high');
  expect(geometry(grid)).toBe(high);

  grid.setQuality('low');
  const low = geometry(grid);
  expect(low).not.toBe(high);
  expect(low.getAttribute('position').count).toBeLessThan(highCount);
  expect(
    deepestNear(grid, 0, 0, GRAVITY_GRID_DENSITY.low.spacing),
  ).toBeGreaterThan(0.8 * WELL.depth);
  expect(low.boundingSphere?.radius).toBeGreaterThan(gridRadius(bodies));
});

test('gravityGrid › never hit by picking', () => {
  const { grid } = setup();
  grid.setVisible(true);
  const raycaster = new Raycaster(new Vector3(0, 50, 0), new Vector3(0, -1, 0));
  expect(raycaster.intersectObject(grid.lines)).toEqual([]);
});

test('gravityGrid › shader colors by depth and fades at the rim', () => {
  const { grid } = setup();
  const material = grid.lines.material as LineBasicMaterial;
  const shader: FakeShader = {
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(
    shader as unknown as Parameters<LineBasicMaterial['onBeforeCompile']>[0],
    undefined as never,
  );
  expect(shader.vertexShader).toContain('vGridDepth = -position.y');
  expect(shader.vertexShader).toContain('length( position.xz )');
  expect(shader.fragmentShader).toContain('* vGridRim');
  expect(material.depthWrite).toBe(false);
  expect(() =>
    patchGravityGrid(
      {
        vertexShader: 'void main() {}',
        fragmentShader: '',
        uniforms: {},
      } as unknown as Parameters<typeof patchGravityGrid>[0],
      10,
    ),
  ).toThrow('gravity grid patch: shader has no "#include <project_vertex>"');
});

test('gravityGrid › dispose frees the geometry and the material', () => {
  const { grid, scene } = setup();
  let geometryDisposed = 0;
  let materialDisposed = 0;
  geometry(grid).addEventListener('dispose', () => {
    geometryDisposed += 1;
  });
  (grid.lines.material as LineBasicMaterial).addEventListener('dispose', () => {
    materialDisposed += 1;
  });
  grid.dispose();
  grid.dispose();
  expect(geometryDisposed).toBe(1);
  expect(materialDisposed).toBe(1);
  expect(scene.children).not.toContain(grid.lines);
  expect(() => {
    grid.setVisible(true);
    grid.setQuality('low');
    grid.update();
  }).not.toThrow();
});

test('gravityGrid › a missing planet mesh is reported', () => {
  expect(() => createGravityGrid(bodies, new Map(), 'high')).toThrow(
    'createGravityGrid: missing mesh for body "mercury"',
  );
});
