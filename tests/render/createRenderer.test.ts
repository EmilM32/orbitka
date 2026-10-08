// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class FakeWebGLRenderer {
    domElement: HTMLCanvasElement;

    constructor(options: { canvas: HTMLCanvasElement }) {
      this.domElement = options.canvas;
    }

    setClearColor(): void {}

    setPixelRatio(): void {}

    setSize(): void {}

    setAnimationLoop(): void {}

    render(): void {}

    dispose(): void {}

    forceContextLoss(): void {}
  }

  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

class RecordingResizeObserver {
  static latest: RecordingResizeObserver | null = null;

  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    RecordingResizeObserver.latest = this;
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

function setBodySize(width: number, height: number): void {
  Object.defineProperty(document.body, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(document.body, 'clientHeight', {
    configurable: true,
    get: () => height,
  });
}

test('createRenderer › resize does not reset camera', async () => {
  vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;

  setBodySize(1280, 720);
  const { createRenderer } = await import('@render/createRenderer.ts');
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const view = createRenderer(canvas);
  const start = view.camera.position.clone();

  view.camera.position.set(4, 5, 6);
  let width = 0;
  let height = 0;
  let calls = 0;
  const unsubscribe = view.onResize((nextWidth, nextHeight) => {
    calls += 1;
    width = nextWidth;
    height = nextHeight;
  });

  setBodySize(900, 1200);
  RecordingResizeObserver.latest?.callback(
    [],
    RecordingResizeObserver.latest as unknown as ResizeObserver,
  );

  expect(view.camera.position.x).toBe(4);
  expect(view.camera.position.y).toBe(5);
  expect(view.camera.position.z).toBe(6);
  expect(view.camera.position.distanceTo(start)).toBeGreaterThan(1);
  expect(view.camera.aspect).toBeCloseTo(900 / 1200, 8);
  expect(calls).toBe(1);
  expect(width).toBe(900);
  expect(height).toBe(1200);

  unsubscribe();
  setBodySize(1000, 800);
  RecordingResizeObserver.latest?.callback(
    [],
    RecordingResizeObserver.latest as unknown as ResizeObserver,
  );
  expect(calls).toBe(1);
  expect(view.camera.aspect).toBeCloseTo(1000 / 800, 8);
  expect(view.camera.position.x).toBe(4);

  view.dispose();
});

test('createRenderer › uses ACES tone mapping', async () => {
  vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
  setBodySize(1280, 720);
  const { ACESFilmicToneMapping } = await import('three');
  const { createRenderer } = await import('@render/createRenderer.ts');
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const view = createRenderer(canvas);

  expect(view.renderer.toneMapping).toBe(ACESFilmicToneMapping);
  expect(view.renderer.toneMappingExposure).toBe(1);
  view.dispose();
});
