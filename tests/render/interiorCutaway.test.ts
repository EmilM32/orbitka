import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { expect, test } from 'vitest';

import type { InteriorCatalog, InteriorEntry } from '@data/interiors.ts';
import { createInteriorCutaway } from '@render/interiorCutaway.ts';

const EARTH: InteriorEntry = {
  id: 'earth',
  source: { name: 'USGS', url: 'https://example.com' },
  atmosphere: false,
  layers: [
    {
      id: 'crust',
      outerRadiusKm: 6371,
      displayFraction: 1,
      color: '#C4A574',
    },
    {
      id: 'core',
      outerRadiusKm: 1221,
      displayFraction: 0.2,
      color: '#F2E24B',
    },
  ],
};

function catalog(): InteriorCatalog {
  return new Map([['earth', EARTH]]);
}

function setup() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const geometry = new SphereGeometry(1, 8, 6);
  const material = new MeshBasicMaterial({ color: '#3A78C2' });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'earth';
  scene.add(mesh);
  const ring = { visible: true };
  const glow = { visible: true };
  const clipping = { localClippingEnabled: false };
  const cutaway = createInteriorCutaway({
    scene,
    clipping,
    catalog: catalog(),
    meshes: new Map([['earth', mesh]]),
    radii: new Map([['earth', 1]]),
    rings: new Map([['earth', { mesh: ring }]]),
    glow,
    reducedMotion: { matches: true },
  });
  return { scene, camera, mesh, material, ring, glow, clipping, cutaway };
}

test('interiorCutaway › a settled body opens toward the camera', () => {
  const { camera, mesh, material, ring, clipping, cutaway } = setup();
  cutaway.setActive(true);
  cutaway.setBody('earth');
  cutaway.update(0, camera, false);

  expect(clipping.localClippingEnabled).toBe(true);
  expect(material.clippingPlanes).toHaveLength(3);
  expect(material.clipIntersection).toBe(true);
  expect(ring.visible).toBe(false);
  const planes = material.clippingPlanes ?? [];
  const plane = planes[0];
  if (plane === undefined) {
    throw new Error('missing clipping plane');
  }
  const center = new Vector3();
  mesh.getWorldPosition(center);
  for (const each of planes) {
    expect(each.distanceToPoint(center)).toBeCloseTo(0);
    // The camera looks into the removed eighth.
    expect(each.distanceToPoint(camera.position)).toBeLessThan(0);
  }
  // Behind the body nothing is removed.
  const behind = center.clone().sub(camera.position);
  expect(planes.some((each) => each.distanceToPoint(behind) > 0)).toBe(true);

  // Orbiting does not retarget the cut.
  const normal = plane.normal.clone();
  camera.position.set(8, 0, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  cutaway.update(0, camera, false);
  expect(plane.normal.x).toBeCloseTo(normal.x);
  expect(plane.normal.y).toBeCloseTo(normal.y);
  expect(plane.normal.z).toBeCloseTo(normal.z);

  cutaway.setHighlight('core');
  cutaway.setActive(false);
  cutaway.update(0, camera, false);
  expect(material.clippingPlanes).toBeNull();
  expect(material.clipIntersection).toBe(false);
  expect(ring.visible).toBe(true);
  expect(clipping.localClippingEnabled).toBe(false);
  cutaway.dispose();
  geometryOf(mesh).dispose();
  material.dispose();
});

test('interiorCutaway › a flight keeps the body whole until the camera arrives', () => {
  const { camera, material, cutaway } = setup();
  cutaway.setActive(true);
  cutaway.setBody('earth');
  cutaway.update(0.1, camera, true);
  expect(material.clippingPlanes).toBeNull();
  cutaway.update(0, camera, false);
  expect(material.clippingPlanes).toHaveLength(3);
  cutaway.dispose();
});

test('interiorCutaway › a body without layers is left whole', () => {
  const { camera, material, glow, cutaway } = setup();
  cutaway.setActive(true);
  cutaway.setBody('sun');
  cutaway.update(0, camera, false);
  expect(material.clippingPlanes).toBeNull();
  expect(glow.visible).toBe(true);
  cutaway.dispose();
});

function geometryOf(mesh: Mesh): SphereGeometry {
  if (!(mesh.geometry instanceof SphereGeometry)) {
    throw new Error('expected a sphere');
  }
  return mesh.geometry;
}
