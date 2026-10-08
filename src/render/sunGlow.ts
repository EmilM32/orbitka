import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';

import type { TextureMemory } from './textureMemory.ts';

// ADR-010 point 10 and SPEC §9.3: the sprite is 4.2 sun radii across.
export const SUN_GLOW_RADIUS_FACTOR = 4.2;
export const SUN_GLOW_TEXTURE_SIZE = 256;
export const SUN_GLOW_CENTER_ALPHA = 0.55;
export const SUN_GLOW_RENDER_ORDER = 2;

export type GlowCanvas = {
  width: number;
  height: number;
  getContext(kind: '2d'): GlowContext | null;
};

type GlowGradient = { addColorStop(offset: number, color: string): void };

export type GlowContext = {
  fillStyle: unknown;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): GlowGradient;
  fillRect(x: number, y: number, width: number, height: number): void;
};

export type SunGlow = {
  sprite: Sprite;
  dispose(): void;
};

function defaultCanvas(): GlowCanvas {
  return document.createElement('canvas') as unknown as GlowCanvas;
}

function rgba(
  color: { r: number; g: number; b: number },
  alpha: number,
): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintGradient(canvas: GlowCanvas, color: string): void {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('createSunGlow: 2d canvas context is unavailable');
  }
  const size = SUN_GLOW_TEXTURE_SIZE;
  const half = size / 2;
  // The canvas works in sRGB, so the color is read back in sRGB.
  const srgb = new Color(color).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  const gradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half,
  );
  gradient.addColorStop(0, rgba(srgb, SUN_GLOW_CENTER_ALPHA));
  gradient.addColorStop(1, rgba(srgb, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

/**
 * A faint glow around the Sun: one sprite, additive, 1 draw call. The disc is
 * opaque and drawn first, so the glow shows only around it.
 */
export function createSunGlow(
  sunSceneRadius: number,
  color: string,
  textures: TextureMemory,
  createCanvas: () => GlowCanvas = defaultCanvas,
): SunGlow {
  if (!Number.isFinite(sunSceneRadius) || sunSceneRadius <= 0) {
    throw new RangeError(
      `createSunGlow: parameter "sunSceneRadius" must be finite and > 0, got ${sunSceneRadius}`,
    );
  }

  const canvas = createCanvas();
  canvas.width = SUN_GLOW_TEXTURE_SIZE;
  canvas.height = SUN_GLOW_TEXTURE_SIZE;
  paintGradient(canvas, color);

  const texture = new CanvasTexture(canvas as unknown as HTMLCanvasElement);
  texture.colorSpace = SRGBColorSpace;
  textures.track(texture);
  const material = new SpriteMaterial({
    map: texture,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new Sprite(material);
  sprite.name = 'sun-glow';
  const scale = SUN_GLOW_RADIUS_FACTOR * sunSceneRadius;
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = SUN_GLOW_RENDER_ORDER;
  // The disc decides a click on the Sun, not the glow around it.
  sprite.raycast = () => {};

  let disposed = false;
  return {
    sprite,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      sprite.removeFromParent();
      material.dispose();
      texture.dispose();
    },
  };
}
