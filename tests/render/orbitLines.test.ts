import {
  BufferGeometry,
  LineBasicMaterial,
  LineLoop,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Vector3,
  type BufferGeometry as BufferGeometryType,
} from 'three';
import { expect, test, vi } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { createSelection } from '@core/selection.ts';
import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef, OrbitDef } from '@data/types.ts';
import {
  ORBIT_COLOR,
  ORBIT_GAP_RADIUS_FACTOR,
  ORBIT_OPACITY,
  ORBIT_SEGMENTS,
  addOrbitLines,
  computeOrbitPoints,
  createOrbitLines,
  patchOrbitGap,
} from '@render/orbitLines.ts';
import { eclipticToScene } from '@render/coords.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { compressPositionAu, type Vec3 } from '@sim/scale.ts';

function requireOrbit(def: BodyDef): OrbitDef {
  if (def.orbit === undefined) {
    throw new Error(`missing orbit: ${def.id}`);
  }

  return def.orbit;
}

function scenePosition(def: BodyDef, days: number): Vector3 {
  const au: Vec3 = { x: 0, y: 0, z: 0 };
  const scene: Vec3 = { x: 0, y: 0, z: 0 };
  bodyPositionAu(def, days, au);
  compressPositionAu(au.x, au.y, au.z, scene);
  return eclipticToScene(scene, new Vector3());
}

function positionArray(geometry: BufferGeometryType): Float32Array {
  const attribute = geometry.getAttribute('position');
  if (!(attribute.array instanceof Float32Array)) {
    throw new Error('expected a Float32Array position attribute');
  }

  return attribute.array;
}

function vertex(points: Float32Array, index: number): Vector3 {
  const offset = index * 3;
  return new Vector3(
    points[offset] ?? Number.NaN,
    points[offset + 1] ?? Number.NaN,
    points[offset + 2] ?? Number.NaN,
  );
}

function distancePointToSegment(
  point: Vector3,
  start: Vector3,
  end: Vector3,
): number {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const abz = end.z - start.z;
  const apx = point.x - start.x;
  const apy = point.y - start.y;
  const apz = point.z - start.z;
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  const unclamped =
    lengthSquared === 0
      ? 0
      : (apx * abx + apy * aby + apz * abz) / lengthSquared;
  const t = Math.min(1, Math.max(0, unclamped));
  return Math.hypot(
    start.x + t * abx - point.x,
    start.y + t * aby - point.y,
    start.z + t * abz - point.z,
  );
}

function distanceToClosedPolyline(
  points: Float32Array,
  point: Vector3,
): { segment: number; vertex: number } {
  const count = points.length / 3;
  let segment = Number.POSITIVE_INFINITY;
  let nearestVertex = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const start = vertex(points, index);
    const end = vertex(points, (index + 1) % count);
    segment = Math.min(segment, distancePointToSegment(point, start, end));
    nearestVertex = Math.min(nearestVertex, start.distanceTo(point));
  }

  return { segment, vertex: nearestVertex };
}

function asLine(child: object, name: string): LineLoop {
  if (!(child instanceof LineLoop)) {
    throw new Error(`expected a LineLoop: ${name}`);
  }

  return child;
}

function lineMaterial(line: LineLoop): LineBasicMaterial {
  if (
    Array.isArray(line.material) ||
    !(line.material instanceof LineBasicMaterial)
  ) {
    throw new Error(`expected one LineBasicMaterial: ${line.name}`);
  }

  return line.material;
}

function copyAs(
  source: BodyDef,
  id: string,
  type: BodyDef['type'],
  orbit: OrbitDef | undefined,
): BodyDef {
  return {
    ...source,
    id,
    name: id,
    type,
    parentId: type === 'moon' ? 'earth' : null,
    orbit,
    contentKey: id,
    // Any type with Earth's orbit: the tests check which types get a line.
  } as BodyDef;
}

test('orbitLines › constants', () => {
  expect(ORBIT_SEGMENTS).toBe(256);
  expect(ORBIT_COLOR).toBe(0x5b6b8c);
  expect(ORBIT_OPACITY).toBe(0.55);
});

test('orbitLines › eight lines, shared material', () => {
  const view = createOrbitLines(bodies);
  const planets = bodies.filter((body) => body.type === 'planet');

  expect(view.group.children).toHaveLength(8);

  const lines = view.group.children.map((child) => asLine(child, child.name));
  const first = lines[0];
  if (first === undefined) {
    view.dispose();
    throw new Error('missing orbit line');
  }
  const material = lineMaterial(first);

  expect(lines.map((line) => line.name)).toEqual(
    planets.map((planet) => `orbit-${planet.id}`),
  );
  expect(material.color.getHex()).toBe(ORBIT_COLOR);
  expect(material.opacity).toBe(ORBIT_OPACITY);
  expect(material.transparent).toBe(true);
  expect(material.depthWrite).toBe(false);

  for (const line of lines) {
    expect(lineMaterial(line)).toBe(material);
    expect(line.frustumCulled).toBe(false);
    expect(line.renderOrder).toBe(-1);
  }

  view.dispose();
});

test('orbitLines › 256 vertices', () => {
  const view = createOrbitLines(bodies);

  for (const child of view.group.children) {
    const line = asLine(child, child.name);
    const points = positionArray(line.geometry);
    expect(points).toHaveLength(ORBIT_SEGMENTS * 3);
    for (const value of points) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }

  view.dispose();
});

test('orbitLines › Mercury min and max', () => {
  const view = createOrbitLines(bodies);
  const mercury = view.group.children.find(
    (child) => child.name === 'orbit-mercury',
  );
  if (mercury === undefined) {
    view.dispose();
    throw new Error('missing orbit-mercury');
  }

  const points = positionArray(asLine(mercury, mercury.name).geometry);
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (let index = 0; index < ORBIT_SEGMENTS; index += 1) {
    const distance = vertex(points, index).length();
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }

  expect(Math.abs(min - 4.44)).toBeLessThanOrEqual(0.02);
  expect(Math.abs(max - 5.47)).toBeLessThanOrEqual(0.02);
  view.dispose();
});

test('orbitLines › Earth in range', () => {
  const view = createOrbitLines(bodies);
  const earth = view.group.children.find(
    (child) => child.name === 'orbit-earth',
  );
  if (earth === undefined) {
    view.dispose();
    throw new Error('missing orbit-earth');
  }

  const points = positionArray(asLine(earth, earth.name).geometry);
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (let index = 0; index < ORBIT_SEGMENTS; index += 1) {
    const distance = vertex(points, index).length();
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }

  expect(min).toBeGreaterThanOrEqual(7.93);
  expect(max).toBeLessThanOrEqual(8.07);
  view.dispose();
});

test('orbitLines › planet lies on the line', () => {
  const view = createOrbitLines(bodies);
  const planets = bodies.filter((body) => body.type === 'planet');

  for (const planet of planets) {
    const child = view.group.children.find(
      (item) => item.name === `orbit-${planet.id}`,
    );
    if (child === undefined) {
      view.dispose();
      throw new Error(`missing orbit-${planet.id}`);
    }

    const points = positionArray(asLine(child, child.name).geometry);
    const position = scenePosition(planet, 0);
    const distance = distanceToClosedPolyline(points, position);
    console.info(
      `${planet.id} segment ${distance.segment} vertex ${distance.vertex}`,
    );
    expect(distance.segment).toBeLessThan(0.01);
  }

  view.dispose();
});

test('orbitLines › point-to-segment helper', () => {
  const start = new Vector3(0, 0, 0);
  const end = new Vector3(2, 0, 0);

  expect(distancePointToSegment(new Vector3(1, 0, 0), start, end)).toBe(0);
  expect(distancePointToSegment(new Vector3(4, 0, 0), start, end)).toBe(2);
  expect(distancePointToSegment(new Vector3(1, 3, 0), start, end)).toBe(3);
});

test('computeOrbitPoints › Sun and Moon', () => {
  expect(() => computeOrbitPoints(getBody('sun'))).toThrow(
    'computeOrbitPoints: body "sun" has no heliocentric orbit',
  );

  const moon = copyAs(
    getBody('earth'),
    'moon',
    'moon',
    requireOrbit(getBody('earth')),
  );
  expect(() => computeOrbitPoints(moon)).toThrow(
    'computeOrbitPoints: body "moon" has no heliocentric orbit',
  );
});

test('computeOrbitPoints › segments', () => {
  const earth = getBody('earth');
  const rejected = [2, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 0, -4];

  for (const segments of rejected) {
    expect(() => computeOrbitPoints(earth, segments)).toThrow(RangeError);
    expect(() => computeOrbitPoints(earth, segments)).toThrow(
      `parameter "segments" must be an integer >= 3, got ${segments}`,
    );
  }

  expect(computeOrbitPoints(earth, 3)).toHaveLength(9);
});

test('computeOrbitPoints › anomaly of point k', () => {
  const earth = getBody('earth');
  const orbit = requireOrbit(earth);
  const points = computeOrbitPoints(earth);
  const atStart = scenePosition(
    earth,
    -orbit.periodDays * (orbit.meanAnomalyAtEpochDeg / 360),
  );

  expect(vertex(points, 0).distanceTo(atStart)).toBeLessThan(1e-5);

  const turns = orbit.meanAnomalyAtEpochDeg / 360;
  const nearest = Math.round(turns * ORBIT_SEGMENTS) % ORBIT_SEGMENTS;
  const halfStep =
    (Math.PI / ORBIT_SEGMENTS) * scenePosition(earth, 0).length();
  expect(
    vertex(points, nearest).distanceTo(scenePosition(earth, 0)),
  ).toBeLessThan(halfStep);
});

test('createOrbitLines › skips non-planets', () => {
  const earth = getBody('earth');
  const orbit = requireOrbit(earth);
  const view = createOrbitLines([
    ...bodies,
    copyAs(earth, 'moon', 'moon', orbit),
    copyAs(earth, 'ceres', 'dwarf', orbit),
    copyAs(earth, 'asteroids', 'belt', orbit),
  ]);
  const names = view.group.children.map((child) => child.name);

  expect(names).toEqual(
    bodies
      .filter((body) => body.type === 'planet')
      .map((planet) => `orbit-${planet.id}`),
  );
  view.dispose();
});

test('createOrbitLines › no planets', () => {
  const empty = createOrbitLines([]);
  expect(empty.group.children).toHaveLength(0);
  expect(() => empty.dispose()).not.toThrow();
  expect(() => empty.dispose()).not.toThrow();

  const sunOnly = createOrbitLines([getBody('sun')]);
  expect(sunOnly.group.children).toHaveLength(0);
  expect(() => sunOnly.dispose()).not.toThrow();
});

test('computeOrbitPoints › RangeError propagates', () => {
  const earth = getBody('earth');
  if (earth.type === 'moon' || earth.orbit === undefined) {
    throw new Error('Earth has no orbit');
  }
  const broken: BodyDef = {
    ...earth,
    orbit: { ...earth.orbit, eccentricity: Number.NaN },
  };

  expect(() => computeOrbitPoints(broken)).toThrow(RangeError);
  expect(() => createOrbitLines([broken])).toThrow(RangeError);
});

test('orbitLines › dispose', () => {
  const view = createOrbitLines(bodies);
  const lines = view.group.children.map((child) => asLine(child, child.name));
  const first = lines[0];
  if (first === undefined) {
    throw new Error('missing orbit line');
  }
  const geometrySpies = lines.map((line) => vi.spyOn(line.geometry, 'dispose'));
  const materialSpy = vi.spyOn(lineMaterial(first), 'dispose');

  view.dispose();

  expect(geometrySpies).toHaveLength(8);
  for (const spy of geometrySpies) {
    expect(spy).toHaveBeenCalledOnce();
  }
  expect(materialSpy).toHaveBeenCalledOnce();
  expect(view.group.children).toHaveLength(0);

  expect(() => view.dispose()).not.toThrow();
  for (const spy of geometrySpies) {
    expect(spy).toHaveBeenCalledOnce();
  }
  expect(materialSpy).toHaveBeenCalledOnce();
});

function lineOpacity(
  view: ReturnType<typeof createOrbitLines>,
  id: string,
): number {
  const child = view.group.children.find((item) => item.name === `orbit-${id}`);
  if (child === undefined) {
    throw new Error(`missing orbit-${id}`);
  }

  return lineMaterial(asLine(child, child.name)).opacity;
}

function expectEveryOpacity(
  view: ReturnType<typeof createOrbitLines>,
  opacity: number,
): void {
  for (const child of view.group.children) {
    expect(lineMaterial(asLine(child, child.name)).opacity).toBe(opacity);
  }
}

test('selection opacity', () => {
  const view = createOrbitLines(bodies);
  const selection = createSelection(
    getSelectableBodies(bodies).map((body) => body.id),
  );
  selection.subscribe((event) => {
    if (event.kind === 'selected') {
      view.setSelectedBody(event.id);
      return;
    }
    if (event.kind === 'system') {
      view.setSelectedBody(null);
    }
  });

  expectEveryOpacity(view, ORBIT_OPACITY);

  selection.select('mars');
  expect(lineOpacity(view, 'mars')).toBe(CAMERA_CONFIG.orbitOpacitySelected);
  expect(lineOpacity(view, 'mars')).toBe(0.8);
  for (const child of view.group.children) {
    if (child.name === 'orbit-mars') {
      continue;
    }
    expect(lineMaterial(asLine(child, child.name)).opacity).toBe(
      CAMERA_CONFIG.orbitOpacityDimmed,
    );
    expect(lineMaterial(asLine(child, child.name)).opacity).toBe(0.35);
  }

  selection.select('sun');
  expectEveryOpacity(view, ORBIT_OPACITY);

  selection.select('venus');
  expect(lineOpacity(view, 'venus')).toBe(0.8);
  selection.showSystem();
  expectEveryOpacity(view, ORBIT_OPACITY);

  view.setSelectedBody('pluto');
  expectEveryOpacity(view, ORBIT_OPACITY);

  selection.dispose();
  view.dispose();
});

test('setOrbitLinesVisible toggles group', () => {
  const view = createOrbitLines(bodies);
  view.setSelectedBody('saturn');
  view.setOrbitLinesVisible(false);

  expect(view.group.visible).toBe(false);
  expect(lineOpacity(view, 'saturn')).toBe(0.8);
  expect(lineOpacity(view, 'earth')).toBe(0.35);

  view.setOrbitLinesVisible(true);
  expect(view.group.visible).toBe(true);
  expect(lineOpacity(view, 'saturn')).toBe(0.8);
  expect(lineOpacity(view, 'earth')).toBe(0.35);
  view.dispose();
});

test('dispose frees three materials once', () => {
  const view = createOrbitLines(bodies);
  const geometrySpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
  const materialSpy = vi.spyOn(LineBasicMaterial.prototype, 'dispose');
  geometrySpy.mockClear();
  materialSpy.mockClear();

  try {
    view.dispose();
    expect(geometrySpy).toHaveBeenCalledTimes(8);
    expect(materialSpy).toHaveBeenCalledTimes(3);
    view.dispose();
    expect(geometrySpy).toHaveBeenCalledTimes(8);
    expect(materialSpy).toHaveBeenCalledTimes(3);
  } finally {
    geometrySpy.mockRestore();
    materialSpy.mockRestore();
  }
});

test('one LineLoop per planet', () => {
  const view = createOrbitLines(bodies);
  const loops = view.group.children.filter(
    (child) => child instanceof LineLoop,
  );

  expect(loops).toHaveLength(8);
  expect(view.group.children).toHaveLength(8);
  view.dispose();
});

test('addOrbitLines › adds the group to the scene', () => {
  const scene = new Scene();
  const lines = addOrbitLines(scene, bodies);

  expect(scene.children).toHaveLength(1);
  expect(scene.children[0]?.children).toHaveLength(8);

  lines.dispose();
  expect(scene.children).toHaveLength(0);
  expect(() => lines.dispose()).not.toThrow();
});

function gapMaterials(
  lines: ReturnType<typeof createOrbitLines>,
  defs: readonly BodyDef[] = bodies,
): LineBasicMaterial[] {
  const found = new Set<LineBasicMaterial>();
  const collect = (): void => {
    for (const child of lines.group.children) {
      if (
        child instanceof LineLoop &&
        child.material instanceof LineBasicMaterial
      ) {
        found.add(child.material);
      }
    }
  };
  collect();
  const planet = defs.find((def) => def.type === 'planet');
  lines.setSelectedBody(planet?.id ?? null);
  collect();
  return [...found];
}

type FakeShader = {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
};

function compile(material: LineBasicMaterial): FakeShader {
  const shader: FakeShader = {
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
    uniforms: {},
  };
  material.onBeforeCompile(
    shader as unknown as Parameters<LineBasicMaterial['onBeforeCompile']>[0],
    undefined as never,
  );
  return shader;
}

test('orbitLines › gap patch on all three materials', () => {
  const lines = createOrbitLines(bodies);
  const materials = gapMaterials(lines);
  expect(materials).toHaveLength(3);

  const uniforms = new Set<unknown>();
  for (const material of materials) {
    const shader = compile(material);
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.fragmentShader).toContain('uniform vec3 uGapC;');
    expect(shader.fragmentShader).toContain('uniform float uGapR;');
    expect(shader.vertexShader).toContain('vGapViewPosition = mvPosition.xyz;');
    expect(shader.uniforms.uGapC?.value).toBeInstanceOf(Vector3);
    uniforms.add(shader.uniforms.uGapR);
  }
  // One shared uniform object, so setGap reaches every material.
  expect(uniforms.size).toBe(1);
  lines.dispose();
});

test('orbitLines › patchOrbitGap fails loudly on an unknown shader', () => {
  expect(() =>
    patchOrbitGap(
      {
        vertexShader: 'void main() {}',
        fragmentShader: 'void main() {}',
        uniforms: {},
      } as unknown as Parameters<typeof patchOrbitGap>[0],
      { uGapC: { value: new Vector3() }, uGapR: { value: 0 } },
    ),
  ).toThrow('orbit gap patch: shader has no "#include <project_vertex>"');
});

test('orbitLines › setGap updates uniforms', () => {
  expect(ORBIT_GAP_RADIUS_FACTOR).toBe(1.25);
  const lines = createOrbitLines(bodies);
  const [material] = gapMaterials(lines);
  if (material === undefined) {
    throw new Error('missing material');
  }
  const { uniforms } = compile(material);
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 2000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);

  const center = new Vector3(10, 0, 0);
  lines.setGap(center, 2, camera);
  expect(uniforms.uGapR?.value).toBeCloseTo(2 * 1.25, 10);
  const viewCenter = uniforms.uGapC?.value as Vector3;
  expect(viewCenter.x).toBeCloseTo(10, 8);
  expect(viewCenter.y).toBeCloseTo(0, 8);
  expect(viewCenter.z).toBeCloseTo(-50, 8);
  // The world center is not changed.
  expect(center.toArray()).toEqual([10, 0, 0]);

  // A moved camera is picked up without a render in between.
  camera.position.set(0, 0, 80);
  lines.setGap(center, 2, camera);
  expect(viewCenter.z).toBeCloseTo(-80, 8);

  lines.setGap(null, 2, camera);
  expect(uniforms.uGapR?.value).toBe(0);
  lines.setGap(center, 0, camera);
  expect(uniforms.uGapR?.value).toBe(0);
  lines.dispose();
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  'orbitLines › setGap rejects invalid radius %s',
  (radius) => {
    const lines = createOrbitLines(bodies);
    const camera = new PerspectiveCamera();
    const call = () => lines.setGap(new Vector3(), radius, camera);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `setGap: parameter "radius" must be finite and >= 0, got ${radius}`,
    );
    expect(() => lines.setGap(null, radius, camera)).toThrow(RangeError);
    lines.dispose();
  },
);

test('orbitLines › setGap does not allocate', () => {
  const lines = createOrbitLines(bodies);
  const camera = new PerspectiveCamera();
  const center = new Vector3(3, 1, 2);
  const spy = vi.spyOn(Vector3.prototype, 'clone');
  for (let frame = 0; frame < 10; frame += 1) {
    lines.setGap(center, 1, camera);
  }
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  lines.dispose();
});
