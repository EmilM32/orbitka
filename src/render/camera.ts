import { PerspectiveCamera } from 'three';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  poseToPosition,
  setDefaultPose,
  startDistance,
  type CameraPose,
  type Vec3,
} from '@core/cameraMath.ts';

const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;

const pose: CameraPose = {
  azimuth: 0,
  polar: 0,
  distance: 1,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
};
const position: Vec3 = { x: 0, y: 0, z: 0 };

export function cameraDistanceMultiplier(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return 1;
  }

  return startDistance(aspect) / CAMERA_CONFIG.startDistanceBase;
}

function usableAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

export function frameCamera(camera: PerspectiveCamera, aspect: number): void {
  const safeAspect = usableAspect(aspect);
  setDefaultPose(pose, safeAspect);
  poseToPosition(position, pose);
  camera.aspect = safeAspect;
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
  camera.updateProjectionMatrix();
  // lookAt refreshes the matrix against the old rotation. project() reads matrixWorldInverse.
  camera.updateMatrixWorld();
}

export function createCamera(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CAMERA_FOV,
    usableAspect(aspect),
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  frameCamera(camera, aspect);
  return camera;
}
