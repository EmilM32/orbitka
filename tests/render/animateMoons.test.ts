import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createMoonAnimator } from '@render/animateMoons.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { ORBIT_STEP_FADE_DEG, orbitStepDegrees } from '@sim/orbitStep.ts';
import { spinAngleRad } from '@sim/rotation.ts';
import {
  compressMoonOffsetKm,
  moonRadiiToScene,
  radiusToScene,
} from '@sim/scale.ts';

const TWO_PI = Math.PI * 2;
const MOON_IDS = ['moon', 'io', 'europa', 'ganymede', 'callisto'] as const;
const CONTROL_DISTANCE = {
  moon: 1.019,
  io: 2.087,
  europa: 2.139,
  ganymede: 2.213,
  callisto: 2.341,
} as const;

function makeMesh(id: string): Mesh {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), new MeshBasicMaterial());
  mesh.name = id;
  return mesh;
}

function sceneMeshes(defs: readonly BodyDef[]): Map<string, Mesh> {
  const meshes = new Map<string, Mesh>();
  for (const def of defs) {
    if (def.type === 'star' || def.type === 'planet' || def.type === 'moon') {
      meshes.set(def.id, makeMesh(def.id));
    }
  }
  return meshes;
}

function disposeMeshes(meshes: ReadonlyMap<string, Mesh>): void {
  for (const mesh of meshes.values()) {
    mesh.geometry.dispose();
    if (!Array.isArray(mesh.material)) {
      mesh.material.dispose();
    }
  }
}

function requireMesh(meshes: ReadonlyMap<string, Mesh>, id: string): Mesh {
  const mesh = meshes.get(id);
  if (mesh === undefined) {
    throw new Error(`missing mesh ${id}`);
  }
  return mesh;
}

function requireOrbit(def: BodyDef): NonNullable<BodyDef['orbit']> {
  if (def.orbit === undefined) {
    throw new Error(`missing orbit ${def.id}`);
  }
  return def.orbit;
}

function moonAxisKm(def: BodyDef): number {
  if (def.type !== 'moon' || def.orbit === undefined) {
    throw new Error(`missing moon orbit ${def.id}`);
  }
  return def.orbit.semiMajorAxisKm;
}

function angularDistance(left: number, right: number): number {
  const turns = (left - right) / TWO_PI;
  let fraction = turns - Math.floor(turns);
  if (fraction >= 1) {
    fraction = 0;
  }
  const wrapped = fraction * TWO_PI;
  return wrapped > Math.PI ? TWO_PI - wrapped : wrapped;
}

function periapsisDay(def: BodyDef): number {
  const orbit = requireOrbit(def);
  const turns = -orbit.meanAnomalyAtEpochDeg / 360;
  return orbit.periodDays * (turns - Math.floor(turns));
}

function finiteVector(vector: Vector3): void {
  expect(Number.isFinite(vector.x)).toBe(true);
  expect(Number.isFinite(vector.y)).toBe(true);
  expect(Number.isFinite(vector.z)).toBe(true);
}

test('animateMoons › control distances', () => {
  const meshes = sceneMeshes(bodies);
  const planets = createBodyAnimator(bodies, meshes);
  const moons = createMoonAnimator(bodies, meshes);
  planets.update(0);
  moons.update(0, 1);

  for (const id of MOON_IDS) {
    const def = getBody(id);
    const mesh = requireMesh(meshes, id);
    const parentId = def.parentId;
    if (parentId === null) {
      throw new Error(`missing parent ${id}`);
    }
    const parent = requireMesh(meshes, parentId);
    const distance = mesh.position.distanceTo(parent.position);

    expect(mesh.parent).toBeNull();
    expect(parent.children).not.toContain(mesh);
    expect(Math.abs(distance - CONTROL_DISTANCE[id])).toBeLessThanOrEqual(
      0.005,
    );
  }

  const earth = requireMesh(meshes, 'earth');
  const moon = requireMesh(meshes, 'moon');
  const km = bodyPositionAu(getBody('moon'), 0, { x: 0, y: 0, z: 0 });
  const scene = compressMoonOffsetKm(
    km.x,
    km.y,
    km.z,
    getBody('earth').radiusKm,
    { x: 0, y: 0, z: 0 },
  );
  const offset = moon.position.clone().sub(earth.position);

  expect(km.x).toBeCloseTo(-292453.9, 0);
  expect(km.y).toBeCloseTo(-270671.9, 0);
  expect(km.z).toBeCloseTo(35659.9, 0);
  expect(offset.x).toBeCloseTo(scene.x, 8);
  expect(offset.y).toBeCloseTo(scene.z, 8);
  expect(offset.z).toBeCloseTo(-scene.y, 8);

  disposeMeshes(meshes);
});

test('animateMoons › follows the parent', () => {
  const meshes = sceneMeshes(bodies);
  const planets = createBodyAnimator(bodies, meshes);
  const moons = createMoonAnimator(bodies, meshes);
  const shift = new Vector3(4, -2, 0.5);
  planets.update(0);
  moons.update(0, 1);

  const before = new Map<string, Vector3>();
  for (const id of MOON_IDS) {
    before.set(id, requireMesh(meshes, id).position.clone());
  }

  requireMesh(meshes, 'earth').position.add(shift);
  requireMesh(meshes, 'jupiter').position.add(shift);
  moons.update(0, 1);

  for (const id of MOON_IDS) {
    const mesh = requireMesh(meshes, id);
    const start = before.get(id);
    if (start === undefined) {
      throw new Error(`missing start ${id}`);
    }
    expect(mesh.position.clone().sub(start).distanceTo(shift)).toBeLessThan(
      1e-9,
    );
  }

  disposeMeshes(meshes);
});

test('animateMoons › full period', () => {
  const meshes = sceneMeshes(bodies);
  const planets = createBodyAnimator(bodies, meshes);
  const moons = createMoonAnimator(bodies, meshes);
  planets.update(0);
  moons.update(0, 1);

  const start = new Map<string, Vector3>();
  for (const id of MOON_IDS) {
    start.set(id, requireMesh(meshes, id).position.clone());
  }

  for (const id of MOON_IDS) {
    const orbit = requireOrbit(getBody(id));
    moons.update(orbit.periodDays, 1);
    const mesh = requireMesh(meshes, id);
    const atEpoch = start.get(id);
    if (atEpoch === undefined) {
      throw new Error(`missing start ${id}`);
    }
    expect(mesh.position.distanceTo(atEpoch)).toBeLessThanOrEqual(1e-6);
  }

  disposeMeshes(meshes);
});

test('animateMoons › no overlap', () => {
  const meshes = sceneMeshes(bodies);
  const planets = createBodyAnimator(bodies, meshes);
  const moons = createMoonAnimator(bodies, meshes);
  const groups = new Map<string, BodyDef[]>();

  for (const def of bodies) {
    if (def.type !== 'moon' || def.parentId === null) {
      continue;
    }
    const list = groups.get(def.parentId);
    if (list === undefined) {
      groups.set(def.parentId, [def]);
    } else {
      list.push(def);
    }
  }

  const period = requireOrbit(getBody('callisto')).periodDays;
  const days = [periapsisDay(getBody('moon'))];
  for (let step = 0; step <= 200; step += 1) {
    days.push((period * step) / 200);
  }
  for (const id of ['io', 'europa', 'ganymede', 'callisto'] as const) {
    days.push(periapsisDay(getBody(id)));
  }

  const placed = [...groups.entries()].map(([parentId, group]) => {
    const parent = getBody(parentId);
    return {
      parentId,
      group,
      radii: moonRadiiToScene(
        group.map((moon) => moonAxisKm(moon)),
        group.map((moon) => requireOrbit(moon).eccentricity),
        group.map((moon) => moon.radiusKm),
        parent.radiusKm,
      ),
      parentRadius: radiusToScene(parent.radiusKm),
    };
  });

  for (const day of days) {
    planets.update(day);
    moons.update(day, 1);

    for (const { parentId, group, radii, parentRadius } of placed) {
      const parentMesh = requireMesh(meshes, parentId);

      for (let index = 0; index < group.length; index += 1) {
        const moon = group[index];
        const radius = radii[index];
        if (moon === undefined || radius === undefined) {
          throw new Error('missing moon radius');
        }
        const mesh = requireMesh(meshes, moon.id);
        const parentGap = mesh.position.distanceTo(parentMesh.position);
        expect(parentGap + 1e-9).toBeGreaterThanOrEqual(parentRadius + radius);

        for (let other = index + 1; other < group.length; other += 1) {
          const neighbor = group[other];
          const neighborRadius = radii[other];
          if (neighbor === undefined || neighborRadius === undefined) {
            throw new Error('missing neighbor');
          }
          const gap = mesh.position.distanceTo(
            requireMesh(meshes, neighbor.id).position,
          );
          expect(gap + 1e-9).toBeGreaterThanOrEqual(radius + neighborRadius);
        }
      }
    }
  }

  disposeMeshes(meshes);
});

test('animateMoons › missing parent mesh', () => {
  const withoutJupiter = sceneMeshes(bodies);
  withoutJupiter.delete('jupiter');
  expect(() => createMoonAnimator(bodies, withoutJupiter)).toThrow(
    'createMoonAnimator: missing parent mesh "jupiter" for moon "io"',
  );
  disposeMeshes(withoutJupiter);

  const withMesh = sceneMeshes(bodies);
  const withoutDef = bodies.filter((body) => body.id !== 'jupiter');
  expect(() => createMoonAnimator(withoutDef, withMesh)).toThrow(
    'createMoonAnimator: missing parent mesh "jupiter" for moon "io"',
  );
  disposeMeshes(withMesh);

  const orphan = { ...getBody('moon'), parentId: null };
  const orphanMeshes = new Map([[orphan.id, makeMesh(orphan.id)]]);
  expect(() => createMoonAnimator([orphan], orphanMeshes)).toThrow(
    'createMoonAnimator: missing parent mesh "null" for moon "moon"',
  );
  disposeMeshes(orphanMeshes);

  const earth = getBody('earth');
  const moon = getBody('moon');
  const noMoonMesh = new Map([[earth.id, makeMesh(earth.id)]]);
  expect(() => createMoonAnimator([earth, moon], noMoonMesh)).toThrow(
    'createMoonAnimator: missing mesh for moon "moon"',
  );
  disposeMeshes(noMoonMesh);
});

test('animateMoons › RangeError', () => {
  const meshes = sceneMeshes(bodies);
  const animator = createMoonAnimator(bodies, meshes);
  animator.update(1, 1);
  const positions = MOON_IDS.map((id) =>
    requireMesh(meshes, id).position.clone(),
  );
  const spins = MOON_IDS.map((id) => requireMesh(meshes, id).rotation.y);

  for (const days of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    expect(() => animator.update(days, 1)).toThrow(RangeError);
  }
  expect(() => animator.update(1, Number.NaN)).toThrow(RangeError);

  for (let index = 0; index < MOON_IDS.length; index += 1) {
    const id = MOON_IDS[index];
    const previous = positions[index];
    const spin = spins[index];
    if (id === undefined || previous === undefined || spin === undefined) {
      throw new Error('missing snapshot');
    }
    const mesh = requireMesh(meshes, id);
    expect(mesh.position.distanceTo(previous)).toBe(0);
    expect(mesh.rotation.y).toBe(spin);
    finiteVector(mesh.position);
    expect(Number.isFinite(mesh.rotation.y)).toBe(true);
    expect(Number.isFinite(mesh.rotation.z)).toBe(true);
  }
  disposeMeshes(meshes);

  const earth = { ...getBody('earth') };
  const moon = getBody('moon');
  const pair = new Map([
    [earth.id, makeMesh(earth.id)],
    [moon.id, makeMesh(moon.id)],
  ]);
  const broken = createMoonAnimator([earth, moon], pair);
  broken.update(0, 1);
  const moonMesh = requireMesh(pair, moon.id);
  const before = moonMesh.position.clone();
  earth.radiusKm = 0;

  expect(() => broken.update(1, 1)).toThrow(RangeError);
  expect(moonMesh.position.distanceTo(before)).toBe(0);
  finiteVector(moonMesh.position);
  expect(getBody('earth').radiusKm).toBeGreaterThan(0);
  disposeMeshes(pair);
});

test('animateMoons › negative days and empty', () => {
  const meshes = sceneMeshes(bodies);
  const animator = createMoonAnimator(bodies, meshes);
  animator.update(-30_000, 1);

  for (const id of MOON_IDS) {
    const mesh = requireMesh(meshes, id);
    finiteVector(mesh.position);
    expect(Number.isFinite(mesh.rotation.y)).toBe(true);
    expect(Number.isFinite(mesh.rotation.z)).toBe(true);
  }

  animator.update(12.5, 1);
  const once = MOON_IDS.map((id) => requireMesh(meshes, id).position.clone());
  animator.update(12.5, 1);
  for (let index = 0; index < MOON_IDS.length; index += 1) {
    const id = MOON_IDS[index];
    const previous = once[index];
    if (id === undefined || previous === undefined) {
      throw new Error('missing snapshot');
    }
    expect(requireMesh(meshes, id).position.distanceTo(previous)).toBe(0);
  }
  disposeMeshes(meshes);

  expect(() =>
    createMoonAnimator([], new Map()).update(Number.NaN, Number.NaN),
  ).not.toThrow();

  const planets = bodies.filter((body) => body.type !== 'moon');
  const planetMeshes = sceneMeshes(planets);
  expect(() =>
    createMoonAnimator(planets, planetMeshes).update(Number.NaN, Number.NaN),
  ).not.toThrow();
  disposeMeshes(planetMeshes);
});

test('animateMoons › synchronous spin', () => {
  const meshes = sceneMeshes(bodies);
  const animator = createMoonAnimator(bodies, meshes);
  const moon = requireMesh(meshes, 'moon');
  const tilt = (6.68 * Math.PI) / 180;

  expect(moon.rotation.order).toBe('ZYX');
  expect(moon.rotation.z).toBe(tilt);
  for (const id of ['io', 'europa', 'ganymede', 'callisto'] as const) {
    const mesh = requireMesh(meshes, id);
    expect(mesh.rotation.order).toBe('ZYX');
    expect(mesh.rotation.z).toBe(0);
  }

  animator.update(0, 0.1);
  for (const id of MOON_IDS) {
    const def = getBody(id);
    const mesh = requireMesh(meshes, id);
    expect(mesh.rotation.y).toBe(spinAngleRad(0, def.rotation.periodHours));
    expect(mesh.rotation.z).toBe(id === 'moon' ? tilt : 0);
  }

  for (const id of MOON_IDS) {
    const def = getBody(id);
    const mesh = requireMesh(meshes, id);
    animator.update(0, 0.1);
    const spun = mesh.rotation.y;
    animator.update(def.rotation.periodHours / 24, 0.1);
    expect(angularDistance(mesh.rotation.y, spun)).toBeLessThan(1e-6);
    expect(mesh.rotation.z).toBe(id === 'moon' ? tilt : 0);
  }

  // periodHours is the catalog value, not periodDays * 24, so one orbit
  // does not repeat the spin angle to 1e-6.
  for (const id of MOON_IDS) {
    const def = getBody(id);
    const mesh = requireMesh(meshes, id);
    animator.update(0, 0.1);
    const spun = mesh.rotation.y;
    animator.update(requireOrbit(def).periodDays, 0.1);
    expect(angularDistance(mesh.rotation.y, spun)).toBeLessThan(1e-3);
  }

  animator.update(4, 1);
  const paused = moon.rotation.y;
  const pausedTilt = moon.rotation.z;
  animator.update(4, 0);
  animator.update(4, 0);
  expect(moon.rotation.y).toBe(paused);
  expect(moon.rotation.z).toBe(pausedTilt);

  disposeMeshes(meshes);

  const reverseMeshes = sceneMeshes(bodies);
  const reverse = createMoonAnimator(bodies, reverseMeshes);
  const io = requireMesh(reverseMeshes, 'io');
  reverse.update(0, 0.1);
  const position = io.position.clone();
  const angle = io.rotation.y;
  reverse.update(0.004, 0.1);
  reverse.update(0, -0.1);
  expect(io.position.distanceTo(position)).toBeLessThan(1e-9);
  expect(angularDistance(io.rotation.y, angle)).toBeLessThan(1e-6);
  disposeMeshes(reverseMeshes);
});

test('animateMoons › orbit step fade', () => {
  const ioDef = getBody('io');
  const periodDays = requireOrbit(ioDef).periodDays;
  const atThreshold = (ORBIT_STEP_FADE_DEG * periodDays) / 360;
  const overThreshold = (30.0001 * periodDays) / 360;
  const meshes = sceneMeshes(bodies);
  const animator = createMoonAnimator(bodies, meshes);
  const io = requireMesh(meshes, 'io');

  animator.update(0, 3652.5);
  expect(io.visible).toBe(true);

  animator.update(atThreshold, 3652.5);
  expect(orbitStepDegrees(atThreshold, periodDays)).toBeCloseTo(
    ORBIT_STEP_FADE_DEG,
    6,
  );
  expect(io.visible).toBe(true);
  expect(Number.isFinite(io.position.x)).toBe(true);

  const hiddenAt = atThreshold + overThreshold;
  animator.update(hiddenAt, 0.1);
  expect(orbitStepDegrees(overThreshold, periodDays)).toBeGreaterThan(
    ORBIT_STEP_FADE_DEG,
  );
  expect(io.visible).toBe(false);

  animator.update(hiddenAt, 0.1);
  expect(io.visible).toBe(true);

  animator.update(hiddenAt - atThreshold, -3652.5);
  expect(io.visible).toBe(true);
  expect(Number.isFinite(io.position.x)).toBe(true);

  disposeMeshes(meshes);
});
