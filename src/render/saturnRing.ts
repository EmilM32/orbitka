import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  RingGeometry,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

import { SATURN_RING_BANDS, sampleRingProfile } from '@core/ringBands.ts';
import type { RingDef } from '@data/types.ts';

import type { TextureMemory } from './textureMemory.ts';

export const RING_SEGMENTS = 128;
export const RING_PROFILE_SAMPLES = 512;
// Drawn after the opaque spheres, so the transparent ring blends over them.
export const RING_RENDER_ORDER = 1;
const RING_ALPHA_TEST = 0.01;

export type Ring = {
  mesh: Mesh;
  /** Outer ring radius in scene units, for the camera frame. */
  framingRadius: number;
  dispose(): void;
};

function requirePositive(parameter: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `createRing: parameter "${parameter}" must be finite and > 0, got ${value}`,
    );
  }
}

// The default RingGeometry UVs are planar. The profile runs across the
// ring's width instead: u = 0 on the inner edge, 1 on the outer; v = angle / 2π.
function mapRadialUvs(geometry: RingGeometry): void {
  const uv = geometry.getAttribute('uv');
  const { thetaSegments, phiSegments } = geometry.parameters;
  for (let ring = 0; ring <= phiSegments; ring += 1) {
    for (let step = 0; step <= thetaSegments; step += 1) {
      uv.setXY(
        ring * (thetaSegments + 1) + step,
        ring / phiSegments,
        step / thetaSegments,
      );
    }
  }
  uv.needsUpdate = true;
}

function createProfileTexture(def: RingDef): DataTexture {
  const profile = sampleRingProfile(
    // Saturn is the only body with a ring (EMI-221).
    SATURN_RING_BANDS,
    def.innerRadiusKm,
    def.outerRadiusKm,
    RING_PROFILE_SAMPLES,
  );
  const bytes = new Uint8Array(profile.length);
  for (let index = 0; index < profile.length; index += 1) {
    bytes[index] = Math.round((profile[index] ?? 0) * 255);
  }

  const texture = new DataTexture(
    bytes,
    RING_PROFILE_SAMPLES,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = SRGBColorSpace;
  // Mipmaps keep the bands from shimmering when the ring is a few pixels wide.
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A ring in the body's equatorial plane. Add the mesh as a child of the body
 * mesh: it then takes the axial tilt from the rotation animator. The spin
 * around the normal does not show, because the profile is radially symmetric.
 */
export function createRing(
  def: RingDef,
  bodyRadiusKm: number,
  bodySceneRadius: number,
  color: string,
  textures: TextureMemory,
): Ring {
  requirePositive('bodyRadiusKm', bodyRadiusKm);
  requirePositive('bodySceneRadius', bodySceneRadius);

  const scale = bodySceneRadius / bodyRadiusKm;
  const inner = def.innerRadiusKm * scale;
  const outer = def.outerRadiusKm * scale;
  const geometry = new RingGeometry(inner, outer, RING_SEGMENTS, 1);
  mapRadialUvs(geometry);

  const texture = createProfileTexture(def);
  textures.track(texture);
  const material = new MeshStandardMaterial({
    color,
    map: texture,
    roughness: 1,
    metalness: 0,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    alphaTest: RING_ALPHA_TEST,
  });
  material.forceSinglePass = true;

  const mesh = new Mesh(geometry, material);
  mesh.name = 'ring';
  // RingGeometry lies in XY; the equator plane is local XZ (normal = spin axis Y).
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = RING_RENDER_ORDER;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Picking goes by the sphere only: a click on the ring is a click on space.
  mesh.raycast = () => {};

  let disposed = false;
  return {
    mesh,
    framingRadius: outer,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
