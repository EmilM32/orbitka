import { Color, DoubleSide, ShaderMaterial } from 'three';

import { INTERIOR_TEXTURES, type InteriorTexture } from '@data/interiors.ts';

// Cut faces of the interior cutaway (EMI-268). One shader for every layer:
// the texture picks a branch, the color comes from the cutaway (reveal,
// dimming, face shading), and the pattern only scales its brightness.
// Noise is procedural, so there are no texture files to load.

/** Textures that drift over time; frozen when motion is reduced. */
export const MOVING_TEXTURES: ReadonlySet<InteriorTexture> = new Set([
  'liquid-metal',
  'gas',
  'plasma',
  'convection',
]);

export type CutawayFaceUniforms = {
  uColor: { value: Color };
  uPattern: { value: number };
  uSeed: { value: number };
  /** Shared by every face of one cutaway. */
  uTime: { value: number };
  uRadius: { value: number };
};

export type CutawayFaceMaterial = ShaderMaterial & {
  uniforms: CutawayFaceUniforms;
};

const VERTEX = /* glsl */ `
varying vec3 vPos;

void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform int uPattern;
uniform float uSeed;
uniform float uTime;
uniform float uRadius;

varying vec3 vPos;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

// Distance to the nearest random point: cells for metal and convection.
float cells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float nearest = 1.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 jitter = vec3(hash(i + o), hash(i + o + 11.7), hash(i + o + 23.3));
        vec3 r = o + jitter - f;
        nearest = min(nearest, dot(r, r));
      }
    }
  }
  return sqrt(nearest);
}

void main() {
  vec3 p = vPos / uRadius;
  float r = length(p);
  vec3 q = p + vec3(uSeed);
  float shade = 1.0;

  if (uPattern == 0) {
    // Rock: grain and a few light specks.
    float grain = fbm(q * 14.0);
    float speck = step(0.8, noise(q * 60.0));
    shade = 0.72 + 0.44 * grain + 0.1 * speck;
  } else if (uPattern == 1) {
    // Solid metal: still crystals.
    float c = cells(q * 18.0);
    shade = 0.82 + 0.28 * smoothstep(0.0, 0.6, c);
  } else if (uPattern == 2) {
    // Liquid metal: slow, warped streaks.
    vec3 w = q * 8.0;
    w += vec3(fbm(w + uTime * 0.15), fbm(w + 5.2 - uTime * 0.12), 0.0) * 1.5;
    shade = 0.68 + 0.58 * fbm(w);
  } else if (uPattern == 3) {
    // Gas: bands around the center that wobble.
    float n = fbm(q * 6.0 + vec3(0.0, uTime * 0.05, 0.0));
    shade = 0.86 + 0.16 * sin(r * 55.0 + n * 6.0);
  } else if (uPattern == 4) {
    // Ice: smooth with thin light veins.
    float n = fbm(q * 10.0);
    float vein = smoothstep(0.025, 0.0, abs(n - 0.5));
    shade = 0.94 + 0.08 * n + 0.14 * vein;
  } else if (uPattern == 5) {
    // Plasma: a soft, slowly churning glow.
    shade = 0.86 + 0.3 * fbm(q * 10.0 + vec3(uTime * 0.08));
  } else {
    // Convection: hot cells rising, dark lanes between them.
    float c = cells(q * 14.0 + vec3(0.0, 0.0, uTime * 0.12));
    shade = 0.68 + 0.52 * (1.0 - smoothstep(0.0, 0.75, c));
  }

  // Warmer toward the center.
  shade *= 0.92 + 0.16 * (1.0 - clamp(r, 0.0, 1.0));
  gl_FragColor = vec4(uColor * shade, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * A face material for one layer. `time` and `radius` are shared uniform
 * objects so one write moves every face of the cutaway.
 */
export function createCutawayFaceMaterial(
  texture: InteriorTexture,
  seed: number,
  time: { value: number },
  radius: { value: number },
): CutawayFaceMaterial {
  const uniforms: CutawayFaceUniforms = {
    uColor: { value: new Color() },
    uPattern: { value: INTERIOR_TEXTURES.indexOf(texture) },
    uSeed: { value: seed },
    uTime: time,
    uRadius: radius,
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return material as CutawayFaceMaterial;
}
