import { LinearFilter, NearestFilter, type Event, type Texture } from 'three';

// A full mipmap chain adds a third of the base level: 1 + 1/4 + 1/16 + … = 4/3.
export const MIPMAP_FACTOR = 4 / 3;

const BYTES_PER_MIB = 1024 * 1024;
// Every texture is counted as RGBA8 on the GPU.
const BYTES_PER_PIXEL = 4;

export type TextureMemory = {
  track(texture: Texture): void;
  untrack(texture: Texture): void;
  getMiB(): number;
  dispose(): void;
};

function requireSize(parameter: 'width' | 'height', value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(
      `estimateTextureBytes: parameter "${parameter}" must be a positive integer, got ${value}`,
    );
  }
}

export function estimateTextureBytes(
  width: number,
  height: number,
  mipmaps: boolean,
): number {
  requireSize('width', width);
  requireSize('height', height);
  const base = width * height * BYTES_PER_PIXEL;
  return mipmaps ? Math.ceil(base * MIPMAP_FACTOR) : base;
}

function imageSize(image: unknown, key: 'width' | 'height'): number {
  if (typeof image !== 'object' || image === null || !(key in image)) {
    return 0;
  }

  const value = (image as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

function usesMipmaps(texture: Texture): boolean {
  if (texture.mipmaps !== undefined && texture.mipmaps.length > 0) {
    return true;
  }

  return (
    texture.generateMipmaps &&
    texture.minFilter !== LinearFilter &&
    texture.minFilter !== NearestFilter
  );
}

// A texture without a loaded image counts as 0 B. The size is read again on
// every getMiB, so it shows up once the image has its dimensions.
function textureBytes(texture: Texture): number {
  const image: unknown = texture.image;
  const width = imageSize(image, 'width');
  const height = imageSize(image, 'height');
  if (width === 0 || height === 0) {
    return 0;
  }

  return estimateTextureBytes(width, height, usesMipmaps(texture));
}

// Every GPU texture created in render is tracked when it is created. A
// texture leaves the register on its own dispose().
export function createTextureMemory(): TextureMemory {
  const tracked = new Set<Texture>();

  const onDispose = (event: Event<'dispose', Texture>): void => {
    untrack(event.target);
  };

  function untrack(texture: Texture): void {
    if (!tracked.delete(texture)) {
      return;
    }

    texture.removeEventListener('dispose', onDispose);
  }

  return {
    track(texture) {
      if (tracked.has(texture)) {
        return;
      }

      tracked.add(texture);
      texture.addEventListener('dispose', onDispose);
    },
    untrack,
    getMiB() {
      let bytes = 0;
      for (const texture of tracked) {
        bytes += textureBytes(texture);
      }
      return bytes / BYTES_PER_MIB;
    },
    dispose() {
      for (const texture of tracked) {
        texture.removeEventListener('dispose', onDispose);
      }
      tracked.clear();
    },
  };
}
