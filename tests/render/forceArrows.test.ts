import {
  Color,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  ShaderLib,
  Vector2,
  Vector3,
  type InstancedMesh,
} from 'three';
import { expect, test } from 'vitest';

import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { bodies } from '@data/bodies.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createBodies } from '@render/bodies.ts';
import {
  ARROW_PART,
  FORCE_ARROW_FAR_DISTANCE,
  FORCE_ARROW_FAR_GROWTH,
  FORCE_ARROW_FIT_DISTANCE,
  FORCE_ARROW_HEAD_SHARE,
  FORCE_ARROW_PX,
  INSTANCES_PER_PLANET,
  VELOCITY_DASHES,
  arrowFit,
  createForceArrows,
  patchForceArrows,
  type PlanetMotion,
} from '@render/forceArrows.ts';
import { forceArrowLength, velocityArrowLength } from '@sim/gravity.ts';
import { distanceToScene } from '@sim/scale.ts';

const PLANETS = bodies.filter((def) => def.type === 'planet');
const HEIGHT_PX = 800;

function setup(days = 0) {
  const view = createBodies(bodies);
  createBodyAnimator(bodies, view.meshes).update(days);
  const arrows = createForceArrows(bodies, view.meshes, view.radii);
  const scene = new Scene();
  scene.add(view.group, arrows.group);
  const camera = new PerspectiveCamera(45, 1.5, 0.1, 2000);
  camera.position.set(0, 120, 60);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { view, arrows, scene, camera };
}

type Arrows = ReturnType<typeof setup>['arrows'];

function instance(planetId: string, part: number): number {
  const planet = PLANETS.findIndex((def) => def.id === planetId);
  expect(planet).toBeGreaterThanOrEqual(0);
  return planet * INSTANCES_PER_PLANET + part;
}

type Placed = { start: Vector3; axis: Vector3; scale: Vector3 };

function placed(mesh: InstancedMesh, index: number): Placed {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const start = new Vector3();
  const turn = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(start, turn, scale);
  const axis = new Vector3(0, 1, 0).applyQuaternion(turn);
  return { start, axis, scale };
}

// A hidden instance has a zero matrix (decompose cannot read a zero scale).
function isHidden(mesh: InstancedMesh, index: number): boolean {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix.elements.slice(0, 12).every((value) => value === 0);
}

function motionOf(arrows: Arrows, id: string): PlanetMotion {
  const out = { accelerationMs2: 0, speedKms: 0 };
  expect(arrows.readMotion(id, out)).toBe(true);
  return out;
}

function meshOf(view: ReturnType<typeof setup>['view'], id: string) {
  const mesh = view.meshes.get(id);
  if (mesh === undefined) {
    throw new Error(`missing mesh ${id}`);
  }
  return mesh;
}

test('forceArrows › one instanced mesh, one draw call, hidden at the start', () => {
  const { arrows } = setup();
  expect(arrows.isVisible()).toBe(false);
  expect(arrows.group.children).toEqual([arrows.mesh]);
  expect(arrows.mesh.count).toBe(PLANETS.length * INSTANCES_PER_PLANET);
  expect(INSTANCES_PER_PLANET).toBe(3 + VELOCITY_DASHES);
  expect(arrows.mesh.frustumCulled).toBe(false);
  expect(arrows.mesh.material).toMatchObject({ forceSinglePass: true });
  for (let index = 0; index < arrows.mesh.count; index += 1) {
    expect(isHidden(arrows.mesh, index)).toBe(true);
  }
});

test('forceArrows › force and velocity differ in color and shaft shape', () => {
  const { arrows } = setup();
  const color = new Color();
  const colorOf = (part: number): string => {
    arrows.mesh.getColorAt(instance('earth', part), color);
    return `#${color.getHexString()}`;
  };
  expect(colorOf(ARROW_PART.forceShaft)).toBe(VIEW_CONFIG.forceArrowColor);
  expect(colorOf(ARROW_PART.forceHead)).toBe(VIEW_CONFIG.forceArrowColor);
  expect(colorOf(ARROW_PART.velocityHead)).toBe(VIEW_CONFIG.velocityArrowColor);
  for (let dash = 0; dash < VELOCITY_DASHES; dash += 1) {
    expect(colorOf(ARROW_PART.velocityDash + dash)).toBe(
      VIEW_CONFIG.velocityArrowColor,
    );
  }
  // Only the heads are narrowed to a point.
  const taper = arrows.mesh.geometry.getAttribute('aTaper');
  const tapers = Array.from({ length: INSTANCES_PER_PLANET }, (_, part) =>
    taper.getX(instance('mars', part)),
  );
  expect(tapers).toEqual([0, 1, 1, ...Array<number>(VELOCITY_DASHES).fill(0)]);
});

test('forceArrows › the shader narrows the heads', () => {
  const shader = {
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
    uniforms: {},
  };
  patchForceArrows(shader as never);
  expect(shader.vertexShader).toContain('attribute float aTaper;');
  expect(shader.vertexShader).toContain(
    'transformed.xz *= 1.0 - aTaper * position.y;',
  );
  expect(() => {
    patchForceArrows({
      vertexShader: 'void main() {}',
      fragmentShader: '',
      uniforms: {},
    } as never);
  }).toThrow('begin_vertex');
});

test('forceArrows › nothing moves and nothing is read while hidden', () => {
  const { arrows, camera } = setup();
  arrows.update(0, camera, HEIGHT_PX);
  expect(isHidden(arrows.mesh, 0)).toBe(true);
  expect(arrows.readMotion('earth', { accelerationMs2: 0, speedKms: 0 })).toBe(
    false,
  );
});

test('forceArrows › the force arrow points at the Sun from the planet surface', () => {
  const { arrows, camera, view } = setup(123);
  arrows.setVisible(true);
  arrows.update(123, camera, HEIGHT_PX);
  for (const def of PLANETS) {
    const mesh = meshOf(view, def.id);
    const radius = view.radii.get(def.id) ?? Number.NaN;
    const toSun = mesh.position.clone().negate().normalize();
    const shaft = placed(arrows.mesh, instance(def.id, ARROW_PART.forceShaft));
    const head = placed(arrows.mesh, instance(def.id, ARROW_PART.forceHead));
    expect(shaft.axis.dot(toSun)).toBeCloseTo(1, 6);
    expect(head.axis.dot(toSun)).toBeCloseTo(1, 6);
    expect(shaft.start.distanceTo(mesh.position)).toBeCloseTo(radius, 4);
    // Shaft and head are the compressed force, times the camera factor.
    const length =
      arrowFit(camera.position.distanceTo(mesh.position)) *
      forceArrowLength(motionOf(arrows, def.id).accelerationMs2);
    expect(shaft.scale.y + head.scale.y).toBeCloseTo(length, 4);
    expect(head.scale.y).toBeLessThanOrEqual(
      FORCE_ARROW_HEAD_SHARE * length + 1e-6,
    );
    expect(head.start.distanceTo(shaft.start)).toBeCloseTo(shaft.scale.y, 4);
  }
});

test('forceArrows › the dashed velocity arrow runs along the orbit', () => {
  const { arrows, camera, view } = setup(0);
  const later = createBodies(bodies);
  createBodyAnimator(bodies, later.meshes).update(0.5);
  arrows.setVisible(true);
  arrows.update(0, camera, HEIGHT_PX);
  for (const def of PLANETS) {
    const now = meshOf(view, def.id).position;
    const along = meshOf(later, def.id).position.clone().sub(now).normalize();
    const head = placed(arrows.mesh, instance(def.id, ARROW_PART.velocityHead));
    expect(head.axis.dot(along)).toBeGreaterThan(0.9999);
    const length =
      arrowFit(camera.position.distanceTo(now)) *
      velocityArrowLength(motionOf(arrows, def.id).speedKms);
    const radius = view.radii.get(def.id) ?? Number.NaN;
    // The head ends at the arrow length from the planet surface.
    const tip = head.start.clone().addScaledVector(head.axis, head.scale.y);
    expect(tip.distanceTo(now)).toBeCloseTo(radius + length, 3);
    // Dashes in order, with gaps, the last one touching the head.
    let previousEnd = radius;
    for (let dash = 0; dash < VELOCITY_DASHES; dash += 1) {
      const piece = placed(
        arrows.mesh,
        instance(def.id, ARROW_PART.velocityDash + dash),
      );
      expect(piece.axis.dot(along)).toBeGreaterThan(0.9999);
      const from = piece.start.distanceTo(now);
      expect(from).toBeGreaterThan(previousEnd);
      previousEnd = from + piece.scale.y;
    }
    expect(previousEnd).toBeCloseTo(head.start.distanceTo(now), 3);
  }
  later.dispose();
});

test('forceArrows › the width is set in screen pixels', () => {
  const { arrows, camera, view } = setup();
  arrows.setVisible(true);
  arrows.update(0, camera, HEIGHT_PX);
  const mesh = meshOf(view, 'jupiter');
  const index = instance('jupiter', ARROW_PART.forceShaft);
  const perPixel =
    (camera.position.distanceTo(mesh.position) *
      2 *
      Math.tan((45 * Math.PI) / 360)) /
    HEIGHT_PX;
  const far = placed(arrows.mesh, index).scale.x;
  expect(far).toBeCloseTo(FORCE_ARROW_PX.shaft * perPixel, 6);
  // Twice as close: half as wide in the scene, as wide on the screen.
  camera.position.lerp(mesh.position, 0.5);
  camera.updateMatrixWorld();
  arrows.update(0, camera, HEIGHT_PX);
  expect(placed(arrows.mesh, index).scale.x / far).toBeCloseTo(0.5, 6);
});

test('forceArrows › close to the camera an arrow shrinks with the distance', () => {
  const { arrows, camera, view } = setup();
  arrows.setVisible(true);
  const mesh = meshOf(view, 'mars');
  const distance = FORCE_ARROW_FIT_DISTANCE / 4;
  camera.position.copy(mesh.position).add(new Vector3(0, distance, 0));
  camera.lookAt(mesh.position);
  camera.updateMatrixWorld();
  arrows.update(0, camera, HEIGHT_PX);
  const shaft = placed(arrows.mesh, instance('mars', ARROW_PART.forceShaft));
  const head = placed(arrows.mesh, instance('mars', ARROW_PART.forceHead));
  const length = forceArrowLength(motionOf(arrows, 'mars').accelerationMs2);
  expect(shaft.scale.y + head.scale.y).toBeCloseTo(length / 4, 4);
  // Saturn stays far: its arrow keeps its own factor.
  const saturnShaft = placed(
    arrows.mesh,
    instance('saturn', ARROW_PART.forceShaft),
  );
  const saturnHead = placed(
    arrows.mesh,
    instance('saturn', ARROW_PART.forceHead),
  );
  expect(saturnShaft.scale.y + saturnHead.scale.y).toBeCloseTo(
    arrowFit(camera.position.distanceTo(meshOf(view, 'saturn').position)) *
      forceArrowLength(motionOf(arrows, 'saturn').accelerationMs2),
    4,
  );
});

test('forceArrows › arrows go out with a faded planet', () => {
  const { arrows, camera, view } = setup();
  arrows.setVisible(true);
  meshOf(view, 'earth').visible = false;
  arrows.update(0, camera, HEIGHT_PX);
  for (let part = 0; part < INSTANCES_PER_PLANET; part += 1) {
    expect(isHidden(arrows.mesh, instance('earth', part))).toBe(true);
    expect(isHidden(arrows.mesh, instance('mars', part))).toBe(false);
  }
  // The card still gets the values.
  expect(motionOf(arrows, 'earth').speedKms).toBeGreaterThan(29);
});

test('forceArrows › paused time keeps the arrows where they are', () => {
  const { arrows, camera } = setup();
  arrows.setVisible(true);
  arrows.update(10, camera, HEIGHT_PX);
  const index = instance('earth', ARROW_PART.velocityHead);
  const before = placed(arrows.mesh, index);
  arrows.update(10, camera, HEIGHT_PX);
  const after = placed(arrows.mesh, index);
  expect(after.start.equals(before.start)).toBe(true);
  expect(after.axis.equals(before.axis)).toBe(true);
});

test('forceArrows › readMotion gives physical values', () => {
  const { arrows, camera } = setup();
  arrows.setVisible(true);
  arrows.update(0, camera, HEIGHT_PX);
  const earth = motionOf(arrows, 'earth');
  expect(earth.accelerationMs2).toBeGreaterThan(5.6e-3);
  expect(earth.accelerationMs2).toBeLessThan(6.2e-3);
  expect(earth.speedKms).toBeCloseTo(30, 0);
  const none = { accelerationMs2: 0, speedKms: 0 };
  expect(arrows.readMotion('moon', none)).toBe(false);
  expect(arrows.readMotion('sun', none)).toBe(false);
  arrows.setVisible(false);
  expect(arrows.readMotion('earth', none)).toBe(false);
  arrows.setVisible(true);
  // Shown again: no values until the next update.
  expect(arrows.readMotion('earth', none)).toBe(false);
});

test('forceArrows › a zero-size viewport hides the arrows', () => {
  const { arrows, camera } = setup();
  arrows.setVisible(true);
  arrows.update(0, camera, 0);
  expect(isHidden(arrows.mesh, 0)).toBe(true);
});

test('forceArrows › clicks go through the arrows', () => {
  const { arrows, camera } = setup();
  arrows.setVisible(true);
  arrows.update(0, camera, HEIGHT_PX);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(0, 0), camera);
  expect(raycaster.intersectObject(arrows.group, true)).toEqual([]);
});

test('forceArrows › dispose removes the group and is idempotent', () => {
  const { arrows, scene, camera } = setup();
  arrows.dispose();
  expect(arrows.group.parent).toBeNull();
  expect(scene.children.includes(arrows.group)).toBe(false);
  arrows.dispose();
  arrows.setVisible(true);
  expect(arrows.isVisible()).toBe(false);
  arrows.update(0, camera, HEIGHT_PX);
  expect(arrows.readMotion('earth', { accelerationMs2: 0, speedKms: 0 })).toBe(
    false,
  );
});

test('forceArrows › needs the star mass and planet meshes', () => {
  const view = createBodies(bodies);
  const noMass = bodies.map((def) =>
    def.type === 'star' ? { ...def, mass: undefined } : def,
  );
  expect(() => createForceArrows(noMass, view.meshes, view.radii)).toThrow(
    'star has no mass',
  );
  const meshes = new Map(view.meshes);
  meshes.delete('mars');
  expect(() => createForceArrows(bodies, meshes, view.radii)).toThrow('mars');
});

test('arrowFit › shrinks close up, grows far away, one factor for the system', () => {
  expect(arrowFit(0)).toBe(0);
  expect(arrowFit(FORCE_ARROW_FIT_DISTANCE / 2)).toBeCloseTo(0.5, 12);
  expect(arrowFit(FORCE_ARROW_FIT_DISTANCE)).toBe(1);
  expect(arrowFit(FORCE_ARROW_FAR_DISTANCE)).toBe(1);
  expect(arrowFit(FORCE_ARROW_FAR_DISTANCE * 1.25)).toBeCloseTo(1.25, 12);
  expect(arrowFit(1e6)).toBe(FORCE_ARROW_FAR_GROWTH);
  let last = 0;
  for (let distance = 0; distance < 400; distance += 0.5) {
    const fit = arrowFit(distance);
    expect(fit).toBeGreaterThanOrEqual(last);
    last = fit;
  }
});

test('forceArrows › in the start view every planet shares the full growth', () => {
  const { arrows, camera, view } = setup();
  // The start view frames the system from about 120 scene units, so even
  // a planet on the near side of the farthest orbit is past the full growth.
  arrows.setVisible(true);
  arrows.update(0, camera, HEIGHT_PX);
  expect(FORCE_ARROW_FAR_DISTANCE * FORCE_ARROW_FAR_GROWTH).toBeLessThan(
    Math.hypot(75, 95) - distanceToScene(31),
  );
  for (const def of PLANETS) {
    const shaft = placed(arrows.mesh, instance(def.id, ARROW_PART.forceShaft));
    const head = placed(arrows.mesh, instance(def.id, ARROW_PART.forceHead));
    expect(shaft.scale.y + head.scale.y).toBeCloseTo(
      FORCE_ARROW_FAR_GROWTH *
        forceArrowLength(motionOf(arrows, def.id).accelerationMs2),
      4,
    );
  }
  expect(meshOf(view, 'earth').visible).toBe(true);
});
