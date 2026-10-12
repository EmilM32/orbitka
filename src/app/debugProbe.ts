import { bodies } from '@data/bodies.ts';
import type { CameraControllerState } from '@render/cameraController.ts';
import type { CameraFlightSnapshot } from '@render/cameraDirector.ts';
import { ORBIT_GAP_RADIUS_FACTOR } from '@render/orbitLines.ts';
import { getBodyScenePosition } from '@render/scenePosition.ts';
import { getBodyScreenPositions } from '@render/screenPositions.ts';

import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { TimeRig } from './wireTime.ts';
import type { ViewRig } from './wireView.ts';

export type DebugProbeInputs = {
  canvas: HTMLCanvasElement;
  viewRig: ViewRig;
  sceneRig: SceneRig;
  selectionRig: SelectionRig;
  timeRig: TimeRig;
  readFrameCount: () => number;
  readFrameSnapshot: () => {
    days: number;
    earth: { x: number; y: number; z: number };
  } | null;
  readPresetId: () => string | null;
  readRenderStats: () => ReturnType<
    NonNullable<typeof window.__orbitka>['getRenderStats']
  >;
  readQuality: () => ReturnType<
    NonNullable<typeof window.__orbitka>['getQuality']
  >;
};

function materialOpacity(object: unknown): number {
  if (
    typeof object !== 'object' ||
    object === null ||
    !('material' in object)
  ) {
    return 0;
  }

  const material = (object as { material: unknown }).material;
  const entry = Array.isArray(material) ? material[0] : material;
  if (typeof entry !== 'object' || entry === null || !('opacity' in entry)) {
    return 0;
  }

  const opacity = (entry as { opacity: unknown }).opacity;
  return typeof opacity === 'number' && Number.isFinite(opacity) ? opacity : 0;
}

/** Installs `window.__orbitka` for tests; the returned function removes it. */
export function installDebugProbe({
  canvas,
  viewRig,
  sceneRig,
  selectionRig,
  timeRig,
  readFrameCount,
  readFrameSnapshot,
  readPresetId,
  readRenderStats,
  readQuality,
}: DebugProbeInputs): () => void {
  const { view, cameraController } = viewRig;
  const { bodyView, orbitLines, textureStore } = sceneRig;
  const { selection, director, directorBodies, viewInsets, gap } = selectionRig;
  const { clock } = timeRig;
  const screenEntries: {
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }[] = [];
  for (const body of bodies) {
    const mesh = bodyView.meshes.get(body.id);
    if (mesh !== undefined) {
      screenEntries.push({
        id: body.id,
        type: body.type,
        position: mesh.position,
      });
    }
  }
  const cameraState: CameraControllerState = {
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  const flightState: CameraFlightSnapshot = {
    active: 0,
    kind: 0,
    progress: 0,
  };
  const radiusById = new Map<string, number>();
  for (const body of directorBodies) {
    radiusById.set(body.id, body.displayRadius);
  }
  const planetIds: string[] = [];
  for (const body of selectionRig.selectable) {
    if (body.type === 'planet') {
      planetIds.push(body.id);
    }
  }

  window.__orbitka = {
    get frameCount() {
      return readFrameCount();
    },
    getRenderStats() {
      return readRenderStats();
    },
    getBodyScreenPositions() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (screenEntries.length === 0 || width <= 0 || height <= 0) {
        return [];
      }

      return getBodyScreenPositions(screenEntries, view.camera, width, height);
    },
    getClock() {
      return {
        days: clock.days,
        speed: clock.speed,
        reversed: clock.reversed,
        paused: clock.paused,
        presetId: readPresetId(),
      };
    },
    getBodyScenePosition(id: string) {
      return getBodyScenePosition(bodyView.meshes, id);
    },
    getFrameSnapshot() {
      const snapshot = readFrameSnapshot();
      if (snapshot === null) {
        return null;
      }

      return {
        days: snapshot.days,
        earth: {
          x: snapshot.earth.x,
          y: snapshot.earth.y,
          z: snapshot.earth.z,
        },
      };
    },
    getCameraState() {
      cameraController.getState(cameraState);
      director.getFlightState(flightState);
      const selectedId = selection.getSelectedId();
      return {
        azimuthDeg: cameraState.azimuthDeg,
        polarDeg: cameraState.polarDeg,
        distance: cameraState.distance,
        distanceMin: cameraState.distanceMin,
        distanceMax: cameraState.distanceMax,
        targetX: cameraState.targetX,
        targetY: cameraState.targetY,
        targetZ: cameraState.targetZ,
        flightActive: flightState.active,
        flightKind: flightState.kind,
        flightProgress: flightState.progress,
        selectedRadius:
          selectedId === null ? 0 : (radiusById.get(selectedId) ?? 0),
      };
    },
    getSelectedId() {
      return selection.getSelectedId();
    },
    getViewInsets() {
      const current = viewInsets.get();
      return { right: current.right, bottom: current.bottom };
    },
    getTextureState() {
      return textureStore.getState();
    },
    getQuality() {
      return readQuality();
    },
    getOrbitState() {
      const opacities: number[] = [];
      for (const id of planetIds) {
        opacities.push(
          materialOpacity(orbitLines.group.getObjectByName(`orbit-${id}`)),
        );
      }
      return {
        visible: orbitLines.group.visible ? 1 : 0,
        opacities,
        gapRadius: gap.mesh === null ? 0 : gap.radius * ORBIT_GAP_RADIUS_FACTOR,
        hovered: selection.getHoveredId(),
      };
    },
  };

  return () => {
    delete window.__orbitka;
  };
}
