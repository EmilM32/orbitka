import {
  CircleGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  RingGeometry,
  Vector3,
  type Material,
  type PerspectiveCamera,
  type Scene,
  type Side,
} from 'three';

import {
  CUTAWAY_OPEN_SECONDS,
  CUTAWAY_RIM_INSET,
  captureCutNormal,
  cutPlanePoint,
  easeOutCubic,
  layerDiscOffset,
  type CutawayVec3,
} from '@core/cutawayPlane.ts';
import type { InteriorCatalog, InteriorEntry } from '@data/interiors.ts';

const DISC_SEGMENTS = 64;
const HIGHLIGHT_MIX = 0.45;

type Hideable = { visible: boolean };

type ClippingTarget = {
  localClippingEnabled: boolean;
};

export type InteriorCutaway = {
  setActive(active: boolean): void;
  setBody(id: string | null): void;
  setHighlight(layerId: string | null): void;
  /**
   * Moves the plane with the body. While a camera flight is running the
   * planet stays whole; the cut is aimed when the flight ends, then frozen
   * so orbiting shows the surface beside the layers.
   */
  update(
    dtSeconds: number,
    camera: PerspectiveCamera,
    flightActive: boolean,
  ): void;
  dispose(): void;
};

export type InteriorCutawayOptions = {
  scene: Scene;
  clipping: ClippingTarget;
  catalog: InteriorCatalog;
  meshes: ReadonlyMap<string, Mesh>;
  radii: ReadonlyMap<string, number>;
  rings: ReadonlyMap<string, { mesh: Hideable }>;
  glow: Hideable | null;
  reducedMotion: { readonly matches: boolean };
};

type Disc = {
  mesh: Mesh;
  material: MeshBasicMaterial;
  base: Color;
};

function singleMaterial(mesh: Mesh): Material {
  const material = mesh.material;
  if (Array.isArray(material)) {
    const first = material[0];
    if (first === undefined) {
      throw new Error(`interiorCutaway: body "${mesh.name}" has no material`);
    }
    return first;
  }
  return material;
}

function discRadii(
  entry: InteriorEntry,
  index: number,
  sceneRadius: number,
): { inner: number; outer: number } {
  const layer = entry.layers[index];
  const next = entry.layers[index + 1];
  if (layer === undefined) {
    throw new Error('interiorCutaway: missing layer');
  }
  const outer = layer.displayFraction * sceneRadius;
  const inner = next === undefined ? 0 : next.displayFraction * sceneRadius;
  return {
    inner,
    outer: index === 0 ? outer * (1 - CUTAWAY_RIM_INSET) : outer,
  };
}

export function createInteriorCutaway(
  options: InteriorCutawayOptions,
): InteriorCutaway {
  const { scene, clipping, catalog, meshes, radii, rings, glow } = options;
  const plane = new Plane();
  const group = new Group();
  group.name = 'interior-cutaway';
  group.visible = false;
  scene.add(group);

  const bodyPosition = new Vector3();
  const cameraPosition = new Vector3();
  const normal = new Vector3();
  const point = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  const white = new Color(0xffffff);
  const bodyTuple: CutawayVec3 = { x: 0, y: 0, z: 0 };
  const cameraTuple: CutawayVec3 = { x: 0, y: 0, z: 0 };
  const normalTuple: CutawayVec3 = { x: 0, y: 0, z: 1 };
  const pointTuple: CutawayVec3 = { x: 0, y: 0, z: 0 };

  const discs: Disc[] = [];
  const savedSide = new WeakMap<Material, Side>();
  const hidden: { object: Hideable; visible: boolean }[] = [];

  let active = false;
  let bodyId: string | null = null;
  let highlight: string | null = null;
  let captured = false;
  let progress = 0;
  let appliedId: string | null = null;
  let disposed = false;

  return { setActive, setBody, setHighlight, update, dispose };

  function setActive(next: boolean): void {
    if (disposed || next === active) {
      return;
    }
    active = next;
    captured = false;
    if (!active) {
      clearCut();
    }
  }

  function setBody(id: string | null): void {
    if (disposed || id === bodyId) {
      return;
    }
    bodyId = id;
    captured = false;
    highlight = null;
    clearCut();
  }

  function setHighlight(layerId: string | null): void {
    if (disposed) {
      return;
    }
    highlight = layerId;
    paintHighlight();
  }

  function update(
    dtSeconds: number,
    camera: PerspectiveCamera,
    flightActive: boolean,
  ): void {
    if (disposed) {
      return;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      throw new RangeError(
        `interiorCutaway.update: parameter "dtSeconds" must be finite and >= 0, got ${dtSeconds}`,
      );
    }
    if (!active || bodyId === null) {
      clearCut();
      return;
    }

    const entry = catalog.get(bodyId);
    const mesh = meshes.get(bodyId);
    const radius = radii.get(bodyId);
    if (entry === undefined || mesh === undefined || radius === undefined) {
      clearCut();
      return;
    }

    if (flightActive) {
      // Aim again when the camera arrives, so the opening faces the student.
      captured = false;
      clearCut();
      return;
    }

    readPositions(mesh, camera);
    if (!captured) {
      const ok = captureCutNormal(bodyTuple, cameraTuple, normalTuple);
      if (!ok) {
        return;
      }
      normal.set(normalTuple.x, normalTuple.y, normalTuple.z);
      captured = true;
      progress = options.reducedMotion.matches ? 1 : 0;
      showDiscs(entry, radius);
      applyShell(mesh, bodyId);
      hideExtras(bodyId);
    } else if (!options.reducedMotion.matches && progress < 1) {
      progress = Math.min(1, progress + dtSeconds / CUTAWAY_OPEN_SECONDS);
    } else if (options.reducedMotion.matches) {
      progress = 1;
    }

    const eased = easeOutCubic(progress);
    cutPlanePoint(bodyTuple, normalTuple, radius, eased, pointTuple);
    point.set(pointTuple.x, pointTuple.y, pointTuple.z);
    plane.setFromNormalAndCoplanarPoint(normal, point);
    group.position.copy(bodyPosition);
    group.quaternion.setFromUnitVectors(zAxis, normal);
    group.visible = progress > 0;
    const opening = progress < 1;
    for (const disc of discs) {
      disc.material.opacity = eased;
      if (disc.material.transparent !== opening) {
        disc.material.transparent = opening;
        disc.material.needsUpdate = true;
      }
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    clearCut();
    disposeDiscs();
    scene.remove(group);
  }

  function readPositions(mesh: Mesh, camera: PerspectiveCamera): void {
    mesh.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    mesh.getWorldPosition(bodyPosition);
    camera.getWorldPosition(cameraPosition);
    bodyTuple.x = bodyPosition.x;
    bodyTuple.y = bodyPosition.y;
    bodyTuple.z = bodyPosition.z;
    cameraTuple.x = cameraPosition.x;
    cameraTuple.y = cameraPosition.y;
    cameraTuple.z = cameraPosition.z;
  }

  function showDiscs(entry: InteriorEntry, radius: number): void {
    disposeDiscs();
    for (let index = 0; index < entry.layers.length; index += 1) {
      const layer = entry.layers[index];
      if (layer === undefined) {
        continue;
      }
      const { inner, outer } = discRadii(entry, index, radius);
      const geometry =
        inner === 0
          ? new CircleGeometry(outer, DISC_SEGMENTS)
          : new RingGeometry(inner, outer, DISC_SEGMENTS);
      const material = new MeshBasicMaterial({
        color: layer.color,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = layer.id;
      mesh.position.z = layerDiscOffset(index, entry.layers.length, radius);
      group.add(mesh);
      discs.push({ mesh, material, base: new Color(layer.color) });
    }
    paintHighlight();
  }

  function applyShell(mesh: Mesh, id: string): void {
    const material = singleMaterial(mesh);
    if (!savedSide.has(material)) {
      savedSide.set(material, material.side);
    }
    material.side = DoubleSide;
    material.clippingPlanes = [plane];
    material.needsUpdate = true;
    clipping.localClippingEnabled = true;
    appliedId = id;
  }

  function hideExtras(id: string): void {
    restoreExtras();
    const ring = rings.get(id);
    if (ring !== undefined) {
      hidden.push({ object: ring.mesh, visible: ring.mesh.visible });
      ring.mesh.visible = false;
    }
    if (id === 'sun' && glow !== null) {
      hidden.push({ object: glow, visible: glow.visible });
      glow.visible = false;
    }
  }

  function clearCut(): void {
    if (appliedId !== null) {
      const mesh = meshes.get(appliedId);
      if (mesh !== undefined) {
        const material = singleMaterial(mesh);
        material.clippingPlanes = null;
        material.side = savedSide.get(material) ?? FrontSide;
        material.needsUpdate = true;
      }
      appliedId = null;
    }
    clipping.localClippingEnabled = false;
    group.visible = false;
    restoreExtras();
    if (!captured) {
      progress = 0;
    }
  }

  function restoreExtras(): void {
    for (const item of hidden) {
      item.object.visible = item.visible;
    }
    hidden.length = 0;
  }

  function paintHighlight(): void {
    for (const disc of discs) {
      if (disc.mesh.name === highlight) {
        disc.material.color.copy(disc.base).lerp(white, HIGHLIGHT_MIX);
      } else {
        disc.material.color.copy(disc.base);
      }
    }
  }

  function disposeDiscs(): void {
    for (const disc of discs) {
      group.remove(disc.mesh);
      disc.mesh.geometry.dispose();
      disc.material.dispose();
    }
    discs.length = 0;
  }
}
