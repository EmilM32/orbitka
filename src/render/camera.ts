import { PerspectiveCamera } from 'three';

const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2000;
const CAMERA_OFFSET = { x: 0, y: 75, z: 95 } as const;

export function cameraDistanceMultiplier(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return 1;
  }

  return Math.max(1, 1.2 / aspect);
}

function usableAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

export function frameCamera(camera: PerspectiveCamera, aspect: number): void {
  const distance = cameraDistanceMultiplier(aspect);
  camera.aspect = usableAspect(aspect);
  camera.position.set(
    CAMERA_OFFSET.x * distance,
    CAMERA_OFFSET.y * distance,
    CAMERA_OFFSET.z * distance,
  );
  camera.lookAt(0, 0, 0);
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
