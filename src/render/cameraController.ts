import type { PerspectiveCamera } from 'three';

import {
  bodyDistanceLimits,
  clampPolar,
  dampingFraction,
  poseToPosition,
  rotatePose,
  setDefaultPose,
  softClampDistance,
  startDistance,
  systemDistanceLimits,
  wrapAzimuth,
  type CameraPose,
  type DistanceLimits,
  type Vec3,
} from '@core/cameraMath.ts';
import type { CameraUserInput } from '@core/coach.ts';
import type { ReducedMotion } from '@core/reducedMotion.ts';

export type ReducedMotionSource = Pick<ReducedMotion, 'matches' | 'subscribe'>;

export type CameraControllerState = {
  azimuthDeg: number;
  polarDeg: number;
  distance: number;
  distanceMin: number;
  distanceMax: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

export type CameraController = {
  update(dtSeconds: number): void;
  rotateBy(
    dAzimuth: number,
    dPolar: number,
    smooth: boolean,
    notify?: boolean,
  ): void;
  zoomBy(factor: number, smooth: boolean, notify?: boolean): void;
  setAspect(aspect: number): void;
  setTarget(x: number, y: number, z: number): void;
  setLimitsForBody(displayRadius: number | null): void;
  setPose(next: CameraPose): void;
  getPose(out: CameraPose): CameraPose;
  getState(out: CameraControllerState): CameraControllerState;
  notifyUserInput(): void;
  onUserInput(listener: () => void): () => void;
  /**
   * Every rotateBy and zoomBy with a change, whatever `notify` says. Only user
   * input calls them; flights go through setPose. The input object is shared
   * and overwritten by the next call.
   */
  onCameraInput(listener: (input: CameraUserInput) => void): () => void;
  dispose(): void;
};

export type CameraControllerOptions = {
  camera: PerspectiveCamera;
  reducedMotion: ReducedMotionSource;
};

const RAD_TO_DEG = 180 / Math.PI;

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

function requireFinite(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw invalidInput(functionName, parameter, 'must be finite', value);
  }
}

function requireFinitePositive(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidInput(
      functionName,
      parameter,
      'must be finite and > 0',
      value,
    );
  }
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

export function createCameraController(
  options: CameraControllerOptions,
): CameraController {
  const camera = options.camera;
  const reducedMotion = options.reducedMotion;
  const pose: CameraPose = {
    azimuth: 0,
    polar: 0,
    distance: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  const limits: DistanceLimits = { min: 1, max: 1 };
  const position: Vec3 = { x: 0, y: 0, z: 0 };
  const listeners: Array<() => void> = [];
  const inputListeners: Array<(input: CameraUserInput) => void> = [];
  const rotateInput: Extract<CameraUserInput, { kind: 'rotate' }> = {
    kind: 'rotate',
    deg: 0,
  };
  const zoomInput: Extract<CameraUserInput, { kind: 'zoom' }> = {
    kind: 'zoom',
    ratio: 0,
  };

  let aspect = camera.aspect;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    aspect = 1;
  }
  let displayRadius: number | null = null;
  let residualAzimuth = 0;
  let residualPolar = 0;
  let residualLogZoom = 0;
  let disposed = false;

  setDefaultPose(pose, aspect);
  recomputeLimits();
  syncCamera();

  const onReducedMotion = (): void => {
    if (!reducedMotion.matches) {
      return;
    }
    flushResiduals();
  };
  const unsubscribeReducedMotion = reducedMotion.subscribe(onReducedMotion);

  return {
    update(dtSeconds: number): void {
      if (disposed) {
        return;
      }

      requireFiniteAtLeastZero('update', 'dtSeconds', dtSeconds);
      const fraction = dampingFraction(dtSeconds);
      if (residualAzimuth !== 0 || residualPolar !== 0) {
        const dAzimuth = residualAzimuth * fraction;
        const dPolar = residualPolar * fraction;
        residualAzimuth -= dAzimuth;
        residualPolar -= dPolar;
        applyRotation(dAzimuth, dPolar);
      }
      if (residualLogZoom !== 0) {
        const appliedLog = residualLogZoom * fraction;
        residualLogZoom -= appliedLog;
        const current = pose.distance;
        pose.distance = softClampDistance(
          current,
          current * Math.exp(appliedLog),
          limits,
        );
      }
      syncCamera();
    },
    rotateBy(
      dAzimuth: number,
      dPolar: number,
      smooth: boolean,
      notify = true,
    ): void {
      if (disposed) {
        return;
      }

      requireFinite('rotateBy', 'dAzimuth', dAzimuth);
      requireFinite('rotateBy', 'dPolar', dPolar);
      if (dAzimuth === 0 && dPolar === 0) {
        return;
      }

      if (!smooth || reducedMotion.matches) {
        residualAzimuth = 0;
        residualPolar = 0;
        applyRotation(dAzimuth, dPolar);
        syncCamera();
      } else {
        residualAzimuth += dAzimuth;
        residualPolar += dPolar;
      }
      rotateInput.deg = (Math.abs(dAzimuth) + Math.abs(dPolar)) * RAD_TO_DEG;
      emitCameraInput(rotateInput);

      if (notify) {
        emitUserInput();
      }
    },
    zoomBy(factor: number, smooth: boolean, notify = true): void {
      if (disposed) {
        return;
      }

      requireFinitePositive('zoomBy', 'factor', factor);
      if (factor === 1) {
        return;
      }

      if (!smooth || reducedMotion.matches) {
        residualLogZoom = 0;
        const current = pose.distance;
        pose.distance = softClampDistance(current, current * factor, limits);
        syncCamera();
      } else {
        residualLogZoom += Math.log(factor);
      }
      zoomInput.ratio = Math.abs(1 - factor);
      emitCameraInput(zoomInput);

      if (notify) {
        emitUserInput();
      }
    },
    setAspect(nextAspect: number): void {
      if (disposed) {
        return;
      }

      requireFinitePositive('setAspect', 'aspect', nextAspect);
      if (nextAspect === aspect) {
        return;
      }

      const previousStart = startDistance(aspect);
      const nextStart = startDistance(nextAspect);
      pose.distance *= nextStart / previousStart;
      aspect = nextAspect;
      recomputeLimits();
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      syncCamera();
    },
    setTarget(x: number, y: number, z: number): void {
      if (disposed) {
        return;
      }

      requireFinite('setTarget', 'x', x);
      requireFinite('setTarget', 'y', y);
      requireFinite('setTarget', 'z', z);
      pose.targetX = x;
      pose.targetY = y;
      pose.targetZ = z;
      syncCamera();
    },
    setLimitsForBody(nextRadius: number | null): void {
      if (disposed) {
        return;
      }

      if (nextRadius !== null) {
        requireFinitePositive('setLimitsForBody', 'displayRadius', nextRadius);
        bodyDistanceLimits(limits, startDistance(aspect), nextRadius);
        displayRadius = nextRadius;
        return;
      }
      displayRadius = null;
      systemDistanceLimits(limits, startDistance(aspect));
    },
    setPose(next: CameraPose): void {
      if (disposed) {
        return;
      }

      requireFinite('setPose', 'azimuth', next.azimuth);
      requireFinite('setPose', 'polar', next.polar);
      requireFinite('setPose', 'distance', next.distance);
      requireFinite('setPose', 'targetX', next.targetX);
      requireFinite('setPose', 'targetY', next.targetY);
      requireFinite('setPose', 'targetZ', next.targetZ);
      const currentDistance = pose.distance;
      pose.azimuth = wrapAzimuth(next.azimuth);
      pose.polar = clampPolar(next.polar);
      pose.distance = softClampDistance(currentDistance, next.distance, limits);
      pose.targetX = next.targetX;
      pose.targetY = next.targetY;
      pose.targetZ = next.targetZ;
      residualAzimuth = 0;
      residualPolar = 0;
      residualLogZoom = 0;
      syncCamera();
    },
    getPose(out: CameraPose): CameraPose {
      if (disposed) {
        return out;
      }

      out.azimuth = pose.azimuth;
      out.polar = pose.polar;
      out.distance = pose.distance;
      out.targetX = pose.targetX;
      out.targetY = pose.targetY;
      out.targetZ = pose.targetZ;
      return out;
    },
    getState(out: CameraControllerState): CameraControllerState {
      if (disposed) {
        return out;
      }

      out.azimuthDeg = pose.azimuth * RAD_TO_DEG;
      out.polarDeg = pose.polar * RAD_TO_DEG;
      out.distance = pose.distance;
      out.distanceMin = limits.min;
      out.distanceMax = limits.max;
      out.targetX = pose.targetX;
      out.targetY = pose.targetY;
      out.targetZ = pose.targetZ;
      return out;
    },
    notifyUserInput(): void {
      if (disposed) {
        return;
      }

      emitUserInput();
    },
    onUserInput(listener: () => void): () => void {
      if (disposed) {
        return () => undefined;
      }

      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    onCameraInput(listener: (input: CameraUserInput) => void): () => void {
      if (disposed) {
        return () => undefined;
      }

      inputListeners.push(listener);
      return () => {
        const index = inputListeners.indexOf(listener);
        if (index >= 0) {
          inputListeners.splice(index, 1);
        }
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      unsubscribeReducedMotion();
      listeners.length = 0;
      inputListeners.length = 0;
      residualAzimuth = 0;
      residualPolar = 0;
      residualLogZoom = 0;
    },
  };

  function recomputeLimits(): void {
    const start = startDistance(aspect);
    if (displayRadius === null) {
      systemDistanceLimits(limits, start);
      return;
    }
    bodyDistanceLimits(limits, start, displayRadius);
  }

  function applyRotation(dAzimuth: number, dPolar: number): void {
    const unclampedPolar = pose.polar + dPolar;
    rotatePose(pose, dAzimuth, dPolar);
    if (pose.polar !== unclampedPolar) {
      residualPolar = 0;
    }
  }

  function flushResiduals(): void {
    const dAzimuth = residualAzimuth;
    const dPolar = residualPolar;
    const logZoom = residualLogZoom;
    residualAzimuth = 0;
    residualPolar = 0;
    residualLogZoom = 0;
    if (dAzimuth !== 0 || dPolar !== 0) {
      applyRotation(dAzimuth, dPolar);
    }
    if (logZoom !== 0) {
      const current = pose.distance;
      pose.distance = softClampDistance(
        current,
        current * Math.exp(logZoom),
        limits,
      );
    }
    syncCamera();
  }

  function syncCamera(): void {
    poseToPosition(position, pose);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
    camera.updateMatrixWorld();
  }

  function emitUserInput(): void {
    for (let index = 0; index < listeners.length; index += 1) {
      listeners[index]?.();
    }
  }

  function emitCameraInput(input: CameraUserInput): void {
    for (let index = 0; index < inputListeners.length; index += 1) {
      inputListeners[index]?.(input);
    }
  }
}
