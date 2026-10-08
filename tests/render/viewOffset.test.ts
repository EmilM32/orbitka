import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PerspectiveCamera } from 'three';
import { expect, test, vi } from 'vitest';

import { createViewInsets, type ViewInsetsStore } from '@core/viewInsets.ts';
import {
  createViewOffsetRig,
  VIEW_OFFSET_SMOOTHING_MS,
  type ViewOffsetRig,
} from '@render/viewOffset.ts';

const FRAME_SECONDS = 1 / 60;

type Motion = {
  matches: boolean;
  subscribe(listener: () => void): () => void;
  emit(): void;
  listeners: number;
};

function motion(matches = false): Motion {
  const listeners = new Set<() => void>();
  return {
    matches,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit() {
      for (const listener of listeners) {
        listener();
      }
    },
    get listeners() {
      return listeners.size;
    },
  };
}

function setup(matches = false): {
  camera: PerspectiveCamera;
  insets: ViewInsetsStore;
  rig: ViewOffsetRig;
  reduced: Motion;
} {
  const camera = new PerspectiveCamera(45, 1280 / 720, 0.1, 2000);
  const insets = createViewInsets();
  const reduced = motion(matches);
  const rig = createViewOffsetRig({
    camera,
    insets,
    reducedMotion: reduced,
    widthCss: 1280,
    heightCss: 720,
  });
  return { camera, insets, rig, reduced };
}

function run(rig: ViewOffsetRig, seconds: number): void {
  let left = seconds;
  while (left > 1e-9) {
    const step = Math.min(FRAME_SECONDS, left);
    rig.update(step);
    left -= step;
  }
}

function offset(rig: ViewOffsetRig): { x: number; y: number } {
  return rig.getOffset({ x: Number.NaN, y: Number.NaN });
}

test('targets half of the insets', () => {
  const { camera, insets, rig } = setup();
  insets.set({ right: 352, bottom: 0 });
  run(rig, VIEW_OFFSET_SMOOTHING_MS / 1000);
  expect(camera.view?.enabled).toBe(true);
  expect(camera.view?.offsetX).toBeCloseTo(176, 1);
  expect(Math.abs((camera.view?.offsetX ?? 0) - 176)).toBeLessThanOrEqual(0.5);
  expect(camera.view?.offsetY).toBe(0);
  expect(camera.view?.fullWidth).toBe(1280);
  expect(camera.view?.width).toBe(1280);
  expect(offset(rig)).toEqual({ x: 176, y: 0 });
});

test('smooths over 220 ms', () => {
  const { insets, rig } = setup();
  insets.set({ right: 352, bottom: 300 });
  run(rig, 0.11);
  const middle = offset(rig);
  expect(middle.x).toBeGreaterThan(0);
  expect(middle.x).toBeLessThan(176);
  expect(middle.y).toBeGreaterThan(0);
  expect(middle.y).toBeLessThan(150);
  run(rig, 0.11);
  expect(offset(rig)).toEqual({ x: 176, y: 150 });
});

test('jumps under reduced motion', () => {
  const { camera, insets, rig } = setup(true);
  insets.set({ right: 352, bottom: 0 });
  expect(camera.view?.offsetX).toBe(176);
  expect(offset(rig).x).toBe(176);
});

test('switching to reduced motion mid-way jumps to the target', () => {
  const { camera, insets, rig, reduced } = setup();
  insets.set({ right: 352, bottom: 0 });
  run(rig, 0.05);
  reduced.matches = true;
  reduced.emit();
  expect(camera.view?.offsetX).toBe(176);
});

test('clears once at zero', () => {
  const { camera, insets, rig } = setup();
  const clear = vi.spyOn(camera, 'clearViewOffset');
  run(rig, 0.1);
  expect(clear).not.toHaveBeenCalled();
  insets.set({ right: 352, bottom: 0 });
  run(rig, 0.3);
  insets.set({ right: 0, bottom: 0 });
  run(rig, 0.5);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(camera.view?.enabled ?? false).toBe(false);
});

test('stable frames do not touch the projection', () => {
  const { camera, insets, rig } = setup();
  insets.set({ right: 352, bottom: 0 });
  run(rig, 0.3);
  const set = vi.spyOn(camera, 'setViewOffset');
  const clear = vi.spyOn(camera, 'clearViewOffset');
  run(rig, 1);
  expect(set).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
});

test('dispose clears and unsubscribes', () => {
  const { camera, insets, rig, reduced } = setup(true);
  insets.set({ right: 352, bottom: 0 });
  rig.dispose();
  expect(camera.view?.enabled ?? false).toBe(false);
  expect(reduced.listeners).toBe(0);
  const set = vi.spyOn(camera, 'setViewOffset');
  insets.set({ right: 100, bottom: 0 });
  rig.update(FRAME_SECONDS);
  rig.resize(800, 600);
  expect(set).not.toHaveBeenCalled();
  rig.dispose();
});

test('clamps insets larger than the viewport', () => {
  const { insets, rig } = setup(true);
  insets.set({ right: 2000, bottom: 5000 });
  const clamped = offset(rig);
  expect(clamped.x).toBeLessThanOrEqual(639.5);
  expect(clamped.x).toBe(639.5);
  expect(clamped.y).toBe(359.5);
});

test('resize retargets without a jump', () => {
  const { camera, insets, rig } = setup();
  insets.set({ right: 2000, bottom: 0 });
  run(rig, 0.1);
  const before = offset(rig).x;
  rig.resize(1000, 720);
  expect(offset(rig).x).toBe(before);
  expect(camera.view?.fullWidth).toBe(1000);
  run(rig, 0.3);
  expect(offset(rig).x).toBe(499.5);
});

test('update does not allocate', () => {
  const { insets, rig } = setup();
  insets.set({ right: 352, bottom: 120 });
  const originalPush = Array.prototype.push;
  let pushes = 0;
  Array.prototype.push = function patched(
    this: unknown[],
    ...items: unknown[]
  ): number {
    pushes += 1;
    return originalPush.apply(this, items);
  };
  try {
    for (let frame = 0; frame < 1000; frame += 1) {
      rig.update(FRAME_SECONDS);
    }
  } finally {
    Array.prototype.push = originalPush;
  }
  expect(pushes).toBe(0);
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

test('only viewOffset.ts calls setViewOffset', () => {
  const root = process.cwd();
  const callers = sourceFiles(join(root, 'src')).filter((path) =>
    /\b(?:setViewOffset|clearViewOffset)\(/.test(readFileSync(path, 'utf8')),
  );
  expect(callers.map((path) => relative(root, path))).toEqual([
    'src/render/viewOffset.ts',
  ]);
});
