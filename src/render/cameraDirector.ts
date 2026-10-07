import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  cancelFlight,
  computeGoalPose,
  createFlight,
  isFlightActive,
  startFlight,
  stepFlight,
  type FlightKind,
} from '@core/cameraFlight.ts';
import {
  blendPose,
  easeInOutCubic,
  flightProgress,
  type CameraPose,
} from '@core/cameraMath.ts';
import type { Selection, SelectionEvent } from '@core/selection.ts';
import type {
  CameraController,
  CameraControllerState,
} from './cameraController.ts';

export type DirectorBody = {
  id: string;
  object: {
    position: { x: number; y: number; z: number };
  };
  displayRadius: number;
  isSun: boolean;
};

/** Numbers only, for the debug hook. `kind`: 0 none, 1 body, 2 system. */
export type CameraFlightSnapshot = {
  active: number;
  kind: number;
  progress: number;
};

export type CameraDirector = {
  update(dtSeconds: number): void;
  getFlightState(out: CameraFlightSnapshot): CameraFlightSnapshot;
  dispose(): void;
};

export type CameraDirectorOptions = {
  controller: CameraController;
  selection: Selection;
  bodies: readonly DirectorBody[];
  reducedMotion: {
    readonly matches: boolean;
    subscribe(listener: () => void): () => void;
  };
  onJump: () => void;
};

const KIND_NONE = 0;
const KIND_BODY = 1;
const KIND_SYSTEM = 2;
const REBASE_MIN_REMAINING = 1e-4;

function invalidInput(
  functionName: string,
  parameter: string,
  requirement: string,
  value: number,
): RangeError {
  return new RangeError(
    `${functionName}: parameter "${parameter}" ${requirement}, got ${value}`,
  );
}

function requireFiniteAtLeastZero(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidInput(
      functionName,
      parameter,
      'must be finite and >= 0',
      value,
    );
  }
}

function createPose(): CameraPose {
  return {
    azimuth: 0,
    polar: 0,
    distance: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
}

export function createCameraDirector(
  options: CameraDirectorOptions,
): CameraDirector {
  const controller = options.controller;
  const selection = options.selection;
  const bodies = options.bodies;
  const reducedMotion = options.reducedMotion;
  const onJump = options.onJump;

  for (let index = 0; index < selection.ids.length; index += 1) {
    const id = selection.ids[index];
    if (id === undefined || findBody(id) === null) {
      throw new RangeError(
        `createCameraDirector: parameter "bodies" must contain every selectable body id, got missing "${id}"`,
      );
    }
  }

  const flight = createFlight();
  const livePose = createPose();
  const goalPose = createPose();
  const blended = createPose();
  const controllerState: CameraControllerState = {
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };

  let flightBody: DirectorBody | null = null;
  let followBody: DirectorBody | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;
  let lastWrittenDistance = 0;
  let reportedActive = 0;
  let reportedKind = KIND_NONE;
  let reportedProgress = 0;
  let disposed = false;

  const unsubscribeSelection = selection.subscribe(onSelection);
  const unsubscribeMotion = reducedMotion.subscribe(onReducedMotionChange);
  const unsubscribeInput = controller.onUserInput(onUserInput);

  return {
    update(dtSeconds: number): void {
      if (disposed) {
        return;
      }

      requireFiniteAtLeastZero('update', 'dtSeconds', dtSeconds);
      if (!isFlightActive(flight)) {
        trackFollow();
        return;
      }

      const kind = flight.kind;
      if (kind === 'none') {
        return;
      }

      rebaseDistance(kind);
      const eased = stepFlight(flight, dtSeconds);
      writeGoal(goalPose, kind, flight.from, goalBody(kind));
      blendPose(blended, flight.from, goalPose, eased);
      controller.setPose(blended);
      controller.getPose(livePose);
      lastWrittenDistance = livePose.distance;

      if (isFlightActive(flight)) {
        publishActive(kind === 'body' ? KIND_BODY : KIND_SYSTEM, eased);
        return;
      }

      finishFlight(kind);
    },
    getFlightState(out: CameraFlightSnapshot): CameraFlightSnapshot {
      out.active = reportedActive;
      out.kind = reportedKind;
      out.progress = reportedProgress;
      return out;
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      unsubscribeSelection();
      unsubscribeMotion();
      unsubscribeInput();
      cancelFlight(flight);
      flightBody = null;
      followBody = null;
      publishInactive();
    },
  };

  function onSelection(event: SelectionEvent): void {
    if (disposed || event.kind === 'hover') {
      return;
    }

    if (event.kind === 'selected') {
      focusBody(event.id);
      return;
    }

    focusSystem();
  }

  function focusBody(id: string): void {
    const body = findBody(id);
    if (body === null) {
      return;
    }

    controller.setLimitsForBody(body.displayRadius);
    controller.getPose(livePose);
    followBody = null;
    flightBody = body;
    if (reducedMotion.matches) {
      jumpToGoal('body');
      return;
    }

    beginFlight('body', CAMERA_CONFIG.flightToBodySeconds);
  }

  function focusSystem(): void {
    controller.setLimitsForBody(null);
    controller.getPose(livePose);
    followBody = null;
    flightBody = null;
    if (reducedMotion.matches) {
      jumpToGoal('system');
      return;
    }

    beginFlight('system', CAMERA_CONFIG.flightToSystemSeconds);
  }

  function beginFlight(kind: 'body' | 'system', durationSeconds: number): void {
    startFlight(flight, livePose, kind, durationSeconds);
    lastWrittenDistance = livePose.distance;
    publishActive(kind === 'body' ? KIND_BODY : KIND_SYSTEM, 0);
  }

  function jumpToGoal(kind: 'body' | 'system'): void {
    writeGoal(goalPose, kind, livePose, goalBody(kind));
    controller.setPose(goalPose);
    if (kind === 'body' && flightBody !== null) {
      followBody = flightBody;
      offsetX = 0;
      offsetY = 0;
      offsetZ = 0;
    } else {
      followBody = null;
    }
    flightBody = null;
    cancelFlight(flight);
    publishInactive();
    onJump();
  }

  function onReducedMotionChange(): void {
    if (disposed || !isFlightActive(flight)) {
      return;
    }

    if (reducedMotion.matches) {
      const kind = flight.kind;
      if (kind === 'none') {
        return;
      }
      controller.getPose(livePose);
      jumpToGoal(kind);
      return;
    }

    holdPosition();
  }

  function onUserInput(): void {
    if (disposed || !isFlightActive(flight)) {
      return;
    }

    holdPosition();
  }

  function holdPosition(): void {
    const kind = flight.kind;
    if (kind === 'body' && flightBody !== null) {
      rememberOffset(flightBody);
      followBody = flightBody;
    } else {
      followBody = null;
    }
    flightBody = null;
    cancelFlight(flight);
    publishInactive();
  }

  function finishFlight(kind: 'body' | 'system'): void {
    if (kind === 'body' && flightBody !== null) {
      followBody = flightBody;
      offsetX = 0;
      offsetY = 0;
      offsetZ = 0;
    } else {
      followBody = null;
    }
    flightBody = null;
    publishInactive();
  }

  function trackFollow(): void {
    if (followBody === null) {
      return;
    }

    const position = followBody.object.position;
    controller.setTarget(
      position.x + offsetX,
      position.y + offsetY,
      position.z + offsetZ,
    );
  }

  function rememberOffset(body: DirectorBody): void {
    controller.getPose(livePose);
    const position = body.object.position;
    offsetX = livePose.targetX - position.x;
    offsetY = livePose.targetY - position.y;
    offsetZ = livePose.targetZ - position.z;
  }

  function rebaseDistance(kind: 'body' | 'system'): void {
    controller.getPose(livePose);
    if (livePose.distance === lastWrittenDistance) {
      return;
    }

    const linear = flightProgress(flight.elapsed, flight.duration);
    const eased = easeInOutCubic(linear);
    if (eased >= 1 || 1 - eased < REBASE_MIN_REMAINING) {
      return;
    }

    writeGoal(goalPose, kind, flight.from, goalBody(kind));
    flight.from.distance =
      (livePose.distance - goalPose.distance * eased) / (1 - eased);
  }

  function goalBody(kind: FlightKind): DirectorBody | null {
    return kind === 'body' ? flightBody : null;
  }

  function writeGoal(
    out: CameraPose,
    kind: 'body' | 'system',
    azimuthSource: CameraPose,
    body: DirectorBody | null,
  ): void {
    const x = body === null ? 0 : body.object.position.x;
    const y = body === null ? 0 : body.object.position.y;
    const z = body === null ? 0 : body.object.position.z;
    const radius = body === null ? 1 : body.displayRadius;
    const isSun = body !== null && body.isSun;
    computeGoalPose(out, kind, x, y, z, radius, isSun, azimuthSource, 1);
    if (kind === 'system') {
      // `setAspect` recomputes limits. Max is 1.5× the live start distance.
      controller.getState(controllerState);
      out.distance =
        controllerState.distanceMax / CAMERA_CONFIG.systemZoomMaxFactor;
    }
  }

  function publishActive(kind: number, progress: number): void {
    reportedActive = 1;
    reportedKind = kind;
    reportedProgress = progress;
  }

  function publishInactive(): void {
    reportedActive = 0;
    reportedKind = KIND_NONE;
    reportedProgress = 0;
  }

  function findBody(id: string): DirectorBody | null {
    for (let index = 0; index < bodies.length; index += 1) {
      const body = bodies[index];
      if (body !== undefined && body.id === id) {
        return body;
      }
    }
    return null;
  }
}
