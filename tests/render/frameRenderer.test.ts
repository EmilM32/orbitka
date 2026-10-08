import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Camera, Scene, WebGLRenderer } from 'three';
import { expect, test, vi } from 'vitest';

import { createFrameRenderer } from '@render/frameRenderer.ts';

function fakeRenderer() {
  const calls: string[] = [];
  const info = {
    autoReset: true,
    reset: vi.fn(() => {
      calls.push('reset');
    }),
  };
  const render = vi.fn(() => {
    calls.push('render');
  });
  return {
    calls,
    info,
    render,
    renderer: { info, render } as unknown as WebGLRenderer,
  };
}

test('frameRenderer › resets info once per frame', () => {
  const fake = fakeRenderer();
  const scene = {} as Scene;
  const camera = {} as Camera;
  const frame = createFrameRenderer({ renderer: fake.renderer, scene, camera });

  expect(fake.info.autoReset).toBe(false);
  frame.render();
  frame.render();
  expect(fake.calls).toEqual(['reset', 'render', 'reset', 'render']);
  expect(fake.render).toHaveBeenCalledWith(scene, camera);
  expect(frame.getPostFxDrawCalls()).toBe(0);

  frame.dispose();
  expect(fake.info.autoReset).toBe(true);
  frame.render();
  expect(fake.render).toHaveBeenCalledTimes(2);
  expect(() => frame.dispose()).not.toThrow();
});

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

test('frameRenderer › only frameRenderer calls renderer.render', () => {
  const callers = sourceFiles('src').filter((path) =>
    /renderer\.render\(/.test(readFileSync(path, 'utf8')),
  );

  expect(callers).toEqual([join('src', 'render', 'frameRenderer.ts')]);
});
