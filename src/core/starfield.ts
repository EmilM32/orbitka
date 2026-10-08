// Procedural background stars (ADR-010 point 6, EMI-222). Pure math: render
// turns the arrays into one Points draw call.

export const STAR_COUNTS = { high: 4000, medium: 2500, low: 1200 } as const;
export const STARFIELD_SEED = 20261007;

export const STAR_BRIGHTNESS_MIN = 0.35;
export const STAR_SIZE_MIN_PX = 1;
export const STAR_SIZE_MAX_PX = 2.5;

const UINT32_RANGE = 2 ** 32;

export type Starfield = {
  /** x, y, z per star, on a sphere around the origin. */
  positions: Float32Array;
  /** Point size in px, in [1, 2.5]. */
  sizes: Float32Array;
  /** In [0.35, 1], skewed toward dim stars. */
  brightness: Float32Array;
};

function invalidInput(
  parameter: string,
  requirement: string,
  value: number,
): RangeError {
  return new RangeError(
    `generateStarfield: parameter "${parameter}" ${requirement}, got ${value}`,
  );
}

// mulberry32: a small 32-bit PRNG, uniform in [0, 1).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/**
 * Stars spread evenly over a sphere: z = 1 − 2u, φ = 2πv. Each star takes
 * four draws in a fixed order, so the first n stars of a bigger field are the
 * stars of a field of n with the same seed.
 */
export function generateStarfield(
  count: number,
  seed: number,
  radius: number,
): Starfield {
  if (!Number.isInteger(count) || count < 0) {
    throw invalidInput('count', 'must be an integer >= 0', count);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw invalidInput('seed', 'must be an integer in [0, 2^32)', seed);
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw invalidInput('radius', 'must be finite and > 0', radius);
  }

  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const z = 1 - 2 * random();
    const phi = 2 * Math.PI * random();
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    const offset = index * 3;
    positions[offset] = radius * ring * Math.cos(phi);
    positions[offset + 1] = radius * ring * Math.sin(phi);
    positions[offset + 2] = radius * z;

    const w = random();
    brightness[index] =
      STAR_BRIGHTNESS_MIN + (1 - STAR_BRIGHTNESS_MIN) * w * w * w;
    sizes[index] =
      STAR_SIZE_MIN_PX + (STAR_SIZE_MAX_PX - STAR_SIZE_MIN_PX) * random();
  }

  return { positions, sizes, brightness };
}
