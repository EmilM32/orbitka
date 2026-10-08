import {
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type Texture,
  type WebGLRenderer,
} from 'three';

import type { BodyDef } from '@data/types.ts';

import { estimateTextureBytes, type TextureMemory } from './textureMemory.ts';

export type TextureResolution = '512' | '1k' | '2k';
export type DetailedResolution = Exclude<TextureResolution, '512'>;
export type TextureLimits = {
  detailedResolution: DetailedResolution;
  detailedSlots: number;
  memoryMiB: number;
};

// ADR-010 point 9: the selected body in 2k / 1k / 1k, LRU 2 / 2 / 1, and the
// texture memory budget of point 8.
export const TEXTURE_LIMITS = {
  high: { detailedResolution: '2k', detailedSlots: 2, memoryMiB: 48 },
  medium: { detailedResolution: '1k', detailedSlots: 2, memoryMiB: 24 },
  low: { detailedResolution: '1k', detailedSlots: 1, memoryMiB: 16 },
} as const satisfies Record<'high' | 'medium' | 'low', TextureLimits>;

// Shown in the sources and licenses section (CC BY 4.0 attribution).
export const TEXTURE_SOURCE = {
  name: 'Solar System Scope',
  url: 'https://www.solarsystemscope.com/textures/',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

export type TextureLoaderLike = { loadAsync(url: string): Promise<Texture> };

// The app's loader; tests inject their own. main.ts may not import three.
export function createTextureLoader(): TextureLoaderLike {
  return new TextureLoader();
}

export type TextureState = {
  memoryMiB: number;
  bodies: Record<string, TextureResolution | null>;
  failed: string[];
};

export type TextureStore = {
  /** After the first drawn frame: 512 for every key, in ADR-006 order. */
  preloadBase(): void;
  /** After a `selected` event; the resolution comes from the current limits. */
  requestDetailed(bodyId: string): void;
  setLimits(limits: TextureLimits): void;
  /** For the debug hook and tests. */
  getState(): TextureState;
  dispose(): void;
};

export type TextureStoreOptions = {
  renderer: Pick<WebGLRenderer, 'initTexture' | 'capabilities'>;
  bodies: readonly BodyDef[];
  meshes: ReadonlyMap<string, Mesh>;
  memory: TextureMemory;
  loader: TextureLoaderLike;
  baseUrl: string;
  onWarn: (message: string) => void;
};

const MAX_PARALLEL_LOADS = 2;
const MAX_ANISOTROPY = 4;
const BYTES_PER_MIB = 1024 * 1024;
const RESOLUTIONS: readonly DetailedResolution[] = ['1k', '2k'];
const SIZES: Record<TextureResolution, readonly [number, number]> = {
  '512': [512, 256],
  '1k': [1024, 512],
  '2k': [2048, 1024],
};

type BodyMaterial = MeshStandardMaterial | MeshBasicMaterial;

type Entry = {
  bodyId: string;
  key: string;
  material: BodyMaterial;
  color: Color;
  base: Texture | null;
  detailed: { texture: Texture; resolution: DetailedResolution } | null;
};

type Job = {
  url: string;
  isStale: () => boolean;
  accept: (texture: Texture) => void;
};

function textureUrl(
  baseUrl: string,
  resolution: TextureResolution,
  key: string,
): string {
  return `${baseUrl}${resolution}/${key}.jpg`;
}

function estimateMiB(resolution: TextureResolution): number {
  const [width, height] = SIZES[resolution];
  return estimateTextureBytes(width, height, true) / BYTES_PER_MIB;
}

function validateLimits(limits: TextureLimits): void {
  const { detailedResolution, detailedSlots, memoryMiB } = limits;
  if (!RESOLUTIONS.includes(detailedResolution)) {
    throw new RangeError(
      `setLimits: parameter "detailedResolution" must be one of ${RESOLUTIONS.join(', ')}, got ${String(detailedResolution)}`,
    );
  }

  if (!Number.isInteger(detailedSlots) || detailedSlots < 1) {
    throw new RangeError(
      `setLimits: parameter "detailedSlots" must be an integer >= 1, got ${detailedSlots}`,
    );
  }

  if (!Number.isFinite(memoryMiB) || memoryMiB <= 0) {
    throw new RangeError(
      `setLimits: parameter "memoryMiB" must be finite and > 0, got ${memoryMiB}`,
    );
  }
}

// ADR-006 order: the Sun, then the planets outward, each followed by its
// textured moons (the Moon right after the Earth).
function loadOrder(bodies: readonly BodyDef[]): BodyDef[] {
  const textured = bodies.filter((body) => body.visual.texture !== null);
  const axis = (body: BodyDef): number =>
    body.type === 'moon' ? 0 : (body.orbit?.semiMajorAxisAu ?? 0);
  const roots = textured
    .filter((body) => body.type !== 'moon')
    .sort((a, b) => axis(a) - axis(b));
  const ordered: BodyDef[] = [];
  for (const root of roots) {
    ordered.push(root);
    for (const body of textured) {
      if (body.type === 'moon' && body.parentId === root.id) {
        ordered.push(body);
      }
    }
  }
  return ordered;
}

function bodyMaterial(mesh: Mesh, bodyId: string): BodyMaterial {
  const material = mesh.material;
  if (
    material instanceof MeshStandardMaterial ||
    material instanceof MeshBasicMaterial
  ) {
    return material;
  }

  throw new Error(
    `createTextureStore: body "${bodyId}" has no material that takes a map`,
  );
}

/**
 * The only module that loads texture files (ADR-010 point 10). Bodies start
 * in their data color, get 512 after the first frame, and the selected ones
 * get 1k or 2k, at most `detailedSlots` at once (LRU). A failed file is never
 * retried; the body keeps its color or its 512.
 */
export function createTextureStore(options: TextureStoreOptions): TextureStore {
  const { renderer, meshes, memory, loader, baseUrl, onWarn } = options;
  const anisotropy = Math.min(
    MAX_ANISOTROPY,
    renderer.capabilities.getMaxAnisotropy(),
  );

  const entries = new Map<string, Entry>();
  for (const body of loadOrder(options.bodies)) {
    const key = body.visual.texture;
    const mesh = meshes.get(body.id);
    if (key === null || mesh === undefined) {
      continue;
    }
    const material = bodyMaterial(mesh, body.id);
    entries.set(body.id, {
      bodyId: body.id,
      key,
      material,
      color: material.color.clone(),
      base: null,
      detailed: null,
    });
  }

  let limits: TextureLimits = TEXTURE_LIMITS.high;
  // Bodies with a detailed version, oldest first.
  const lru: Entry[] = [];
  const failed = new Set<string>();
  const queue: Job[] = [];
  let active = 0;
  let baseRequested = false;
  let lastSelected: Entry | null = null;
  // The one detailed load in flight; a newer request supersedes it.
  let pendingDetailed: { entry: Entry; url: string } | null = null;
  let disposed = false;

  function applyMaterial(entry: Entry): void {
    const { material } = entry;
    const map = entry.detailed?.texture ?? entry.base;
    if (material.map === map) {
      return;
    }

    if (map === null) {
      material.color.copy(entry.color);
    } else {
      renderer.initTexture(map);
      material.color.set('#ffffff');
    }
    material.map = map;
    material.needsUpdate = true;
  }

  function release(texture: Texture): void {
    memory.untrack(texture);
    texture.dispose();
  }

  function prepare(texture: Texture): void {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = anisotropy;
    memory.track(texture);
  }

  function evict(entry: Entry): void {
    lru.splice(lru.indexOf(entry), 1);
    const { detailed } = entry;
    entry.detailed = null;
    applyMaterial(entry);
    if (detailed !== null) {
      release(detailed.texture);
    }
  }

  function evictOldest(): void {
    const oldest = lru[0];
    if (oldest !== undefined) {
      evict(oldest);
    }
  }

  function detailedMiB(): number {
    let total = 0;
    for (const entry of lru) {
      if (entry.detailed !== null) {
        total += estimateMiB(entry.detailed.resolution);
      }
    }
    return total;
  }

  function fits(extraMiB: number): boolean {
    return memory.getMiB() + extraMiB <= limits.memoryMiB;
  }

  function pump(): void {
    while (!disposed && active < MAX_PARALLEL_LOADS && queue.length > 0) {
      const job = queue.shift();
      if (job === undefined || job.isStale()) {
        continue;
      }

      active += 1;
      loader.loadAsync(job.url).then(
        (texture) => {
          active -= 1;
          if (disposed || job.isStale()) {
            texture.dispose();
          } else {
            job.accept(texture);
          }
          pump();
        },
        () => {
          active -= 1;
          if (!disposed && !failed.has(job.url)) {
            failed.add(job.url);
            onWarn(`textureStore: failed to load ${job.url}`);
          }
          if (pendingDetailed?.url === job.url) {
            pendingDetailed = null;
          }
          pump();
        },
      );
    }
  }

  function acceptDetailed(
    entry: Entry,
    resolution: DetailedResolution,
    texture: Texture,
  ): void {
    pendingDetailed = null;
    const extra = estimateMiB(resolution);
    while (
      lru.length >= limits.detailedSlots ||
      (!fits(extra) && lru.length > 0)
    ) {
      evictOldest();
    }
    if (!fits(extra)) {
      // Even without detailed versions the budget has no room: stay on 512.
      texture.dispose();
      return;
    }

    prepare(texture);
    entry.detailed = { texture, resolution };
    lru.push(entry);
    applyMaterial(entry);
  }

  function loadDetailed(entry: Entry): void {
    const resolution = limits.detailedResolution;
    if (entry.detailed?.resolution === resolution) {
      // Already detailed: it becomes the most recently used.
      lru.splice(lru.indexOf(entry), 1);
      lru.push(entry);
      pendingDetailed = null;
      return;
    }

    const url = textureUrl(baseUrl, resolution, entry.key);
    if (pendingDetailed?.url === url) {
      return;
    }
    pendingDetailed = null;
    if (failed.has(url)) {
      return;
    }

    // Without any detailed version the budget would still not fit: skip.
    if (
      memory.getMiB() - detailedMiB() + estimateMiB(resolution) >
      limits.memoryMiB
    ) {
      return;
    }

    const request = { entry, url };
    pendingDetailed = request;
    // Ahead of the queued 512 loads: the student is looking at this body.
    queue.unshift({
      url,
      isStale: () => pendingDetailed !== request,
      accept: (texture) => {
        acceptDetailed(entry, resolution, texture);
      },
    });
    pump();
  }

  return {
    preloadBase() {
      if (disposed || baseRequested) {
        return;
      }

      baseRequested = true;
      for (const entry of entries.values()) {
        queue.push({
          url: textureUrl(baseUrl, '512', entry.key),
          isStale: () => false,
          accept: (texture) => {
            prepare(texture);
            entry.base = texture;
            applyMaterial(entry);
          },
        });
      }
      pump();
    },
    requestDetailed(bodyId) {
      if (disposed) {
        return;
      }

      const entry = entries.get(bodyId);
      if (entry === undefined) {
        return;
      }

      lastSelected = entry;
      loadDetailed(entry);
    },
    setLimits(next) {
      validateLimits(next);
      if (disposed) {
        return;
      }

      const resolutionChanged =
        next.detailedResolution !== limits.detailedResolution;
      limits = {
        detailedResolution: next.detailedResolution,
        detailedSlots: next.detailedSlots,
        memoryMiB: next.memoryMiB,
      };
      if (resolutionChanged) {
        pendingDetailed = null;
        for (const entry of [...lru]) {
          evict(entry);
        }
        if (lastSelected !== null) {
          loadDetailed(lastSelected);
        }
        return;
      }

      while (
        lru.length > limits.detailedSlots ||
        (lru.length > 0 && !fits(0))
      ) {
        evictOldest();
      }
    },
    getState() {
      const bodies: Record<string, TextureResolution | null> = {};
      for (const entry of entries.values()) {
        bodies[entry.bodyId] =
          entry.detailed?.resolution ?? (entry.base === null ? null : '512');
      }
      return { memoryMiB: memory.getMiB(), bodies, failed: [...failed] };
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      pendingDetailed = null;
      queue.length = 0;
      lru.length = 0;
      for (const entry of entries.values()) {
        const { base, detailed } = entry;
        entry.base = null;
        entry.detailed = null;
        applyMaterial(entry);
        if (base !== null) {
          release(base);
        }
        if (detailed !== null) {
          release(detailed.texture);
        }
      }
    },
  };
}
