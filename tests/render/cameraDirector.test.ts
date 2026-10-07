import { PerspectiveCamera } from 'three';
import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { startDistance, type CameraPose } from '@core/cameraMath.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import {
  createCameraController,
  type CameraController,
  type CameraControllerState,
  type ReducedMotionSource,
} from '@render/cameraController.ts';
import {
  createCameraDirector,
  type CameraDirector,
  type CameraFlightSnapshot,
  type DirectorBody,
} from '@render/cameraDirector.ts';

const FRAME_SECONDS = 1 / 60;
const ASPECT = 16 / 9;

type FakeMotion = ReducedMotionSource & {
  setMatches(matches: boolean): void;
  emit(): void;
};

type Rig = {
  camera: PerspectiveCamera;
  controller: CameraController;
  selection: Selection;
  director: CameraDirector;
  motion: FakeMotion;
  mars: DirectorBody;
  jupiter: DirectorBody;
  sun: DirectorBody;
  jumps: { count: number };
  aspect: number;
};

function fakeMotion(matches = false): FakeMotion {
  let current = matches;
  const listeners: Array<() => void> = [];
  return {
    get matches() {
      return current;
    },
    setMatches(next: boolean) {
      current = next;
      this.emit();
    },
    emit() {
      for (let index = 0; index < listeners.length; index += 1) {
        listeners[index]?.();
      }
    },
    subscribe(listener: () => void) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
  };
}

function movingBody(
  id: string,
  x: number,
  y: number,
  z: number,
  displayRadius: number,
  isSun: boolean,
): DirectorBody {
  return {
    id,
    object: { position: { x, y, z } },
    displayRadius,
    isSun,
  };
}

function setup(matches = false, aspect = ASPECT): Rig {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 2000);
  const motion = fakeMotion(matches);
  const controller = createCameraController({
    camera,
    reducedMotion: motion,
  });
  const sun = movingBody('sun', 0, 0, 0, 4, true);
  const mars = movingBody('mars', 30, 0, 12, 1.2, false);
  const jupiter = movingBody('jupiter', -40, 6, 18, 2, false);
  const selection = createSelection(['sun', 'mars', 'jupiter']);
  const jumps = { count: 0 };
  const director = createCameraDirector({
    controller,
    selection,
    bodies: [sun, mars, jupiter],
    reducedMotion: motion,
    onJump() {
      jumps.count += 1;
    },
  });
  return {
    camera,
    controller,
    selection,
    director,
    motion,
    mars,
    jupiter,
    sun,
    jumps,
    aspect,
  };
}

function readPose(controller: CameraController): CameraPose {
  return controller.getPose({
    azimuth: 0,
    polar: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
}

function readState(controller: CameraController): CameraControllerState {
  return controller.getState({
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
}

function snapshot(director: CameraDirector): CameraFlightSnapshot {
  return director.getFlightState({ active: -1, kind: -1, progress: -1 });
}

function mark(camera: PerspectiveCamera): { x: number; y: number; z: number } {
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
}

function span(
  camera: PerspectiveCamera,
  from: { x: number; y: number; z: number },
): number {
  return Math.hypot(
    camera.position.x - from.x,
    camera.position.y - from.y,
    camera.position.z - from.z,
  );
}

function expectFinitePose(pose: CameraPose): void {
  expect(Number.isFinite(pose.azimuth)).toBe(true);
  expect(Number.isFinite(pose.polar)).toBe(true);
  expect(Number.isFinite(pose.distance)).toBe(true);
  expect(Number.isFinite(pose.targetX)).toBe(true);
  expect(Number.isFinite(pose.targetY)).toBe(true);
  expect(Number.isFinite(pose.targetZ)).toBe(true);
}

function expectTarget(
  controller: CameraController,
  body: DirectorBody,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): void {
  const pose = readPose(controller);
  const position = body.object.position;
  expect(pose.targetX).toBeCloseTo(position.x + offsetX, 8);
  expect(pose.targetY).toBeCloseTo(position.y + offsetY, 8);
  expect(pose.targetZ).toBeCloseTo(position.z + offsetZ, 8);
}

function updateFrames(rig: Rig, frames: number, before?: () => void): number {
  let maxJump = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    before?.();
    const previous = mark(rig.camera);
    rig.director.update(FRAME_SECONDS);
    maxJump = Math.max(maxJump, span(rig.camera, previous));
    expectFinitePose(readPose(rig.controller));
  }
  return maxJump;
}

function finishFlight(rig: Rig, cap = 240): number {
  let frames = 0;
  let maxJump = 0;
  while (snapshot(rig.director).active === 1 && frames < cap) {
    const previous = mark(rig.camera);
    rig.director.update(FRAME_SECONDS);
    maxJump = Math.max(maxJump, span(rig.camera, previous));
    expectFinitePose(readPose(rig.controller));
    frames += 1;
  }
  return maxJump;
}

test('tracks moving body', () => {
  const rig = setup();
  const startPolar = readPose(rig.controller).polar;
  rig.selection.select('mars');
  for (let frame = 0; frame < 72; frame += 1) {
    rig.mars.object.position.x += 0.25;
    rig.mars.object.position.z -= 0.1;
    rig.director.update(FRAME_SECONDS);
  }
  expect(snapshot(rig.director).active).toBe(0);
  expectTarget(rig.controller, rig.mars);
  const arrived = readPose(rig.controller);
  expect(arrived.distance).toBeCloseTo(
    rig.mars.displayRadius * CAMERA_CONFIG.bodyDistanceRadiusFactor,
    8,
  );
  expect(arrived.polar).toBeCloseTo(startPolar, 8);

  for (let frame = 0; frame < 120; frame += 1) {
    rig.mars.object.position.x += 0.25;
    rig.mars.object.position.y -= 0.05;
    rig.director.update(FRAME_SECONDS);
    expectTarget(rig.controller, rig.mars);
    expect(snapshot(rig.director).active).toBe(0);
  }
});

test('flight with zero and negative time speed', () => {
  const pause = setup();
  pause.selection.select('mars');
  pause.director.update(0);
  expectFinitePose(readPose(pause.controller));
  expect(snapshot(pause.director).active).toBe(1);
  pause.director.update(0.1);
  expectFinitePose(readPose(pause.controller));
  expect(Number.isFinite(pause.camera.position.x)).toBe(true);
  expect(Number.isFinite(pause.camera.position.y)).toBe(true);
  expect(Number.isFinite(pause.camera.position.z)).toBe(true);
  for (let frame = 0; frame < 11; frame += 1) {
    pause.director.update(0.1);
  }
  expect(snapshot(pause.director).active).toBe(0);
  expectTarget(pause.controller, pause.mars);
  expectFinitePose(readPose(pause.controller));

  const directions = [0, 1, -1];
  const progress: number[][] = [[], [], []];
  const rigs: Rig[] = [];
  for (let index = 0; index < directions.length; index += 1) {
    const rig = setup();
    rig.selection.select('mars');
    rigs.push(rig);
  }
  for (let frame = 0; frame < 72; frame += 1) {
    for (let index = 0; index < rigs.length; index += 1) {
      const rig = rigs[index];
      const direction = directions[index];
      if (rig === undefined || direction === undefined) {
        continue;
      }
      rig.mars.object.position.x += direction;
      rig.mars.object.position.z += direction * 0.25;
      rig.director.update(FRAME_SECONDS);
      const state = snapshot(rig.director);
      progress[index]?.push(state.progress);
      expectFinitePose(readPose(rig.controller));
    }
  }
  expect(progress[1]).toEqual(progress[0]);
  expect(progress[2]).toEqual(progress[0]);
  for (let index = 0; index < rigs.length; index += 1) {
    const rig = rigs[index];
    if (rig === undefined) {
      continue;
    }
    expect(snapshot(rig.director).active).toBe(0);
    expectTarget(rig.controller, rig.mars);
    rig.mars.object.position.x -= 3;
    rig.director.update(FRAME_SECONDS);
    expectTarget(rig.controller, rig.mars);
  }
});

test('no jumps between frames', () => {
  const rig = setup();
  const limit = startDistance(rig.aspect) * 0.05;
  rig.selection.select('mars');
  let maxJump = finishFlight(rig);

  const second = setup();
  second.selection.select('mars');
  let worst = 0;
  for (let frame = 0; frame < 18; frame += 1) {
    second.mars.object.position.x += 0.2;
    const previous = mark(second.camera);
    second.director.update(FRAME_SECONDS);
    worst = Math.max(worst, span(second.camera, previous));
  }
  second.selection.select('jupiter');
  worst = Math.max(worst, finishFlight(second));
  maxJump = Math.max(maxJump, worst);
  expect(maxJump).toBeGreaterThan(0);
  expect(maxJump).toBeLessThan(limit);
  expect(snapshot(second.director).active).toBe(0);
  expectTarget(second.controller, second.jupiter);
});

test('second select restarts from current pose', () => {
  const rig = setup();
  rig.selection.select('mars');
  updateFrames(rig, 54, () => {
    rig.mars.object.position.x += 0.1;
  });
  const atSelect = readPose(rig.controller);
  const cameraAtSelect = mark(rig.camera);
  rig.selection.select('jupiter');
  expect(readPose(rig.controller).distance).toBeCloseTo(atSelect.distance, 8);
  expect(readPose(rig.controller).targetX).toBeCloseTo(atSelect.targetX, 8);
  expect(snapshot(rig.director).kind).toBe(1);
  rig.director.update(0);
  const stayed = readPose(rig.controller);
  expect(stayed.distance).toBeCloseTo(atSelect.distance, 6);
  expect(stayed.targetX).toBeCloseTo(atSelect.targetX, 6);
  expect(stayed.targetY).toBeCloseTo(atSelect.targetY, 6);
  expect(stayed.targetZ).toBeCloseTo(atSelect.targetZ, 6);
  expect(stayed.azimuth).toBeCloseTo(atSelect.azimuth, 6);
  expect(stayed.polar).toBeCloseTo(atSelect.polar, 6);
  expect(span(rig.camera, cameraAtSelect)).toBeLessThan(1e-4);
  expect(snapshot(rig.director).active).toBe(1);
  finishFlight(rig);
  expectTarget(rig.controller, rig.jupiter);
  expect(readPose(rig.controller).distance).toBeCloseTo(
    rig.jupiter.displayRadius * CAMERA_CONFIG.bodyDistanceRadiusFactor,
    6,
  );
});

test('showSystem during flight', () => {
  const rig = setup();
  rig.controller.rotateBy(0.35, 0.2, false, false);
  rig.selection.select('mars');
  updateFrames(rig, 18);
  const atReturn = readPose(rig.controller);
  const cameraAtReturn = mark(rig.camera);
  rig.selection.showSystem();
  expect(readPose(rig.controller).azimuth).toBeCloseTo(atReturn.azimuth, 8);
  expect(snapshot(rig.director).active).toBe(1);
  expect(snapshot(rig.director).kind).toBe(2);
  rig.director.update(0);
  expect(span(rig.camera, cameraAtReturn)).toBeLessThan(1e-4);
  expect(readPose(rig.controller).distance).toBeCloseTo(atReturn.distance, 6);
  for (let frame = 0; frame < 59; frame += 1) {
    rig.director.update(FRAME_SECONDS);
  }
  expect(snapshot(rig.director).active).toBe(1);
  rig.director.update(FRAME_SECONDS);
  expect(snapshot(rig.director).active).toBe(0);
  const ended = readPose(rig.controller);
  expect(ended.targetX).toBeCloseTo(0, 8);
  expect(ended.targetY).toBeCloseTo(0, 8);
  expect(ended.targetZ).toBeCloseTo(0, 8);
  expect(ended.distance).toBeCloseTo(startDistance(rig.aspect), 6);
  expect(ended.polar).toBeCloseTo(
    (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180,
    6,
  );
  expect(ended.azimuth).toBeCloseTo(atReturn.azimuth, 6);

  const idle = setup();
  idle.controller.rotateBy(-0.4, 0.15, false, false);
  idle.controller.zoomBy(0.7, false, false);
  const azimuth = readPose(idle.controller).azimuth;
  idle.selection.showSystem();
  finishFlight(idle);
  const home = readPose(idle.controller);
  expect(home.targetX).toBeCloseTo(0, 8);
  expect(home.distance).toBeCloseTo(startDistance(idle.aspect), 6);
  expect(home.polar).toBeCloseTo(
    (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180,
    6,
  );
  expect(home.azimuth).toBeCloseTo(azimuth, 6);
});

test('limits switch with selection', () => {
  const rig = setup();
  const start = startDistance(rig.aspect);
  rig.selection.select('mars');
  let state = readState(rig.controller);
  expect(state.distanceMin).toBeCloseTo(
    CAMERA_CONFIG.bodyZoomMinRadiusFactor * rig.mars.displayRadius,
    8,
  );
  expect(state.distanceMax).toBeCloseTo(start, 8);
  rig.selection.showSystem();
  state = readState(rig.controller);
  expect(state.distanceMin).toBeCloseTo(
    CAMERA_CONFIG.systemZoomMinFactor * start,
    8,
  );
  expect(state.distanceMax).toBeCloseTo(
    CAMERA_CONFIG.systemZoomMaxFactor * start,
    8,
  );
});

test('user input interrupts flight', () => {
  const rig = setup();
  rig.selection.select('mars');
  updateFrames(rig, 20, () => {
    rig.mars.object.position.x += 0.15;
  });
  const before = readPose(rig.controller);
  const offsetX = before.targetX - rig.mars.object.position.x;
  const offsetY = before.targetY - rig.mars.object.position.y;
  const offsetZ = before.targetZ - rig.mars.object.position.z;
  rig.controller.notifyUserInput();
  expect(snapshot(rig.director).active).toBe(0);
  expect(rig.selection.getSelectedId()).toBe('mars');
  expect(readPose(rig.controller).distance).toBeCloseTo(before.distance, 8);
  rig.mars.object.position.x += 4;
  rig.mars.object.position.y += 0.5;
  rig.director.update(FRAME_SECONDS);
  expectTarget(rig.controller, rig.mars, offsetX, offsetY, offsetZ);
  const limits = readState(rig.controller);
  expect(limits.distanceMax).toBeCloseTo(startDistance(rig.aspect), 8);

  const spun = setup();
  spun.selection.select('jupiter');
  updateFrames(spun, 12);
  spun.controller.rotateBy(0.25, 0, false);
  expect(snapshot(spun.director).active).toBe(0);
  expect(spun.selection.getSelectedId()).toBe('jupiter');
  const held = readPose(spun.controller);
  const heldOffsetX = held.targetX - spun.jupiter.object.position.x;
  const heldOffsetY = held.targetY - spun.jupiter.object.position.y;
  const heldOffsetZ = held.targetZ - spun.jupiter.object.position.z;
  spun.jupiter.object.position.x += 2;
  spun.director.update(FRAME_SECONDS);
  expectTarget(
    spun.controller,
    spun.jupiter,
    heldOffsetX,
    heldOffsetY,
    heldOffsetZ,
  );
  expect(readPose(spun.controller).azimuth).toBeCloseTo(held.azimuth, 8);
});

test('tap does not interrupt', () => {
  const rig = setup();
  rig.selection.select('mars');
  expect(snapshot(rig.director).active).toBe(1);
  rig.director.update(0.2);
  const mid = snapshot(rig.director);
  expect(mid.active).toBe(1);
  expect(mid.progress).toBeGreaterThan(0);
  expect(mid.progress).toBeLessThan(1);
  rig.director.update(0.2);
  expect(snapshot(rig.director).active).toBe(1);
  expect(snapshot(rig.director).progress).toBeGreaterThan(mid.progress);
  expect(rig.selection.getSelectedId()).toBe('mars');
});

test('flight from 1.3x start respects soft clamp', () => {
  const rig = setup();
  const start = startDistance(rig.aspect);
  const pose = readPose(rig.controller);
  pose.distance = start * 1.3;
  rig.controller.setPose(pose);
  rig.selection.select('mars');
  const maxJump = finishFlight(rig);
  expect(maxJump).toBeLessThan(start * 0.05);
  expect(readPose(rig.controller).distance).toBeCloseTo(
    rig.mars.displayRadius * CAMERA_CONFIG.bodyDistanceRadiusFactor,
    6,
  );

  const held = setup();
  const heldPose = readPose(held.controller);
  heldPose.distance = start * 1.3;
  held.controller.setPose(heldPose);
  held.selection.select('mars');
  held.director.update(FRAME_SECONDS);
  held.controller.notifyUserInput();
  expect(snapshot(held.director).active).toBe(0);
  expect(held.selection.getSelectedId()).toBe('mars');
  const outside = readPose(held.controller).distance;
  expect(outside).toBeGreaterThan(start);
  held.controller.zoomBy(1.1, false);
  expect(readPose(held.controller).distance).toBe(outside);
  held.controller.zoomBy(0.9, false);
  expect(readPose(held.controller).distance).toBeLessThan(outside);
});

test('reduced motion jumps instantly', () => {
  const rig = setup(true);
  rig.controller.rotateBy(0.4, 0.25, false, false);
  const before = readPose(rig.controller);
  rig.selection.select('mars');
  const jumped = readPose(rig.controller);
  expect(rig.jumps.count).toBe(1);
  expect(snapshot(rig.director).active).toBe(0);
  expect(jumped.azimuth).toBeCloseTo(before.azimuth, 8);
  expect(jumped.polar).toBeCloseTo(before.polar, 8);
  expect(jumped.distance).toBeCloseTo(
    rig.mars.displayRadius * CAMERA_CONFIG.bodyDistanceRadiusFactor,
    8,
  );
  expectTarget(rig.controller, rig.mars);
  rig.mars.object.position.x += 2;
  rig.director.update(FRAME_SECONDS);
  expect(rig.jumps.count).toBe(1);
  expect(snapshot(rig.director).active).toBe(0);
  expectTarget(rig.controller, rig.mars);

  rig.selection.select('sun');
  expect(rig.jumps.count).toBe(2);
  expect(readPose(rig.controller).distance).toBeCloseTo(
    rig.sun.displayRadius * CAMERA_CONFIG.sunDistanceRadiusFactor,
    8,
  );
  expect(readPose(rig.controller).azimuth).toBeCloseTo(before.azimuth, 8);
  expectTarget(rig.controller, rig.sun);

  rig.motion.setMatches(false);
  rig.selection.select('jupiter');
  expect(snapshot(rig.director).active).toBe(1);
  expect(rig.jumps.count).toBe(2);
  rig.director.update(0.25);
  rig.motion.setMatches(true);
  expect(snapshot(rig.director).active).toBe(0);
  expect(rig.jumps.count).toBe(3);
  expectTarget(rig.controller, rig.jupiter);
  expect(readPose(rig.controller).distance).toBeCloseTo(
    rig.jupiter.displayRadius * CAMERA_CONFIG.bodyDistanceRadiusFactor,
    6,
  );

  rig.motion.setMatches(false);
  rig.selection.select('mars');
  rig.director.update(0.3);
  const held = readPose(rig.controller);
  const offsetX = held.targetX - rig.mars.object.position.x;
  rig.motion.emit();
  expect(snapshot(rig.director).active).toBe(0);
  expect(rig.jumps.count).toBe(3);
  expect(readPose(rig.controller).distance).toBeCloseTo(held.distance, 8);
  expect(readPose(rig.controller).targetX).toBeCloseTo(held.targetX, 8);
  rig.mars.object.position.x += 5;
  rig.director.update(FRAME_SECONDS);
  expect(readPose(rig.controller).targetX).toBeCloseTo(
    rig.mars.object.position.x + offsetX,
    8,
  );

  rig.motion.setMatches(true);
  rig.selection.showSystem();
  const home = readPose(rig.controller);
  expect(rig.jumps.count).toBe(4);
  expect(snapshot(rig.director).active).toBe(0);
  expect(home.targetX).toBeCloseTo(0, 8);
  expect(home.targetY).toBeCloseTo(0, 8);
  expect(home.targetZ).toBeCloseTo(0, 8);
  expect(home.distance).toBeCloseTo(startDistance(rig.aspect), 6);
  expect(home.polar).toBeCloseTo(
    (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180,
    6,
  );
  expect(home.azimuth).toBeCloseTo(before.azimuth, 6);
});

test('resize during flight', () => {
  const rig = setup();
  rig.controller.rotateBy(0.3, -0.2, false, false);
  rig.controller.zoomBy(0.75, false, false);
  const azimuth = readPose(rig.controller).azimuth;
  rig.selection.showSystem();
  updateFrames(rig, 20);
  rig.controller.setAspect(9 / 16);
  const afterResize = mark(rig.camera);
  const distanceAfterResize = readPose(rig.controller).distance;
  rig.director.update(0);
  expect(span(rig.camera, afterResize)).toBeLessThan(1e-4);
  expect(readPose(rig.controller).distance).toBeCloseTo(distanceAfterResize, 6);
  finishFlight(rig);
  const ended = readPose(rig.controller);
  expect(ended.distance).toBeCloseTo(startDistance(9 / 16), 6);
  expect(ended.targetX).toBeCloseTo(0, 8);
  expect(ended.targetY).toBeCloseTo(0, 8);
  expect(ended.targetZ).toBeCloseTo(0, 8);
  expect(ended.polar).toBeCloseTo(
    (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180,
    6,
  );
  expect(ended.azimuth).toBeCloseTo(azimuth, 6);
  expect(ended.distance).not.toBeCloseTo(startDistance(ASPECT), 2);
});

test('dispose unsubscribes', () => {
  const rig = setup();
  rig.selection.select('mars');
  rig.director.update(0.2);
  const pose = readPose(rig.controller);
  rig.director.dispose();
  expect(() => rig.director.dispose()).not.toThrow();
  rig.selection.select('jupiter');
  rig.selection.showSystem();
  rig.director.update(0.5);
  rig.controller.notifyUserInput();
  rig.motion.setMatches(true);
  const after = readPose(rig.controller);
  expect(after.distance).toBeCloseTo(pose.distance, 8);
  expect(after.targetX).toBeCloseTo(pose.targetX, 8);
  expect(after.azimuth).toBeCloseTo(pose.azimuth, 8);
  expect(rig.jumps.count).toBe(0);
});

test('missing body', () => {
  const camera = new PerspectiveCamera(45, ASPECT, 0.1, 2000);
  const motion = fakeMotion(false);
  const controller = createCameraController({
    camera,
    reducedMotion: motion,
  });
  const selection = createSelection(['sun', 'mars', 'jupiter']);
  const sun = movingBody('sun', 0, 0, 0, 4, true);
  const jupiter = movingBody('jupiter', -40, 6, 18, 2, false);
  expect(() =>
    createCameraDirector({
      controller,
      selection,
      bodies: [sun, jupiter],
      reducedMotion: motion,
      onJump() {
        return undefined;
      },
    }),
  ).toThrow(RangeError);
  expect(() =>
    createCameraDirector({
      controller,
      selection,
      bodies: [sun, jupiter],
      reducedMotion: motion,
      onJump() {
        return undefined;
      },
    }),
  ).toThrow(
    'createCameraDirector: parameter "bodies" must contain every selectable body id, got missing "mars"',
  );
});

test('update does not allocate', () => {
  const rig = setup();
  rig.selection.select('mars');
  rig.director.update(FRAME_SECONDS);
  rig.director.update(FRAME_SECONDS);
  const originalPush = Array.prototype.push;
  const originalSet = Map.prototype.set;
  let pushes = 0;
  let sets = 0;
  Array.prototype.push = function patched(
    this: unknown[],
    ...items: unknown[]
  ): number {
    pushes += 1;
    return originalPush.apply(this, items);
  };
  Map.prototype.set = function patched(
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown,
  ): Map<unknown, unknown> {
    sets += 1;
    return originalSet.call(this, key, value);
  };
  try {
    for (let call = 0; call < 10000; call += 1) {
      rig.director.update(0);
    }
  } finally {
    Array.prototype.push = originalPush;
    Map.prototype.set = originalSet;
  }
  expect(pushes).toBe(0);
  expect(sets).toBe(0);
  expect(snapshot(rig.director).active).toBe(1);
});
