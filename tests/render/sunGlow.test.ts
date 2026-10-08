import {
  AdditiveBlending,
  CanvasTexture,
  Raycaster,
  SpriteMaterial,
  Vector3,
} from 'three';
import { expect, test, vi } from 'vitest';

import {
  SUN_GLOW_CENTER_ALPHA,
  SUN_GLOW_RADIUS_FACTOR,
  SUN_GLOW_TEXTURE_SIZE,
  createSunGlow,
  type GlowCanvas,
} from '@render/sunGlow.ts';
import { createTextureMemory } from '@render/textureMemory.ts';

const SUN_RADIUS = 3.4;

type Recorded = { stops: [number, string][]; filled: number[][] };

function fakeCanvas(recorded: Recorded): GlowCanvas {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: null,
      createRadialGradient: () => ({
        addColorStop(offset: number, color: string) {
          recorded.stops.push([offset, color]);
        },
      }),
      fillRect(x: number, y: number, width: number, height: number) {
        recorded.filled.push([x, y, width, height]);
      },
    }),
  };
}

function build(memory = createTextureMemory()) {
  const recorded: Recorded = { stops: [], filled: [] };
  const glow = createSunGlow(SUN_RADIUS, '#FDB813', memory, () =>
    fakeCanvas(recorded),
  );
  return { glow, recorded, memory };
}

function parts(glow: ReturnType<typeof createSunGlow>) {
  const material = glow.sprite.material;
  if (
    !(material instanceof SpriteMaterial) ||
    !(material.map instanceof CanvasTexture)
  ) {
    throw new Error('unexpected glow parts');
  }
  return { material, texture: material.map };
}

test('sunGlow › glow scale and blending', () => {
  const { glow, recorded } = build();
  const { material, texture } = parts(glow);

  expect(SUN_GLOW_RADIUS_FACTOR).toBe(4.2);
  expect(glow.sprite.scale.x).toBeCloseTo(4.2 * SUN_RADIUS, 10);
  expect(glow.sprite.scale.y).toBeCloseTo(4.2 * SUN_RADIUS, 10);
  expect(material.blending).toBe(AdditiveBlending);
  expect(material.depthWrite).toBe(false);
  expect(material.transparent).toBe(true);
  expect(texture.image.width).toBe(SUN_GLOW_TEXTURE_SIZE);
  expect(texture.image.height).toBe(256);

  // The Sun's color at alpha 0.55 in the middle, transparent on the edge.
  expect(SUN_GLOW_CENTER_ALPHA).toBe(0.55);
  expect(recorded.stops).toEqual([
    [0, 'rgba(253, 184, 19, 0.55)'],
    [1, 'rgba(253, 184, 19, 0)'],
  ]);
  expect(recorded.filled).toEqual([[0, 0, 256, 256]]);
  glow.dispose();
});

test('sunGlow › raycast finds no hits', () => {
  const { glow } = build();
  glow.sprite.updateMatrixWorld(true);
  const raycaster = new Raycaster(new Vector3(0, 0, 50), new Vector3(0, 0, -1));
  expect(raycaster.intersectObject(glow.sprite)).toEqual([]);
  glow.dispose();
});

test('sunGlow › dispose frees the texture and TextureMemory', () => {
  const { glow, memory } = build();
  const { material, texture } = parts(glow);
  expect(memory.getMiB()).toBeGreaterThan(0);
  const materialSpy = vi.spyOn(material, 'dispose');
  const textureSpy = vi.spyOn(texture, 'dispose');

  glow.dispose();
  glow.dispose();
  expect(materialSpy).toHaveBeenCalledTimes(1);
  expect(textureSpy).toHaveBeenCalledTimes(1);
  expect(memory.getMiB()).toBe(0);
});

test('sunGlow › rejects an invalid radius', () => {
  for (const radius of [0, -1, Number.NaN]) {
    expect(() =>
      createSunGlow(radius, '#FDB813', createTextureMemory(), () =>
        fakeCanvas({ stops: [], filled: [] }),
      ),
    ).toThrow(
      `createSunGlow: parameter "sunSceneRadius" must be finite and > 0, got ${radius}`,
    );
  }
});

test('sunGlow › needs a 2d context', () => {
  expect(() =>
    createSunGlow(SUN_RADIUS, '#FDB813', createTextureMemory(), () => ({
      width: 0,
      height: 0,
      getContext: () => null,
    })),
  ).toThrow('createSunGlow: 2d canvas context is unavailable');
});
