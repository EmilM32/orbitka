import './style.css';
import '@ui/controls.ts';

import { parseBodyContentCatalog } from '@content/bodyContent.ts';
import pl from '@content/locales/pl.json' with { type: 'json' };
import bodyContentRaw from '@content/pl/bodies.json' with { type: 'json' };
import { createClock, daysFromDate } from '@core/clock.ts';
import { createCoachTracker } from '@core/coach.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';
import { createLoop } from '@core/loop.ts';
import { createReducedMotion } from '@core/reducedMotion.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { createSelection } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { createViewInsets } from '@core/viewInsets.ts';
import { isStartPaused, parseStartDays } from '@core/startParams.ts';
import { bodies } from '@data/bodies.ts';
import { radiusToScene } from '@sim/scale.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createMoonAnimator } from '@render/animateMoons.ts';
import { createBodies } from '@render/bodies.ts';
import { createBodyPicker } from '@render/bodyPicker.ts';
import { createBodyProjector } from '@render/bodyProjector.ts';
import { addDebugAxes } from '@render/debugAxes.ts';
import { createLights } from '@render/lights.ts';
import { addOrbitLines } from '@render/orbitLines.ts';
import {
  createCameraController,
  type CameraControllerState,
} from '@render/cameraController.ts';
import {
  createCameraDirector,
  type CameraFlightSnapshot,
} from '@render/cameraDirector.ts';
import { createCameraPointerInput } from '@render/cameraPointerInput.ts';
import { createCanvasKeyboard } from '@render/canvasKeyboard.ts';
import { createRenderer } from '@render/createRenderer.ts';
import { createRotationAnimator } from '@render/rotateBodies.ts';
import { getRenderStats, trackDebugDrawCalls } from '@render/renderStats.ts';
import { getBodyScenePosition as readBodyScenePosition } from '@render/scenePosition.ts';
import { getBodyScreenPositions } from '@render/screenPositions.ts';
import { createAnnouncer } from '@ui/announcer.ts';
import { createBodiesDrawer, type BodiesDrawer } from '@ui/bodiesDrawer.ts';
import { createBodiesPanel } from '@ui/bodiesPanel.ts';
import { createBodyCard } from '@ui/bodyCard.ts';
import { createCoachPanel, type CoachPanel } from '@ui/coachPanel.ts';
import { loadCoachDone, type CoachStorages } from '@ui/coachPreference.ts';
import { createBodyLabels } from '@ui/bodyLabels.ts';
import { createDebugSession } from '@ui/debugSession.ts';
import { createI18n } from '@ui/i18n.ts';
import { createLayoutObserver } from '@ui/layoutObserver.ts';
import { createPageHeader } from '@ui/pageHeader.ts';
import { createScaleNotice } from '@ui/scaleNotice.ts';
import { createSelectionRing } from '@ui/selectionRing.ts';
import { createTimeControls } from '@ui/timeControls.ts';
import { createViewControls } from '@ui/viewControls.ts';
import { createViewportFade } from '@ui/viewportFade.ts';
import '@ui/layout.ts';

type App = {
  dispose: () => void;
};

// The Galilean moons get card content in a later task (EMI-218 scope).
const BODIES_WITHOUT_CONTENT = new Set([
  'io',
  'europa',
  'ganymede',
  'callisto',
]);

function orbitStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    // Reading localStorage can throw. The group then stays in memory only.
    return null;
  }
}

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

function findCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');

  if (!canvas) {
    throw new Error('Missing canvas element #viewport');
  }

  return canvas;
}

function mount(canvas: HTMLCanvasElement): App {
  const view = createRenderer(canvas);
  const reducedMotion = createReducedMotion(window.matchMedia.bind(window));
  const cameraController = createCameraController({
    camera: view.camera,
    reducedMotion,
  });
  let cssWidth = document.body.clientWidth;
  let cssHeight = document.body.clientHeight;
  let simDt = 0;
  const unsubscribeResize = view.onResize((width, height) => {
    cssWidth = width;
    cssHeight = height;
    cameraController.setAspect(width / height);
  });
  const pointerInput = createCameraPointerInput({
    surface: canvas,
    controller: cameraController,
  });
  const bodyView = createBodies(bodies);
  view.scene.add(bodyView.group);
  const orbitLines = addOrbitLines(view.scene, bodies);
  const selectable = getSelectableBodies(bodies);
  const selection = createSelection(selectable.map((body) => body.id));
  const projectorEntries = [];
  const directorBodies = [];
  for (const body of selectable) {
    const mesh = bodyView.meshes.get(body.id);
    if (mesh === undefined) {
      continue;
    }
    const displayRadius = radiusToScene(body.radiusKm);
    projectorEntries.push({
      id: body.id,
      position: mesh.position,
      displayRadius,
    });
    directorBodies.push({
      id: body.id,
      object: mesh,
      displayRadius,
      isSun: body.type === 'star',
    });
  }
  const viewportFade = createViewportFade(canvas);
  const director = createCameraDirector({
    controller: cameraController,
    selection,
    bodies: directorBodies,
    reducedMotion,
    onJump() {
      viewportFade.play();
    },
  });
  const projector = createBodyProjector(projectorEntries, view);
  const picker = createBodyPicker({
    surface: canvas,
    frame: projector.frame,
    selection,
    pointerInput,
  });
  const ring = createSelectionRing(document.body, {
    selection,
    frame: projector.frame,
  });
  const unsubscribeSelection = selection.subscribe((event) => {
    if (event.kind === 'selected') {
      orbitLines.setSelectedBody(event.id);
      return;
    }
    if (event.kind === 'system') {
      orbitLines.setSelectedBody(null);
    }
  });
  view.scene.add(createLights());
  const search = window.location.search;
  const clock = createClock({
    startDays: parseStartDays(search, daysFromDate(new Date())),
  });
  if (isStartPaused(search)) {
    clock.pause();
  }
  const animator = createBodyAnimator(bodies, bodyView.meshes);
  const moonAnimator = createMoonAnimator(bodies, bodyView.meshes);
  const rotationAnimator = createRotationAnimator(bodies, bodyView.meshes);
  animator.update(clock.days);
  moonAnimator.update(clock.days, clock.daysPerSecond);
  rotationAnimator.update(clock.days, clock.daysPerSecond);
  const debug = isDebugEnabled(search);
  const debugAxes = debug ? addDebugAxes(bodies, bodyView.meshes) : null;
  const debugDraws = debug ? trackDebugDrawCalls(view.scene) : null;
  const i18n = createI18n(pl, 'pl-PL');
  // Validated at startup so a broken content file fails fast.
  const bodyContent = parseBodyContentCatalog(
    bodyContentRaw,
    bodies
      .filter((body) => !BODIES_WITHOUT_CONTENT.has(body.id))
      .map((body) => body.contentKey),
  );
  const canvasKeyboard = createCanvasKeyboard({
    surface: canvas,
    controller: cameraController,
    onShowSystem: () => {
      selection.showSystem();
    },
    ariaLabel: i18n.t('canvas.ariaLabel'),
  });
  const pageHeader = createPageHeader(document.body, i18n, canvas);
  const scaleNotice = createScaleNotice(pageHeader, i18n);
  let bodiesDrawer: BodiesDrawer | null = null;
  const bodiesPanel = createBodiesPanel(document.body, {
    bodies: selectable,
    selection,
    i18n,
    before: canvas,
    getFocusFallback: () => bodiesDrawer?.getFocusFallback() ?? null,
  });
  bodiesDrawer = createBodiesDrawer(document.body, {
    panel: bodiesPanel,
    selection,
    i18n,
    matchMedia: window.matchMedia.bind(window),
    before: canvas,
  });
  const viewControls = createViewControls(document.body, {
    i18n,
    selection,
    storage: orbitStorage(),
    onZoom: (factor) => {
      cameraController.zoomBy(factor, false);
    },
    onOrbitsChange: (visible) => {
      orbitLines.setOrbitLinesVisible(visible);
    },
    before: canvas.nextSibling ?? undefined,
  });
  const viewInsets = createViewInsets();
  const tabletQuery = window.matchMedia(
    `(min-width: ${VIEW_CONFIG.tabletMinWidthPx}px) and (max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  // After the canvas and before the view group in the Tab order (SPEC §8).
  const bodyCard = createBodyCard(document.body, {
    bodies,
    content: bodyContent,
    selection,
    insets: viewInsets,
    i18n,
    isTablet: () => tabletQuery.matches,
    before: viewControls.element,
    reducedMotion,
    focusOnClose: canvas,
  });
  const timeControls = createTimeControls(
    document.body,
    clock,
    i18n,
    viewControls.element.nextSibling,
  );
  // "Trening pilota" runs until it is finished or skipped once.
  const coachStorage: CoachStorages = {
    local: () => window.localStorage,
    session: () => window.sessionStorage,
    memory: { done: false },
  };
  let coachPanel: CoachPanel | null = null;
  let unsubscribeCoachInput: (() => void) | null = null;
  let unsubscribeCoachSelection: (() => void) | null = null;
  if (!loadCoachDone(coachStorage)) {
    const coach = createCoachTracker();
    unsubscribeCoachInput = cameraController.onCameraInput((input) => {
      coach.onCameraInput(input);
    });
    unsubscribeCoachSelection = selection.subscribe((event) => {
      if (event.kind === 'selected') {
        coach.onSelected();
      }
    });
    coachPanel = createCoachPanel(document.body, {
      tracker: coach,
      i18n,
      storage: coachStorage,
      insets: viewInsets,
      isTablet: () => tabletQuery.matches,
      leftEdge: () => bodiesPanel.element.getBoundingClientRect().right,
      matchMedia: window.matchMedia.bind(window),
      reducedMotion,
    });
  }
  const timePanel = document.querySelector('#time-controls');
  if (!(timePanel instanceof HTMLElement)) {
    throw new Error('Missing time controls element #time-controls');
  }
  const layoutObserver = createLayoutObserver({
    target: timePanel,
    root: document.documentElement,
  });
  const announcer = createAnnouncer(document.body, selection, i18n);
  const labels = createBodyLabels(document.body, {
    bodies: selectable,
    selection,
    i18n,
    frame: projector.frame,
  });
  const debugSession = createDebugSession(search, document.body);
  let lastUiMs = Number.NEGATIVE_INFINITY;
  let frameCount = 0;
  let presetId: string | null = null;
  let frameSnapshot: {
    days: number;
    earth: { x: number; y: number; z: number };
  } | null = null;
  let unsubscribeClock: (() => void) | null = null;

  if (debug) {
    unsubscribeClock = clock.subscribe((state) => {
      presetId = state.presetId;
    });
    const screenEntries: {
      id: string;
      type: string;
      position: { x: number; y: number; z: number };
    }[] = [];
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
    for (const body of selectable) {
      if (body.type === 'planet') {
        planetIds.push(body.id);
      }
    }
    window.__orbitka = {
      get frameCount() {
        return frameCount;
      },
      getRenderStats() {
        return getRenderStats(view.renderer, debugDraws?.count ?? 0);
      },
      getBodyScreenPositions() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (screenEntries.length === 0 || width <= 0 || height <= 0) {
          return [];
        }

        return getBodyScreenPositions(
          screenEntries,
          view.camera,
          width,
          height,
        );
      },
      getClock() {
        return {
          days: clock.days,
          speed: clock.speed,
          reversed: clock.reversed,
          paused: clock.paused,
          presetId,
        };
      },
      getBodyScenePosition(id: string) {
        return readBodyScenePosition(bodyView.meshes, id);
      },
      getFrameSnapshot() {
        if (frameSnapshot === null) {
          return null;
        }

        return {
          days: frameSnapshot.days,
          earth: {
            x: frameSnapshot.earth.x,
            y: frameSnapshot.earth.y,
            z: frameSnapshot.earth.z,
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
        };
      },
    };

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
  }

  const loop = createLoop({
    update(dtSeconds) {
      simDt = dtSeconds;
      clock.tick(dtSeconds);
      animator.update(clock.days);
      moonAnimator.update(clock.days, clock.daysPerSecond);
      rotationAnimator.update(clock.days, clock.daysPerSecond);
      director.update(dtSeconds);
      cameraController.update(dtSeconds);
      announcer.update(dtSeconds);
      if (!debug) {
        return;
      }

      // After the animators, so days and the Earth mesh are from this frame.
      // Stays null until the loop has run once. The mount-time animator update
      // is not a frame.
      const earth = readBodyScenePosition(bodyView.meshes, 'earth');
      frameSnapshot = earth === null ? null : { days: clock.days, earth };
    },
    render() {
      view.syncPixelRatio();
      debugDraws?.reset();
      view.renderer.render(view.scene, view.camera);
      if (cssWidth > 0 && cssHeight > 0) {
        projector.update(view.camera, cssWidth, cssHeight);
        labels.update(cssWidth, cssHeight, simDt);
      }
      ring.update(simDt);
      if (debugSession === null) {
        return;
      }

      frameCount += 1;
      const nowMs = performance.now();
      debugSession.tick(nowMs);
      if (nowMs - lastUiMs >= 100) {
        debugSession.update(
          getRenderStats(view.renderer, debugDraws?.count ?? 0),
        );
        lastUiMs = nowMs;
      }
    },
    requestFrame: view.requestFrame,
    cancelFrame: view.cancelFrame,
  });

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      loop.stop();
    } else {
      loop.start();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (!document.hidden) {
    loop.start();
  }

  return {
    dispose() {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      announcer.dispose();
      bodiesPanel.dispose();
      bodiesDrawer?.dispose();
      bodyCard.dispose();
      coachPanel?.dispose();
      unsubscribeCoachInput?.();
      unsubscribeCoachSelection?.();
      labels.dispose();
      pageHeader.remove();
      director.dispose();
      viewportFade.dispose();
      ring.dispose();
      picker.dispose();
      projector.dispose();
      unsubscribeSelection();
      selection.dispose();
      scaleNotice.dispose();
      viewControls.dispose();
      layoutObserver.dispose();
      timeControls.dispose();
      debugSession?.dispose();
      unsubscribeClock?.();
      unsubscribeClock = null;
      delete window.__orbitka;
      debugDraws?.dispose();
      debugAxes?.dispose();
      orbitLines.dispose();
      bodyView.dispose();
      unsubscribeResize();
      canvasKeyboard.dispose();
      pointerInput.dispose();
      cameraController.dispose();
      reducedMotion.dispose();
      view.dispose();
    },
  };
}

// Vite keeps every replaced version of this module alive, so after HMR the
// module scope must not hold the renderer, the scene, or the old canvas.
let app: App | null = mount(findCanvas());

const dispose = (): void => {
  app?.dispose();
  app = null;
};

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept();
}
