import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test, vi } from 'vitest';

import type { ResizeListener } from '@render/createRenderer.ts';
import { createCamera } from '@render/camera.ts';
import {
  createBodyProjector,
  type ProjectorEntry,
} from '@render/bodyProjector.ts';
import {
  getBodyScreenPositions,
  type ScreenBody,
} from '@render/screenPositions.ts';

const WIDTH = 1280;
const HEIGHT = 720;

type ResizeView = {
  onResize(listener: ResizeListener): () => void;
  fire(width: number, height: number): void;
  rectReads: number;
  getBoundingClientRect(): { left: number; top: number };
};

function resizeView(): ResizeView {
  let listener: ResizeListener | null = null;
  return {
    rectReads: 0,
    onResize(next) {
      listener = next;
      return () => {
        if (listener === next) {
          listener = null;
        }
      };
    },
    fire(width, height) {
      listener?.(width, height);
    },
    getBoundingClientRect() {
      this.rectReads += 1;
      return { left: 0, top: 0 };
    },
  };
}

function screenBodies(entries: readonly ProjectorEntry[]): ScreenBody[] {
  return entries.map((entry) => ({
    id: entry.id,
    type: 'planet',
    position: entry.position,
  }));
}

function behindCamera(camera: PerspectiveCamera): {
  x: number;
  y: number;
  z: number;
} {
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const point = camera.position.clone().addScaledVector(forward, -30);
  return { x: point.x, y: point.y, z: point.z };
}

test('projects to css pixels', () => {
  const camera = createCamera(16 / 9);
  const closer = {
    x: camera.position.x * 0.25,
    y: camera.position.y * 0.25,
    z: camera.position.z * 0.25,
  };
  const entries: ProjectorEntry[] = [
    { id: 'earth', position: { x: 8, y: 1, z: 2 }, displayRadius: 1.5 },
    { id: 'mars', position: closer, displayRadius: 1.5 },
    {
      id: 'neptune',
      position: behindCamera(camera),
      displayRadius: 1.5,
    },
  ];
  const view = resizeView();
  const projector = createBodyProjector(entries, view);

  expect(projector.frame.x).toBeInstanceOf(Float64Array);
  expect(projector.frame.y).toBeInstanceOf(Float64Array);
  expect(projector.frame.depth).toBeInstanceOf(Float64Array);
  expect(projector.frame.radiusPx).toBeInstanceOf(Float64Array);

  projector.update(camera, WIDTH, HEIGHT);
  const expected = getBodyScreenPositions(
    screenBodies(entries),
    camera,
    WIDTH,
    HEIGHT,
  );

  for (let index = 0; index < entries.length; index += 1) {
    const screen = expected[index];
    if (screen === undefined) {
      throw new Error(`missing screen position ${index}`);
    }
    expect(projector.frame.x[index]).toBeCloseTo(screen.x, 6);
    expect(projector.frame.y[index]).toBeCloseTo(screen.y, 6);
    expect(projector.frame.visible[index]).toBe(screen.visible ? 1 : 0);
  }

  const earth = projector.frame.radiusPx[0] ?? 0;
  const mars = projector.frame.radiusPx[1] ?? 0;
  expect(mars).toBeGreaterThan(earth);
  expect(projector.frame.depth[1]).toBeLessThan(projector.frame.depth[0] ?? 0);
  expect(projector.frame.visible[2]).toBe(0);
  expect(projector.frame.radiusPx[2]).toBe(0);

  projector.dispose();
  projector.dispose();
});

test('depth is camera space', () => {
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const projector = createBodyProjector(
    [{ id: 'earth', position: { x: 5, y: 0, z: 0 }, displayRadius: 1 }],
    resizeView(),
  );
  projector.update(camera, 200, 200);

  expect(projector.frame.depth[0]).toBeCloseTo(30, 6);
  expect(projector.frame.depth[0]).not.toBeCloseTo(Math.hypot(5, 30), 1);
  projector.dispose();
});

test('update after camera matrix update', () => {
  const camera = createCamera(16 / 9);
  const entries: ProjectorEntry[] = [
    { id: 'earth', position: { x: 8, y: 1, z: 2 }, displayRadius: 1.5 },
  ];
  const projector = createBodyProjector(entries, resizeView());
  projector.update(camera, WIDTH, HEIGHT);

  camera.position.set(12, -4, 25);
  camera.lookAt(1, 2, 3);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  projector.update(camera, WIDTH, HEIGHT);

  const expected = getBodyScreenPositions(
    screenBodies(entries),
    camera,
    WIDTH,
    HEIGHT,
  );
  expect(projector.frame.x[0]).toBeCloseTo(expected[0]?.x ?? Number.NaN, 6);
  expect(projector.frame.y[0]).toBeCloseTo(expected[0]?.y ?? Number.NaN, 6);
  expect(projector.frame.visible[0]).toBe(expected[0]?.visible ? 1 : 0);
  projector.dispose();
});

test('canvas rect cached until resize', () => {
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const view = resizeView();
  const projector = createBodyProjector(
    [{ id: 'sun', position: { x: 0, y: 0, z: 0 }, displayRadius: 2 }],
    view,
  );

  projector.update(camera, 0, 0);
  expect(projector.frame.x[0]).toBe(0);
  expect(Number.isFinite(projector.frame.x[0])).toBe(true);
  expect(view.rectReads).toBe(0);

  projector.update(camera, 640, 360);
  expect(projector.frame.x[0]).toBeCloseTo(320, 6);
  expect(projector.frame.y[0]).toBeCloseTo(180, 6);

  view.fire(800, 600);
  projector.update(camera, 100, 100);
  expect(projector.frame.x[0]).toBeCloseTo(400, 6);
  expect(projector.frame.y[0]).toBeCloseTo(300, 6);
  expect(view.rectReads).toBe(0);

  const cachedX = projector.frame.x[0] ?? 0;
  const cachedDepth = projector.frame.depth[0] ?? 0;
  projector.update(camera, 0, 0);
  expect(projector.frame.x[0]).toBe(cachedX);
  expect(projector.frame.depth[0]).toBe(cachedDepth);
  expect(Number.isNaN(projector.frame.x[0])).toBe(false);

  view.fire(200, 100);
  projector.update(camera, 800, 600);
  expect(projector.frame.x[0]).toBeCloseTo(100, 6);
  expect(projector.frame.y[0]).toBeCloseTo(50, 6);
  expect(view.rectReads).toBe(0);
  projector.dispose();
});

test('update does not allocate', () => {
  const camera = createCamera(16 / 9);
  const projector = createBodyProjector(
    [
      { id: 'earth', position: { x: 8, y: 0, z: 0 }, displayRadius: 1.5 },
      { id: 'mars', position: { x: -4, y: 2, z: 1 }, displayRadius: 1 },
    ],
    resizeView(),
  );
  projector.update(camera, WIDTH, HEIGHT);

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 1000; index += 1) {
      projector.update(camera, WIDTH, HEIGHT);
    }
  } finally {
    const pushCalls = push.mock.calls.length;
    const spliceCalls = splice.mock.calls.length;
    const mapSetCalls = mapSet.mock.calls.length;
    push.mockRestore();
    splice.mockRestore();
    mapSet.mockRestore();
    expect(pushCalls).toBe(0);
    expect(spliceCalls).toBe(0);
    expect(mapSetCalls).toBe(0);
  }

  projector.dispose();
});
