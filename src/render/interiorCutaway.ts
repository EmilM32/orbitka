import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Quaternion,
  RingGeometry,
  Vector3,
  type Material,
  type PerspectiveCamera,
  type Scene,
  type Side,
} from 'three';

import {
  CUTAWAY_FACE_OFFSET,
  CUTAWAY_OPEN_SECONDS,
  CUTAWAY_RIM_INSET,
  captureOctantFrame,
  layerReveal,
  wedgeAngle,
  wedgeClipNormals,
  type CutawayVec3,
  type OctantFrame,
} from '@core/cutawayPlane.ts';
import type { InteriorCatalog, InteriorEntry } from '@data/interiors.ts';

const FACE_SEGMENTS = 48;
const ARC_SEGMENTS = 48;
const HIGHLIGHT_MIX = 0.45;
// Fixed shading per face, so the opening reads as a solid on the night side
// too. Order: the fixed wall, the swinging wall, the floor.
const FACE_SHADES = [0.84, 0.7, 1] as const;
// Faces wear this before their layer color comes in.
const DORMANT_COLOR = 0x3b3f47;
const LINE_COLOR = 0x0b0d12;
const LINE_OPACITY = 0.55;
const QUARTER = Math.PI / 2;

type Hideable = { visible: boolean };

type ClippingTarget = {
  localClippingEnabled: boolean;
};

export type InteriorCutaway = {
  setActive(active: boolean): void;
  setBody(id: string | null): void;
  setHighlight(layerId: string | null): void;
  /**
   * Moves the planes with the body. While a camera flight is running the
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

type LayerFaces = {
  id: string;
  base: Color;
  /** One per face, in `FACE_SHADES` order. */
  materials: MeshBasicMaterial[];
};

type SavedClip = { side: Side; clipIntersection: boolean };

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

function layerRadii(
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

/** A quarter disc or ring in the XY plane, from +X toward +Y. */
function quarterGeometry(inner: number, outer: number): BufferGeometry {
  return inner === 0
    ? new CircleGeometry(outer, FACE_SEGMENTS, 0, QUARTER)
    : new RingGeometry(inner, outer, FACE_SEGMENTS, 1, 0, QUARTER);
}

/** Layer borders as quarter arcs plus the two straight edges, in XY. */
function borderGeometry(
  entry: InteriorEntry,
  sceneRadius: number,
): BufferGeometry {
  const points: number[] = [];
  for (let index = 0; index < entry.layers.length; index += 1) {
    const { outer } = layerRadii(entry, index, sceneRadius);
    for (let step = 0; step < ARC_SEGMENTS; step += 1) {
      const from = (step / ARC_SEGMENTS) * QUARTER;
      const to = ((step + 1) / ARC_SEGMENTS) * QUARTER;
      points.push(
        Math.cos(from) * outer,
        Math.sin(from) * outer,
        0,
        Math.cos(to) * outer,
        Math.sin(to) * outer,
        0,
      );
    }
  }
  const rim = layerRadii(entry, 0, sceneRadius).outer;
  points.push(0, 0, 0, rim, 0, 0, 0, 0, 0, 0, rim, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometry;
}

export function createInteriorCutaway(
  options: InteriorCutawayOptions,
): InteriorCutaway {
  const { scene, clipping, catalog, meshes, radii, rings, glow } = options;
  const planes = [new Plane(), new Plane(), new Plane()] as const;
  const group = new Group();
  group.name = 'interior-cutaway';
  group.visible = false;
  scene.add(group);
  // Local frame of `group`: x = a, y = b, z = c of the octant frame.
  const wallFixed = new Group();
  const wallSwing = new Group();
  const floor = new Group();
  group.add(wallFixed, wallSwing, floor);

  const bodyPosition = new Vector3();
  const cameraPosition = new Vector3();
  const cameraUp = new Vector3();
  const cameraQuaternion = new Quaternion();
  const basis = new Matrix4();
  const axisA = new Vector3();
  const axisB = new Vector3();
  const axisC = new Vector3();
  const normal = new Vector3();
  const dormant = new Color(DORMANT_COLOR);
  const white = new Color(0xffffff);
  const scratch = new Color();
  const bodyTuple: CutawayVec3 = { x: 0, y: 0, z: 0 };
  const cameraTuple: CutawayVec3 = { x: 0, y: 0, z: 0 };
  const upTuple: CutawayVec3 = { x: 0, y: 1, z: 0 };
  const frame: OctantFrame = {
    a: { x: 1, y: 0, z: 0 },
    b: { x: 0, y: 1, z: 0 },
    c: { x: 0, y: 0, z: 1 },
  };
  const normals: [CutawayVec3, CutawayVec3, CutawayVec3] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];

  const layers: LayerFaces[] = [];
  const geometries: BufferGeometry[] = [];
  const lineMaterial = new LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthWrite: false,
  });
  const saved = new WeakMap<Material, SavedClip>();
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
    paintLayers();
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
    const reduced = options.reducedMotion.matches;
    if (!captured) {
      if (!captureOctantFrame(bodyTuple, cameraTuple, upTuple, frame)) {
        return;
      }
      captured = true;
      progress = reduced ? 1 : 0;
      axisA.set(frame.a.x, frame.a.y, frame.a.z);
      axisB.set(frame.b.x, frame.b.y, frame.b.z);
      axisC.set(frame.c.x, frame.c.y, frame.c.z);
      basis.makeBasis(axisA, axisB, axisC);
      group.quaternion.setFromRotationMatrix(basis);
      buildFaces(entry, radius);
      applyShell(mesh, bodyId);
      hideExtras(bodyId);
    } else if (reduced) {
      progress = 1;
    } else if (progress < 1) {
      progress = Math.min(1, progress + dtSeconds / CUTAWAY_OPEN_SECONDS);
      paintLayers();
    }

    const angle = wedgeAngle(progress);
    wedgeClipNormals(frame, angle, normals);
    for (let index = 0; index < planes.length; index += 1) {
      const n = normals[index];
      const plane = planes[index];
      if (n === undefined || plane === undefined) {
        continue;
      }
      normal.set(n.x, n.y, n.z);
      plane.setFromNormalAndCoplanarPoint(normal, bodyPosition);
    }
    wallSwing.rotation.z = angle;
    group.position.copy(bodyPosition);
    group.visible = angle > 0;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    clearCut();
    disposeFaces();
    lineMaterial.dispose();
    scene.remove(group);
  }

  function readPositions(mesh: Mesh, camera: PerspectiveCamera): void {
    mesh.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    mesh.getWorldPosition(bodyPosition);
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(cameraQuaternion);
    cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
    bodyTuple.x = bodyPosition.x;
    bodyTuple.y = bodyPosition.y;
    bodyTuple.z = bodyPosition.z;
    cameraTuple.x = cameraPosition.x;
    cameraTuple.y = cameraPosition.y;
    cameraTuple.z = cameraPosition.z;
    upTuple.x = cameraUp.x;
    upTuple.y = cameraUp.y;
    upTuple.z = cameraUp.z;
  }

  function buildFaces(entry: InteriorEntry, radius: number): void {
    disposeFaces();
    const offset = CUTAWAY_FACE_OFFSET * radius;
    for (let index = 0; index < entry.layers.length; index += 1) {
      const layer = entry.layers[index];
      if (layer === undefined) {
        continue;
      }
      const { inner, outer } = layerRadii(entry, index, radius);
      // Walls stand in the XZ plane: turn the XY quarter up around X.
      const wallGeometry = quarterGeometry(inner, outer).rotateX(QUARTER);
      const floorGeometry = quarterGeometry(inner, outer);
      geometries.push(wallGeometry, floorGeometry);
      const materials = FACE_SHADES.map(
        () =>
          new MeshBasicMaterial({
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
      );
      const [fixedMaterial, swingMaterial, floorMaterial] = materials;
      if (
        fixedMaterial === undefined ||
        swingMaterial === undefined ||
        floorMaterial === undefined
      ) {
        throw new Error('interiorCutaway: missing face material');
      }
      addFace(wallFixed, wallGeometry, fixedMaterial, layer.id, 0, offset, 0);
      // The swinging wall's removed side is local -Y once turned by its angle.
      addFace(wallSwing, wallGeometry, swingMaterial, layer.id, 0, -offset, 0);
      addFace(floor, floorGeometry, floorMaterial, layer.id, 0, 0, offset);
      layers.push({ id: layer.id, base: new Color(layer.color), materials });
    }

    const borders = borderGeometry(entry, radius);
    const wallBorders = borders.clone().rotateX(QUARTER);
    geometries.push(borders, wallBorders);
    const lineOffset = offset * 1.5;
    addBorder(wallFixed, wallBorders, 0, lineOffset, 0);
    addBorder(wallSwing, wallBorders, 0, -lineOffset, 0);
    addBorder(floor, borders, 0, 0, lineOffset);
    paintLayers();
  }

  function addFace(
    parent: Group,
    geometry: BufferGeometry,
    material: MeshBasicMaterial,
    name: string,
    x: number,
    y: number,
    z: number,
  ): void {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    parent.add(mesh);
  }

  function addBorder(
    parent: Group,
    geometry: BufferGeometry,
    x: number,
    y: number,
    z: number,
  ): void {
    const line = new LineSegments(geometry, lineMaterial);
    line.name = 'interior-borders';
    line.position.set(x, y, z);
    parent.add(line);
  }

  function applyShell(mesh: Mesh, id: string): void {
    const material = singleMaterial(mesh);
    if (!saved.has(material)) {
      saved.set(material, {
        side: material.side,
        clipIntersection: material.clipIntersection,
      });
    }
    material.side = DoubleSide;
    material.clippingPlanes = [...planes];
    material.clipIntersection = true;
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
        const before = saved.get(material);
        material.clippingPlanes = null;
        material.side = before?.side ?? FrontSide;
        material.clipIntersection = before?.clipIntersection ?? false;
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

  function paintLayers(): void {
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      if (layer === undefined) {
        continue;
      }
      const reveal = layerReveal(progress, index, layers.length);
      scratch.copy(dormant).lerp(layer.base, reveal);
      if (layer.id === highlight) {
        scratch.lerp(white, HIGHLIGHT_MIX);
      }
      for (let face = 0; face < layer.materials.length; face += 1) {
        const material = layer.materials[face];
        const shade = FACE_SHADES[face] ?? 1;
        material?.color.copy(scratch).multiplyScalar(shade);
      }
    }
  }

  function disposeFaces(): void {
    for (const parent of [wallFixed, wallSwing, floor]) {
      parent.clear();
    }
    for (const geometry of geometries) {
      geometry.dispose();
    }
    geometries.length = 0;
    for (const layer of layers) {
      for (const material of layer.materials) {
        material.dispose();
      }
    }
    layers.length = 0;
  }
}
