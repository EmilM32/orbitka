import {
  createQualityStore,
  loadStoredQuality,
  resolveInitialQuality,
  type QualityLevel,
} from '@core/quality.ts';
import { STAR_COUNTS } from '@core/starfield.ts';
import { bodies } from '@data/bodies.ts';
import { applyQualityLevel } from '@render/applyQuality.ts';
import { createBodies } from '@render/bodies.ts';
import { createLights } from '@render/lights.ts';
import { addOrbitLines } from '@render/orbitLines.ts';
import { createStarfield } from '@render/starfield.ts';
import { createSunGlow } from '@render/sunGlow.ts';
import {
  createTextureLoader,
  createTextureStore,
} from '@render/textureStore.ts';

import { createDisposables } from './disposables.ts';
import type { ViewRig } from './wireView.ts';

export type SceneInputs = {
  viewRig: ViewRig;
  storage: Storage | null;
  search: string;
};

/** The scene content: stars, bodies, textures, orbit lines, quality level. */
export function wireScene({ viewRig, storage, search }: SceneInputs) {
  const { view, textureMemory } = viewRig;
  const stack = createDisposables();
  const pointerCoarse = window.matchMedia('(pointer: coarse)').matches;
  const stored = loadStoredQuality(storage);
  const quality = createQualityStore(
    resolveInitialQuality({ search, pointerCoarse, ...stored }),
    storage,
    { fallbackLevel: pointerCoarse ? 'medium' : 'high' },
  );
  const starfield = createStarfield(STAR_COUNTS[quality.get()]);
  view.scene.add(starfield.points);
  stack.add(() => {
    starfield.dispose();
  });
  const bodyView = createBodies(bodies, textureMemory);
  view.scene.add(bodyView.group);
  stack.add(() => {
    bodyView.dispose();
  });
  const textureStore = createTextureStore({
    renderer: view.renderer,
    bodies,
    meshes: bodyView.meshes,
    memory: textureMemory,
    loader: createTextureLoader(),
    baseUrl: `${import.meta.env.BASE_URL}assets/textures/`,
    onWarn: (message) => {
      console.warn(message);
    },
  });
  stack.add(() => {
    textureStore.dispose();
  });
  const sunMesh = bodyView.meshes.get('sun');
  const sunRadius = bodyView.radii.get('sun');
  const sunDef = bodies.find((body) => body.type === 'star');
  if (sunMesh === undefined || sunRadius === undefined || !sunDef) {
    stack.disposeAll();
    throw new Error('Missing the Sun mesh');
  }
  const sunGlow = createSunGlow(sunRadius, sunDef.visual.color, textureMemory);
  sunMesh.add(sunGlow.sprite);
  stack.add(() => {
    sunGlow.dispose();
  });
  const qualityTargets = {
    spheres: bodyView.spheres,
    starfield,
    textureStore,
    view,
  };
  const applyLevel = (level: QualityLevel): void => {
    applyQualityLevel(level, qualityTargets);
    document.documentElement.dataset.quality = level;
  };
  applyLevel(quality.get());
  stack.add(quality.subscribe(applyLevel));
  const orbitLines = addOrbitLines(view.scene, bodies);
  stack.add(() => {
    orbitLines.dispose();
  });
  view.scene.add(createLights());

  return {
    quality,
    starfield,
    bodyView,
    textureStore,
    orbitLines,
    dispose: stack.disposeAll,
  };
}

export type SceneRig = ReturnType<typeof wireScene>;
