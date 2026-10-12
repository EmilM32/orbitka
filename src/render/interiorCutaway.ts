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
  CUTAWAY_HIGHLIGHT_SECONDS,
  CUTAWAY_OPEN_SECONDS,
  CUTAWAY_RIM_INSET,
  captureOctantFrame,
  layerReveal,
  stepToward,
  wedgeAngle,
  wedgeClipNormals,
  type CutawayVec3,
  type OctantFrame,
} from '@core/cutawayPlane.ts';
import type { InteriorCatalog, InteriorEntry } from '@data/interiors.ts';

import {
  MOVING_TEXTURES,
  createCutawayFaceMaterial,
  type CutawayFaceMaterial,
} from './cutawayFaceMaterial.ts';

const FACE_SEGMENTS = 48;
const ARC_SEGMENTS = 48;
// With a layer chosen, the others keep this much of their saturation and
// brightness, so the chosen one keeps its legend color and still stands out.
const DIM_SATURATION = 0.35;
const DIM_BRIGHTNESS = 0.4;
// The chosen layer's faces move this far toward the camera, in radii.
const HIGHLIGHT_LIFT = 0.012;
const OUTLINE_COLOR = 0xffffff;
const OUTLINE_OPACITY = 0.9;
// Where the label points: mid-radius on the fixed wall, halfway up.
const LABEL_ANGLE = Math.PI / 4;
// Fixed shading per face, so the opening reads as a solid on the night side
// too. Order: the fixed wall, the swinging wall, the floor.
const FACE_SHADES = [0.84, 0.7, 1] as const;
// Faces wear this before their layer color comes in.
const DORMANT_COLOR = 0x3b3f47;
const LINE_COLOR = 0x0b0d12;
const LINE_OPACITY = 0.55;
const QUARTER = Math.PI / 2;
// Offsets the noise per face so the two walls do not mirror each other.
const FACE_SEEDS = [0, 3.7, 7.1] as const;
const TIME_WRAP_SECONDS = 600;

type Hideable = { visible: boolean };

type ClippingTarget = {
  localClippingEnabled: boolean;
};

export type InteriorCutaway = {
  setActive(active: boolean): void;
  setBody(id: string | null): void;
  setHighlight(layerId: string | null): void;
  /**
   * Screen position, CSS px, of the chosen layer and of the body it belongs
   * to, for its label. False when no layer is shown.
   */
  readLabel(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    out: CutawayLabelPoint,
  ): boolean;
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

export type CutawayLabelPoint = {
  anchorX: number;
  anchorY: number;
  centerX: number;
  centerY: number;
  radiusPx: number;
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
  /** Radii on the drawing, scene units. */
  inner: number;
  outer: number;
  /** One per face, in `FACE_SHADES` order. */
  materials: CutawayFaceMaterial[];
  /** Face plus outline, one per face; moved along `FACE_LIFT`. */
  slots: Group[];
  outlines: LineSegments[];
  outlineMaterial: LineBasicMaterial;
  /** 1 when this layer is the chosen one. */
  emphasis: number;
  /** 1 when another layer is the chosen one. */
  dim: number;
};

// Unit direction from each face into the removed eighth, in the face
// parent's frame. Same order as `FACE_SHADES`.
const FACE_LIFT = [
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
] as const;

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

/** One layer's edge: both arcs and the two straight sides, in XY. */
function outlineGeometry(inner: number, outer: number): BufferGeometry {
  const points: number[] = [];
  for (const radius of inner === 0 ? [outer] : [inner, outer]) {
    for (let step = 0; step < ARC_SEGMENTS; step += 1) {
      const from = (step / ARC_SEGMENTS) * QUARTER;
      const to = ((step + 1) / ARC_SEGMENTS) * QUARTER;
      points.push(
        Math.cos(from) * radius,
        Math.sin(from) * radius,
        0,
        Math.cos(to) * radius,
        Math.sin(to) * radius,
        0,
      );
    }
  }
  points.push(inner, 0, 0, outer, 0, 0, 0, inner, 0, 0, outer, 0);
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
  const scratch = new Color();
  const gray = new Color();
  const anchor = new Vector3();
  const center = new Vector3();
  const edge = new Vector3();
  const cameraRight = new Vector3();
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
  let sceneRadius = 0;
  // Shared by every face material: one write moves all moving textures.
  const time = { value: 0 };
  const radiusUniform = { value: 1 };
  // True when the shown body has a layer whose texture drifts.
  let moving = false;
  let disposed = false;

  return { setActive, setBody, setHighlight, readLabel, update, dispose };

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
    if (options.reducedMotion.matches) {
      settleHighlight(Number.POSITIVE_INFINITY);
    }
    paintLayers();
  }

  function readLabel(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    out: CutawayLabelPoint,
  ): boolean {
    if (disposed || !group.visible || highlight === null || !captured) {
      return false;
    }
    const layer = layers.find((entry) => entry.id === highlight);
    if (layer === undefined) {
      return false;
    }
    const mid = (layer.inner + layer.outer) / 2;
    const lift =
      (CUTAWAY_FACE_OFFSET + HIGHLIGHT_LIFT * layer.emphasis) * sceneRadius;
    anchor.set(Math.cos(LABEL_ANGLE) * mid, lift, Math.sin(LABEL_ANGLE) * mid);
    group.updateMatrixWorld();
    anchor.applyMatrix4(group.matrixWorld);
    center.copy(group.position);
    camera.updateMatrixWorld();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    edge.copy(center).addScaledVector(cameraRight, sceneRadius);
    anchor.project(camera);
    center.project(camera);
    edge.project(camera);
    if (anchor.z > 1 || center.z > 1) {
      return false;
    }
    out.anchorX = (anchor.x * 0.5 + 0.5) * width;
    out.anchorY = (-anchor.y * 0.5 + 0.5) * height;
    out.centerX = (center.x * 0.5 + 0.5) * width;
    out.centerY = (-center.y * 0.5 + 0.5) * height;
    const edgeX = (edge.x * 0.5 + 0.5) * width;
    const edgeY = (-edge.y * 0.5 + 0.5) * height;
    out.radiusPx = Math.hypot(edgeX - out.centerX, edgeY - out.centerY);
    return true;
  }

  /**
   * Moves every layer's emphasis and dim toward the current choice.
   * An infinite step settles them at once. True when anything changed.
   */
  function settleHighlight(dtSeconds: number): boolean {
    let moving = false;
    for (const layer of layers) {
      const chosen = highlight !== null && layer.id === highlight;
      const dimmed = highlight !== null && !chosen;
      const emphasis = settle(layer.emphasis, chosen ? 1 : 0, dtSeconds);
      const dim = settle(layer.dim, dimmed ? 1 : 0, dtSeconds);
      if (emphasis !== layer.emphasis || dim !== layer.dim) {
        moving = true;
      }
      layer.emphasis = emphasis;
      layer.dim = dim;
    }
    if (moving) {
      placeSlots();
    }
    return moving;
  }

  function settle(current: number, target: number, dtSeconds: number): number {
    return Number.isFinite(dtSeconds)
      ? stepToward(current, target, dtSeconds, CUTAWAY_HIGHLIGHT_SECONDS)
      : target;
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
    if (moving && !reduced) {
      // Wraps long before float precision in the shader suffers.
      time.value = (time.value + dtSeconds) % TIME_WRAP_SECONDS;
    }
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
      if (settleHighlight(Number.POSITIVE_INFINITY)) {
        paintLayers();
      }
    } else {
      const opening = progress < 1;
      if (opening) {
        progress = Math.min(1, progress + dtSeconds / CUTAWAY_OPEN_SECONDS);
      }
      if (settleHighlight(dtSeconds) || opening) {
        paintLayers();
      }
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
    sceneRadius = radius;
    radiusUniform.value = radius;
    moving = false;
    const parents = [wallFixed, wallSwing, floor] as const;
    const outlineShift = 0.5 * CUTAWAY_FACE_OFFSET * radius;
    for (let index = 0; index < entry.layers.length; index += 1) {
      const layer = entry.layers[index];
      if (layer === undefined) {
        continue;
      }
      const { inner, outer } = layerRadii(entry, index, radius);
      const floorGeometry = quarterGeometry(inner, outer);
      // Walls stand in the XZ plane: turn the XY quarter up around X.
      const wallGeometry = floorGeometry.clone().rotateX(QUARTER);
      const floorOutline = outlineGeometry(inner, outer);
      const wallOutline = floorOutline.clone().rotateX(QUARTER);
      geometries.push(wallGeometry, floorGeometry, wallOutline, floorOutline);
      if (MOVING_TEXTURES.has(layer.texture)) {
        moving = true;
      }
      const outlineMaterial = new LineBasicMaterial({
        color: OUTLINE_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const materials: CutawayFaceMaterial[] = [];
      const slots: Group[] = [];
      const outlines: LineSegments[] = [];
      for (let face = 0; face < parents.length; face += 1) {
        const parent = parents[face];
        const lift = FACE_LIFT[face];
        if (parent === undefined || lift === undefined) {
          continue;
        }
        const isFloor = parent === floor;
        const material = createCutawayFaceMaterial(
          layer.texture,
          FACE_SEEDS[face] ?? 0,
          time,
          radiusUniform,
        );
        const mesh = new Mesh(isFloor ? floorGeometry : wallGeometry, material);
        mesh.name = layer.id;
        const outline = new LineSegments(
          isFloor ? floorOutline : wallOutline,
          outlineMaterial,
        );
        outline.name = 'interior-outline';
        outline.visible = false;
        outline.position.set(
          lift[0] * outlineShift,
          lift[1] * outlineShift,
          lift[2] * outlineShift,
        );
        const slot = new Group();
        slot.add(mesh, outline);
        parent.add(slot);
        materials.push(material);
        slots.push(slot);
        outlines.push(outline);
      }
      layers.push({
        id: layer.id,
        base: new Color(layer.color),
        inner,
        outer,
        materials,
        slots,
        outlines,
        outlineMaterial,
        emphasis: 0,
        dim: 0,
      });
    }

    const borders = borderGeometry(entry, radius);
    const wallBorders = borders.clone().rotateX(QUARTER);
    geometries.push(borders, wallBorders);
    const lineOffset = CUTAWAY_FACE_OFFSET * radius * 1.5;
    addBorder(wallFixed, wallBorders, 0, lineOffset, 0);
    addBorder(wallSwing, wallBorders, 0, -lineOffset, 0);
    addBorder(floor, borders, 0, 0, lineOffset);
    settleHighlight(Number.POSITIVE_INFINITY);
    placeSlots();
    paintLayers();
  }

  /** Puts each face at its offset plus the chosen layer's lift. */
  function placeSlots(): void {
    for (const layer of layers) {
      const distance =
        (CUTAWAY_FACE_OFFSET + HIGHLIGHT_LIFT * layer.emphasis) * sceneRadius;
      for (let face = 0; face < layer.slots.length; face += 1) {
        const slot = layer.slots[face];
        const lift = FACE_LIFT[face];
        if (slot === undefined || lift === undefined) {
          continue;
        }
        slot.position.set(
          lift[0] * distance,
          lift[1] * distance,
          lift[2] * distance,
        );
      }
      layer.outlineMaterial.opacity = OUTLINE_OPACITY * layer.emphasis;
      for (const outline of layer.outlines) {
        outline.visible = layer.emphasis > 0;
      }
    }
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
      if (layer.dim > 0) {
        const luminance =
          0.2126 * scratch.r + 0.7152 * scratch.g + 0.0722 * scratch.b;
        gray.setRGB(luminance, luminance, luminance);
        scratch.lerp(gray, layer.dim * (1 - DIM_SATURATION));
        scratch.multiplyScalar(1 - layer.dim * (1 - DIM_BRIGHTNESS));
      }
      for (let face = 0; face < layer.materials.length; face += 1) {
        const material = layer.materials[face];
        const shade = FACE_SHADES[face] ?? 1;
        material?.uniforms.uColor.value.copy(scratch).multiplyScalar(shade);
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
      layer.outlineMaterial.dispose();
    }
    layers.length = 0;
  }
}
