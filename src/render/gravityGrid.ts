import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Sphere,
  Vector3,
  AdditiveBlending,
  DynamicDrawUsage,
  Uint32BufferAttribute,
  type Mesh,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import type { QualityLevel } from '@core/quality.ts';
import type { BodyDef } from '@data/types.ts';
import {
  WELL,
  addWellDepths,
  clampDepths,
  createWells,
  gridRadius,
  type Well,
} from '@sim/gravity.ts';

// The gravity view (EMI-264): a grid of lines in a plane below the orbits,
// pulled down into a funnel around the Sun and each planet. The grid lines
// are spaced `spacing` apart and sampled every `step` along their length.
export const GRAVITY_GRID_DENSITY: Readonly<
  Record<QualityLevel, { spacing: number; step: number }>
> = {
  high: { spacing: 1.6, step: 0.4 },
  medium: { spacing: 1.6, step: 0.5 },
  low: { spacing: 2.4, step: 0.8 },
};

// Light blue at the flat edge, a brighter violet deep in a funnel. The lines
// are added to the picture, so they fade to nothing at the rim of the grid.
export const GRAVITY_GRID_COLOR_FLAT = 0x1e3a5c;
export const GRAVITY_GRID_COLOR_DEEP = 0x7a64d8;
// Depth at which a line reaches the deep color.
export const GRAVITY_GRID_COLOR_DEPTH = 8;
// The outer part of the grid radius over which the lines fade out.
export const GRAVITY_GRID_RIM_FADE = 0.2;
// Before the orbit lines (render order 0), which then stay on top of the grid.
export const GRAVITY_GRID_RENDER_ORDER = -1;

export type GravityGrid = {
  lines: LineSegments;
  isVisible(): boolean;
  setVisible(visible: boolean): void;
  setQuality(level: QualityLevel): void;
  /** Moves the planet funnels to the planet meshes. Cheap when nothing moved. */
  update(): void;
  dispose(): void;
};

type GridPoints = {
  xs: Float32Array;
  zs: Float32Array;
  indices: Uint32Array;
};

// A GLSL color in the linear working space, like material colors.
function glslColor(hex: number): string {
  const { r, g, b } = new Color(hex);
  return `vec3( ${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)} )`;
}

function replaceOnce(source: string, anchor: string, next: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`gravity grid patch: shader has no "${anchor}"`);
  }
  return source.replace(anchor, next);
}

/**
 * Colors each fragment by the depth of its point below the grid plane and
 * fades it out towards the rim of the grid. Depth and rim come from the
 * position itself, so the CPU writes only positions.
 */
export function patchGravityGrid(
  shader: WebGLProgramParametersWithUniforms,
  radius: number,
): void {
  const fadeStart = radius * (1 - GRAVITY_GRID_RIM_FADE);
  shader.vertexShader = replaceOnce(
    replaceOnce(
      shader.vertexShader,
      'void main() {',
      'varying float vGridDepth;\nvarying float vGridRim;\nvoid main() {',
    ),
    '#include <project_vertex>',
    `#include <project_vertex>
\tvGridDepth = -position.y - ${WELL.planeOffset.toFixed(4)};
\tvGridRim = 1.0 - smoothstep( ${fadeStart.toFixed(4)}, ${radius.toFixed(4)}, length( position.xz ) );`,
  );
  shader.fragmentShader = replaceOnce(
    replaceOnce(
      shader.fragmentShader,
      'void main() {',
      'varying float vGridDepth;\nvarying float vGridRim;\nvoid main() {',
    ),
    '#include <color_fragment>',
    `#include <color_fragment>
\tfloat gridDeep = clamp( vGridDepth / ${GRAVITY_GRID_COLOR_DEPTH.toFixed(4)}, 0.0, 1.0 );
\tdiffuseColor.rgb = mix( ${glslColor(GRAVITY_GRID_COLOR_FLAT)}, ${glslColor(GRAVITY_GRID_COLOR_DEEP)}, gridDeep ) * vGridRim;`,
  );
}

/**
 * Line points of the grid in the plane (scene x, scene z): lines parallel to
 * both axes, `spacing` apart, each cut to the disc of `radius` and sampled
 * every `step` or less. `indices` pairs neighbor points into segments.
 */
export function buildGridPoints(
  radius: number,
  spacing: number,
  step: number,
): GridPoints {
  for (const [name, value] of [
    ['radius', radius],
    ['spacing', spacing],
    ['step', step],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `buildGridPoints: parameter "${name}" must be finite and > 0, got ${value}`,
      );
    }
  }

  const xs: number[] = [];
  const zs: number[] = [];
  const indices: number[] = [];
  const lines = Math.floor(radius / spacing);
  for (const alongX of [true, false]) {
    for (let line = -lines; line <= lines; line += 1) {
      const offset = line * spacing;
      const half = Math.sqrt(Math.max(0, radius * radius - offset * offset));
      // A line that only touches the rim has no length.
      if (half === 0) {
        continue;
      }
      const samples = Math.max(1, Math.ceil((2 * half) / step));
      const first = xs.length;
      for (let sample = 0; sample <= samples; sample += 1) {
        const along = -half + (2 * half * sample) / samples;
        xs.push(alongX ? along : offset);
        zs.push(alongX ? offset : along);
        if (sample > 0) {
          indices.push(first + sample - 1, first + sample);
        }
      }
    }
  }

  return {
    xs: Float32Array.from(xs),
    zs: Float32Array.from(zs),
    indices: Uint32Array.from(indices),
  };
}

export function createGravityGrid(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
  level: QualityLevel,
): GravityGrid {
  const radius = gridRadius(defs);
  const wells = createWells(defs, radius);
  const star = wells.find(
    (well) => defs.find((def) => def.id === well.id)?.type === 'star',
  );
  if (star === undefined) {
    throw new Error('createGravityGrid: missing the star well');
  }
  const starWells: readonly Well[] = [star];
  const planets = wells.filter((well) => well !== star);
  const planetMeshes = planets.map((well) => {
    const mesh = meshes.get(well.id);
    if (mesh === undefined) {
      throw new Error(`createGravityGrid: missing mesh for body "${well.id}"`);
    }
    return mesh;
  });

  const material = new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.onBeforeCompile = (shader) => {
    patchGravityGrid(shader, radius);
  };

  let points: GridPoints = {
    xs: new Float32Array(0),
    zs: new Float32Array(0),
    indices: new Uint32Array(0),
  };
  let base = new Float32Array(0);
  let depths = new Float32Array(0);
  let geometry = new BufferGeometry();
  const lines = new LineSegments(geometry, material);
  lines.name = 'gravity-grid';
  lines.renderOrder = GRAVITY_GRID_RENDER_ORDER;
  lines.visible = false;
  // The grid takes no part in picking: a click goes through it.
  lines.raycast = () => undefined;

  let currentLevel: QualityLevel | null = null;
  let dirty = true;
  let disposed = false;
  const lastX = new Float64Array(planets.length).fill(Number.NaN);
  const lastZ = new Float64Array(planets.length).fill(Number.NaN);

  function build(nextLevel: QualityLevel): void {
    const { spacing, step } = GRAVITY_GRID_DENSITY[nextLevel];
    points = buildGridPoints(radius, spacing, step);
    const count = points.xs.length;
    // The Sun stays at the origin, so its funnel is computed once.
    base = new Float32Array(count);
    addWellDepths(points.xs, points.zs, starWells, base);
    depths = new Float32Array(count);

    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = points.xs[index] ?? 0;
      positions[index * 3 + 1] = -WELL.planeOffset;
      positions[index * 3 + 2] = points.zs[index] ?? 0;
    }
    const next = new BufferGeometry();
    const position = new Float32BufferAttribute(positions, 3);
    position.setUsage(DynamicDrawUsage);
    next.setAttribute('position', position);
    next.setIndex(new Uint32BufferAttribute(points.indices, 1));
    // The grid never leaves this sphere, so it is not recomputed per frame.
    const depthSpan = WELL.planeOffset + WELL.maxDepth;
    next.boundingSphere = new Sphere(
      new Vector3(0, -depthSpan / 2, 0),
      Math.hypot(radius, depthSpan / 2),
    );

    const previous = geometry;
    geometry = next;
    lines.geometry = next;
    previous.dispose();
    currentLevel = nextLevel;
    dirty = true;
  }

  function update(): void {
    if (disposed || !lines.visible) {
      return;
    }

    let moved = dirty;
    for (let index = 0; index < planets.length; index += 1) {
      const well = planets[index];
      const mesh = planetMeshes[index];
      if (well === undefined || mesh === undefined) {
        continue;
      }
      const { x, z } = mesh.position;
      if (x !== lastX[index] || z !== lastZ[index]) {
        lastX[index] = x;
        lastZ[index] = z;
        moved = true;
      }
      well.x = x;
      well.y = z;
    }
    if (!moved) {
      return;
    }

    depths.set(base);
    addWellDepths(points.xs, points.zs, planets, depths);
    clampDepths(depths);
    const position = geometry.getAttribute('position');
    const array = position.array;
    for (let index = 0; index < depths.length; index += 1) {
      array[index * 3 + 1] = -WELL.planeOffset - (depths[index] ?? 0);
    }
    position.needsUpdate = true;
    dirty = false;
  }

  build(level);

  return {
    lines,
    isVisible() {
      return lines.visible;
    },
    setVisible(visible) {
      if (disposed) {
        return;
      }
      lines.visible = visible;
      update();
    },
    setQuality(nextLevel) {
      if (disposed || nextLevel === currentLevel) {
        return;
      }
      build(nextLevel);
      update();
    },
    update,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
