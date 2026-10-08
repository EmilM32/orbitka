import { MeshStandardMaterial, Texture, type WebGLRenderer } from 'three';
import { expect, test, vi } from 'vitest';

import { bodies } from '@data/bodies.ts';
import { createBodies } from '@render/bodies.ts';
import { SPHERE_SEGMENTS_DETAILED } from '@render/sphereFactory.ts';
import { createTextureMemory } from '@render/textureMemory.ts';
import {
  TEXTURE_LIMITS,
  createTextureStore,
  type TextureLimits,
  type TextureLoaderLike,
} from '@render/textureStore.ts';

const BASE_URL = '/assets/textures/';
const SIZES: Record<string, [number, number]> = {
  '512': [512, 256],
  '1k': [1024, 512],
  '2k': [2048, 1024],
};

type Pending = {
  url: string;
  resolve: () => void;
  reject: () => void;
};

function textureFor(url: string): Texture {
  const resolution = url.slice(BASE_URL.length).split('/')[0] ?? '';
  const [width, height] = SIZES[resolution] ?? [1, 1];
  const texture = new Texture();
  texture.image = { width, height };
  return texture;
}

// Loads resolve only when the test says so.
function createDeferredLoader() {
  const pending: Pending[] = [];
  const textures = new Map<string, Texture[]>();
  const loader: TextureLoaderLike = {
    loadAsync(url) {
      return new Promise<Texture>((resolve, reject) => {
        pending.push({
          url,
          resolve: () => {
            const texture = textureFor(url);
            textures.set(url, [...(textures.get(url) ?? []), texture]);
            resolve(texture);
          },
          reject: () => {
            reject(new Error(`404 ${url}`));
          },
        });
      });
    },
  };
  return { loader, pending, textures };
}

// Every load resolves right away.
function createInstantLoader(fail = false) {
  const urls: string[] = [];
  const loader: TextureLoaderLike = {
    loadAsync(url) {
      urls.push(url);
      return fail
        ? Promise.reject(new Error(`404 ${url}`))
        : Promise.resolve(textureFor(url));
    },
  };
  return { loader, urls };
}

async function flush(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await Promise.resolve();
  }
}

async function resolveAll(pending: Pending[]): Promise<void> {
  while (pending.length > 0) {
    pending.shift()?.resolve();
    await flush();
  }
}

function setup(loader: TextureLoaderLike) {
  const view = createBodies(bodies);
  const memory = createTextureMemory();
  const onWarn = vi.fn<(message: string) => void>();
  const renderer = {
    initTexture: vi.fn(),
    capabilities: { getMaxAnisotropy: () => 16 },
  } as unknown as Pick<WebGLRenderer, 'initTexture' | 'capabilities'>;
  const store = createTextureStore({
    renderer,
    bodies,
    meshes: view.meshes,
    memory,
    loader,
    baseUrl: BASE_URL,
    onWarn,
  });
  const material = (id: string): MeshStandardMaterial => {
    const mesh = view.meshes.get(id);
    if (!(mesh?.material instanceof MeshStandardMaterial)) {
      throw new Error(`no standard material for ${id}`);
    }
    return mesh.material;
  };
  return { view, memory, onWarn, renderer, store, material };
}

test('textureStore › golden values', () => {
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
  expect(SPHERE_SEGMENTS_DETAILED).toEqual({ moon: 32, planet: 64, sun: 96 });
});

test('textureStore › starts in the data color', () => {
  const { store, material, view } = setup(createInstantLoader().loader);

  expect(material('jupiter').map).toBeNull();
  expect(store.getState().bodies).toEqual({
    sun: null,
    mercury: null,
    venus: null,
    earth: null,
    moon: null,
    mars: null,
    jupiter: null,
    saturn: null,
    uranus: null,
    neptune: null,
  });

  store.dispose();
  view.dispose();
});

test('textureStore › preloads base in ADR-006 order', async () => {
  const { loader, pending } = createDeferredLoader();
  const { store, material, renderer, view } = setup(loader);
  const order: string[] = [];
  let maxParallel = 0;

  store.preloadBase();
  store.preloadBase();
  while (pending.length > 0) {
    maxParallel = Math.max(maxParallel, pending.length);
    const next = pending.shift();
    order.push(next?.url ?? '');
    next?.resolve();
    await flush();
  }

  expect(order).toEqual(
    [
      'sun',
      'mercury',
      'venus',
      'earth',
      'moon',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
    ].map((key) => `${BASE_URL}512/${key}.jpg`),
  );
  expect(maxParallel).toBeLessThanOrEqual(2);
  const jupiter = material('jupiter');
  expect(jupiter.map?.image).toEqual({ width: 512, height: 256 });
  expect(jupiter.color.getHexString()).toBe('ffffff');
  expect(jupiter.map?.colorSpace).toBe('srgb');
  expect(jupiter.map?.anisotropy).toBe(4);
  expect(renderer.initTexture).toHaveBeenCalledWith(jupiter.map);
  expect(store.getState().bodies.io).toBeUndefined();
  expect(store.getState().bodies.jupiter).toBe('512');

  store.dispose();
  view.dispose();
});

test('textureStore › detailed version replaces the base', async () => {
  const { loader, urls } = createInstantLoader();
  const { store, material, view } = setup(loader);
  store.preloadBase();
  await flush();

  store.requestDetailed('jupiter');
  await flush();

  expect(urls.at(-1)).toBe(`${BASE_URL}2k/jupiter.jpg`);
  expect(material('jupiter').map?.image).toEqual({ width: 2048, height: 1024 });
  expect(store.getState().bodies.jupiter).toBe('2k');

  // A repeated request loads nothing.
  const count = urls.length;
  store.requestDetailed('jupiter');
  await flush();
  expect(urls).toHaveLength(count);

  store.dispose();
  view.dispose();
});

test('textureStore › lru eviction', async () => {
  const { loader } = createInstantLoader();
  const { store, material, memory, view } = setup(loader);
  store.preloadBase();
  await flush();

  store.requestDetailed('jupiter');
  await flush();
  const jupiterDetailed = material('jupiter').map;
  if (jupiterDetailed === null) {
    throw new Error('jupiter has no detailed map');
  }
  const dispose = vi.spyOn(jupiterDetailed, 'dispose');
  const untrack = vi.spyOn(memory, 'untrack');
  store.requestDetailed('saturn');
  await flush();
  store.requestDetailed('mars');
  await flush();

  expect(dispose).toHaveBeenCalledOnce();
  expect(untrack).toHaveBeenCalledWith(jupiterDetailed);
  expect(material('jupiter').map?.image).toEqual({ width: 512, height: 256 });
  const state = store.getState().bodies;
  expect(state.jupiter).toBe('512');
  expect(state.saturn).toBe('2k');
  expect(state.mars).toBe('2k');

  store.dispose();
  view.dispose();
});

test('textureStore › low limits with two 2k loaded', async () => {
  const { loader } = createInstantLoader();
  const { store, view } = setup(loader);
  store.preloadBase();
  await flush();
  store.requestDetailed('jupiter');
  await flush();
  store.requestDetailed('saturn');
  await flush();

  store.setLimits(TEXTURE_LIMITS.low);
  await flush();

  const state = store.getState();
  expect(state.bodies.jupiter).toBe('512');
  expect(state.bodies.saturn).toBe('1k');
  expect(state.memoryMiB).toBeLessThanOrEqual(16);

  store.dispose();
  view.dispose();
});

test('textureStore › fewer slots evict at once', async () => {
  const { loader } = createInstantLoader();
  const { store, view } = setup(loader);
  store.setLimits(TEXTURE_LIMITS.medium);
  store.requestDetailed('jupiter');
  await flush();
  store.requestDetailed('saturn');
  await flush();

  store.setLimits({ ...TEXTURE_LIMITS.medium, detailedSlots: 1 });

  expect(store.getState().bodies.jupiter).toBeNull();
  expect(store.getState().bodies.saturn).toBe('1k');

  store.dispose();
  view.dispose();
});

test('textureStore › memory never exceeds the limit', async () => {
  const { loader } = createInstantLoader();
  const { store, memory, view } = setup(loader);
  const levels = [
    TEXTURE_LIMITS.high,
    TEXTURE_LIMITS.medium,
    TEXTURE_LIMITS.low,
  ] as const;
  const ids = [...view.meshes.keys()];
  let seed = 20261008;
  const random = (): number => {
    // Mulberry32: a fixed sequence for a fixed seed.
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  let limits: TextureLimits = TEXTURE_LIMITS.high;
  store.preloadBase();

  for (let step = 0; step < 200; step += 1) {
    if (random() < 0.75) {
      store.requestDetailed(ids[Math.floor(random() * ids.length)] ?? 'sun');
    } else {
      limits = levels[Math.floor(random() * levels.length)] ?? limits;
      store.setLimits(limits);
    }
    expect(memory.getMiB()).toBeLessThanOrEqual(limits.memoryMiB);
    await flush();
    expect(memory.getMiB()).toBeLessThanOrEqual(limits.memoryMiB);
    const detailed = Object.values(store.getState().bodies).filter(
      (resolution) => resolution === '1k' || resolution === '2k',
    );
    expect(detailed.length).toBeLessThanOrEqual(limits.detailedSlots);
  }

  store.dispose();
  view.dispose();
});

test('textureStore › skips a detailed version the budget cannot hold', async () => {
  const { loader, urls } = createInstantLoader();
  const { store, view } = setup(loader);
  store.preloadBase();
  await flush();

  // 10 × 512 ≈ 6.7 MiB; a 2k needs about 10.7 MiB more.
  store.setLimits({ detailedResolution: '2k', detailedSlots: 2, memoryMiB: 8 });
  store.requestDetailed('jupiter');
  await flush();

  expect(urls).not.toContain(`${BASE_URL}2k/jupiter.jpg`);
  expect(store.getState().bodies.jupiter).toBe('512');

  store.dispose();
  view.dispose();
});

test('textureStore › load error keeps color', async () => {
  const { loader, urls } = createInstantLoader(true);
  const { store, material, onWarn, view } = setup(loader);
  const color = material('mars').color.getHexString();

  store.preloadBase();
  await flush();
  store.requestDetailed('mars');
  await flush();
  store.requestDetailed('mars');
  await flush();

  expect(material('mars').map).toBeNull();
  expect(material('mars').color.getHexString()).toBe(color);
  expect(onWarn).toHaveBeenCalledWith(
    `textureStore: failed to load ${BASE_URL}512/mars.jpg`,
  );
  expect(onWarn).toHaveBeenCalledWith(
    `textureStore: failed to load ${BASE_URL}2k/mars.jpg`,
  );
  expect(urls.filter((url) => url === `${BASE_URL}2k/mars.jpg`)).toHaveLength(
    1,
  );
  expect(onWarn).toHaveBeenCalledTimes(11);
  const state = store.getState();
  expect(state.failed).toContain(`${BASE_URL}512/mars.jpg`);
  expect(Object.values(state.bodies).every((value) => value === null)).toBe(
    true,
  );

  // No retry in the session.
  store.preloadBase();
  await flush();
  expect(onWarn).toHaveBeenCalledTimes(11);

  store.dispose();
  view.dispose();
});

test('textureStore › late response is disposed', async () => {
  const { loader, pending, textures } = createDeferredLoader();
  const { store, material, memory, view } = setup(loader);

  store.requestDetailed('jupiter');
  store.requestDetailed('saturn');
  const before = material('jupiter').map;
  await resolveAll(pending);

  const late = textures.get(`${BASE_URL}2k/jupiter.jpg`)?.[0];
  expect(late).toBeDefined();
  expect(material('jupiter').map).toBe(before);
  expect(store.getState().bodies.jupiter).toBeNull();
  expect(store.getState().bodies.saturn).toBe('2k');
  // Only Saturn's 2k is in memory: the late Jupiter never got tracked.
  expect(memory.getMiB()).toBeCloseTo((2048 * 1024 * 4 * 4) / 3 / 1048576, 5);

  store.dispose();
  view.dispose();
});

test('textureStore › dispose during loading', async () => {
  const { loader, pending } = createDeferredLoader();
  const { store, material, memory, view } = setup(loader);
  const before = memory.getMiB();
  const color = material('earth').color.getHexString();

  store.preloadBase();
  pending.shift()?.resolve();
  await flush();
  store.requestDetailed('earth');
  store.dispose();
  await resolveAll(pending);

  expect(memory.getMiB()).toBe(before);
  expect(material('earth').map).toBeNull();
  expect(material('earth').color.getHexString()).toBe(color);

  view.dispose();
});

test('textureStore › dispose restores the materials', async () => {
  const { loader } = createInstantLoader();
  const { store, material, memory, view } = setup(loader);
  const color = material('venus').color.getHexString();
  store.preloadBase();
  await flush();
  store.requestDetailed('venus');
  await flush();

  store.dispose();

  expect(memory.getMiB()).toBe(0);
  expect(material('venus').map).toBeNull();
  expect(material('venus').color.getHexString()).toBe(color);

  view.dispose();
});

test.each(['io', 'pluto', ''])(
  'textureStore › requestDetailed(%j) has no effect',
  async (id) => {
    const { loader, urls } = createInstantLoader();
    const { store, view } = setup(loader);

    store.requestDetailed(id);
    await flush();

    expect(urls).toHaveLength(0);

    store.dispose();
    view.dispose();
  },
);

const INVALID_LIMITS: [string, Partial<TextureLimits>, string][] = [
  ['detailedSlots 0', { detailedSlots: 0 }, 'detailedSlots'],
  ['detailedSlots 1.5', { detailedSlots: 1.5 }, 'detailedSlots'],
  ['detailedSlots NaN', { detailedSlots: Number.NaN }, 'detailedSlots'],
  ['memoryMiB 0', { memoryMiB: 0 }, 'memoryMiB'],
  ['memoryMiB -1', { memoryMiB: -1 }, 'memoryMiB'],
  ['memoryMiB NaN', { memoryMiB: Number.NaN }, 'memoryMiB'],
  ['memoryMiB Infinity', { memoryMiB: Number.POSITIVE_INFINITY }, 'memoryMiB'],
  [
    'detailedResolution 4k',
    { detailedResolution: '4k' as TextureLimits['detailedResolution'] },
    'detailedResolution',
  ],
];

test.each(INVALID_LIMITS)(
  'textureStore › setLimits validation › %s',
  (_name, change, parameter) => {
    const { store, view } = setup(createInstantLoader().loader);

    expect(() => {
      store.setLimits({ ...TEXTURE_LIMITS.high, ...change });
    }).toThrow(RangeError);
    expect(() => {
      store.setLimits({ ...TEXTURE_LIMITS.high, ...change });
    }).toThrow(`setLimits: parameter "${parameter}"`);

    store.dispose();
    view.dispose();
  },
);

test('textureStore › setLimits messages', () => {
  const { store, view } = setup(createInstantLoader().loader);

  expect(() => {
    store.setLimits({ ...TEXTURE_LIMITS.high, detailedSlots: 0 });
  }).toThrow(
    'setLimits: parameter "detailedSlots" must be an integer >= 1, got 0',
  );
  expect(() => {
    store.setLimits({ ...TEXTURE_LIMITS.high, memoryMiB: Number.NaN });
  }).toThrow(
    'setLimits: parameter "memoryMiB" must be finite and > 0, got NaN',
  );

  store.dispose();
  view.dispose();
});
