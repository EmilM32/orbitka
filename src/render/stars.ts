import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

import { createCamera } from './camera.ts';

const STAR_RADIUS = 70;
const STAR_CANDIDATES = 1600;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Punkty tła. Same ciała pokrywają ~0,3% kadru 1280×720, a próg dymny wymaga 0,5%.
// Gwiazdy są za planetami (depthTest) i omijają piksel tła (2, 2).
export function createStarfield(): Points {
  const camera = createCamera(16 / 9);
  const width = 1280;
  const height = 720;
  const ndc = new Vector3();
  const kept: number[] = [];

  for (let index = 0; index < STAR_CANDIDATES; index += 1) {
    const unitY = 1 - (index / (STAR_CANDIDATES - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - unitY * unitY));
    const theta = index * GOLDEN_ANGLE;
    const x = Math.cos(theta) * ring * STAR_RADIUS;
    const y = unitY * STAR_RADIUS;
    const z = Math.sin(theta) * ring * STAR_RADIUS;

    ndc.set(x, y, z).project(camera);
    const screenX = (ndc.x * 0.5 + 0.5) * width;
    const screenY = (-ndc.y * 0.5 + 0.5) * height;
    if (
      ndc.z > 1 ||
      screenX < 20 ||
      screenY < 20 ||
      screenX > width - 2 ||
      screenY > height - 2
    ) {
      continue;
    }

    kept.push(x, y, z);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(kept, 3));

  const points = new Points(
    geometry,
    new PointsMaterial({
      color: 0xe7eefc,
      size: 3,
      sizeAttenuation: false,
      depthWrite: false,
    }),
  );
  points.name = 'stars';
  points.renderOrder = -1;
  return points;
}
