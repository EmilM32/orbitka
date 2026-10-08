import {
  Group,
  Mesh,
  Object3D,
  type Camera,
  type BufferGeometry,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { expect, test, vi } from 'vitest';

import {
  getRenderStats,
  isDebugObject,
  trackDebugDrawCalls,
} from '@render/renderStats.ts';

// Calls the hook the way WebGLRenderer does for every draw call.
function draw(object: Object3D): void {
  object.onBeforeRender(
    {} as WebGLRenderer,
    {} as Scene,
    {} as Camera,
    {} as BufferGeometry,
    {} as Material,
    new Group(),
  );
}

function debugObject(): Object3D {
  const object = new Object3D();
  object.userData.debug = true;
  return object;
}

test('renderStats › counts', () => {
  const info = { render: { calls: 12, triangles: 34_560 } };
  const source = { info };
  const stats = getRenderStats(source);

  expect(stats).toEqual({
    drawCalls: 12,
    debugDrawCalls: 0,
    postFxDrawCalls: 0,
    triangles: 34_560,
    textureMiB: 0,
  });
  stats.drawCalls = 0;
  stats.triangles = 1;
  expect(source.info.render).toEqual({ calls: 12, triangles: 34_560 });

  for (const calls of [Number.NaN, -1]) {
    const call = () =>
      getRenderStats({ info: { render: { calls, triangles: 1 } } });
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `getRenderStats: parameter "calls" must be finite and >= 0, got ${calls}`,
    );
  }

  expect(() =>
    getRenderStats({
      info: { render: { calls: 1, triangles: Number.NEGATIVE_INFINITY } },
    }),
  ).toThrow('"triangles"');
});

test('renderStats › debug draw calls are kept apart', () => {
  const source = { info: { render: { calls: 31, triangles: 30_000 } } };

  expect(getRenderStats(source, { debugDrawCalls: 9 })).toEqual({
    drawCalls: 22,
    debugDrawCalls: 9,
    postFxDrawCalls: 0,
    triangles: 30_000,
    textureMiB: 0,
  });
  expect(getRenderStats(source, { debugDrawCalls: 31 }).drawCalls).toBe(0);

  for (const debugDrawCalls of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    const call = () => getRenderStats(source, { debugDrawCalls });
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `getRenderStats: parameter "debugDrawCalls" must be finite and >= 0, got ${debugDrawCalls}`,
    );
  }

  const tooMany = () => getRenderStats(source, { debugDrawCalls: 32 });
  expect(tooMany).toThrow(RangeError);
  expect(tooMany).toThrow(
    'getRenderStats: parameters "debugDrawCalls" + "postFxDrawCalls" must be <= calls (31), got 32',
  );
});

test('renderStats › subtracts debug and postFx', () => {
  const source = { info: { render: { calls: 30, triangles: 26_432 } } };

  expect(
    getRenderStats(source, {
      debugDrawCalls: 3,
      postFxDrawCalls: 0,
      textureMiB: 2.5,
    }),
  ).toEqual({
    drawCalls: 27,
    debugDrawCalls: 3,
    postFxDrawCalls: 0,
    triangles: 26_432,
    textureMiB: 2.5,
  });
  expect(
    getRenderStats(source, { debugDrawCalls: 3, postFxDrawCalls: 4 }).drawCalls,
  ).toBe(23);

  // The first frame: fewer calls than the debug and post-processing parts.
  const negative = () =>
    getRenderStats(
      { info: { render: { calls: 2, triangles: 0 } } },
      { debugDrawCalls: 2, postFxDrawCalls: 1 },
    );
  expect(negative).toThrow(RangeError);
  expect(negative).toThrow('must be <= calls (2), got 3');

  for (const value of [Number.NaN, -1]) {
    expect(() => getRenderStats(source, { postFxDrawCalls: value })).toThrow(
      `getRenderStats: parameter "postFxDrawCalls" must be finite and >= 0, got ${value}`,
    );
    expect(() => getRenderStats(source, { textureMiB: value })).toThrow(
      `getRenderStats: parameter "textureMiB" must be finite and >= 0, got ${value}`,
    );
  }
});

test('renderStats › isDebugObject', () => {
  expect(isDebugObject(debugObject())).toBe(true);
  expect(isDebugObject(new Object3D())).toBe(false);

  const truthy = new Object3D();
  truthy.userData.debug = 1;
  expect(isDebugObject(truthy)).toBe(false);
});

test('renderStats › trackDebugDrawCalls counts marked objects only', () => {
  const root = new Group();
  const plain = new Mesh();
  const nested = debugObject();
  const direct = debugObject();
  plain.add(nested);
  root.add(plain, direct);
  const plainHook = plain.onBeforeRender;

  const counter = trackDebugDrawCalls(root);
  expect(counter.count).toBe(0);
  expect(plain.onBeforeRender).toBe(plainHook);

  draw(plain);
  draw(nested);
  draw(direct);
  draw(direct);
  expect(counter.count).toBe(3);

  counter.reset();
  expect(counter.count).toBe(0);
  draw(nested);
  expect(counter.count).toBe(1);

  const late = debugObject();
  root.add(late);
  draw(late);
  expect(counter.count).toBe(1);
});

test('renderStats › trackDebugDrawCalls keeps and restores the old hook', () => {
  const root = new Group();
  const object = debugObject();
  const previous = vi.fn();
  object.onBeforeRender = previous;
  root.add(object);

  const counter = trackDebugDrawCalls(root);
  expect(object.onBeforeRender).not.toBe(previous);
  draw(object);
  expect(counter.count).toBe(1);
  expect(previous).toHaveBeenCalledTimes(1);
  expect(previous.mock.contexts[0]).toBe(object);

  counter.dispose();
  expect(object.onBeforeRender).toBe(previous);
  draw(object);
  expect(counter.count).toBe(1);

  counter.dispose();
  expect(object.onBeforeRender).toBe(previous);
});
