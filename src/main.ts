import './style.css';
import '@ui/controls.ts';

import { parseBodyContentCatalog } from '@content/bodyContent.ts';
import pl from '@content/locales/pl.json' with { type: 'json' };
import bodyContentRaw from '@content/pl/bodies.json' with { type: 'json' };
import { createClock, daysFromDate } from '@core/clock.ts';
import { shouldShowRail } from '@core/bodiesRail.ts';
import { createCoachTracker } from '@core/coach.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';
import {
  createQualityStore,
  loadStoredQuality,
  resolveInitialQuality,
  type QualityLevel,
} from '@core/quality.ts';
import { createLoop } from '@core/loop.ts';
import { createReducedMotion } from '@core/reducedMotion.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { createSelection } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { createViewInsets } from '@core/viewInsets.ts';
import { zoomLimitState } from '@core/zoomLimits.ts';
import { STAR_COUNTS } from '@core/starfield.ts';
import { isStartPaused, parseStartDays } from '@core/startParams.ts';
import { bodies } from '@data/bodies.ts';
import { radiusToScene } from '@sim/scale.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createMoonAnimator } from '@render/animateMoons.ts';
import { applyQualityLevel } from '@render/applyQuality.ts';
import { createBodies } from '@render/bodies.ts';
import { createBodyPicker } from '@render/bodyPicker.ts';
import { createBodyProjector } from '@render/bodyProjector.ts';
import { addDebugAxes } from '@render/debugAxes.ts';
import { createLights } from '@render/lights.ts';
import { ORBIT_GAP_RADIUS_FACTOR, addOrbitLines } from '@render/orbitLines.ts';
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
import { createFrameRenderer } from '@render/frameRenderer.ts';
import { createRenderer } from '@render/createRenderer.ts';
import { isWebGLUnavailable } from '@render/webglSupport.ts';
import { createRotationAnimator } from '@render/rotateBodies.ts';
import { createStarfield } from '@render/starfield.ts';
import { createSunGlow } from '@render/sunGlow.ts';
import { getRenderStats, trackDebugDrawCalls } from '@render/renderStats.ts';
import { createTextureMemory } from '@render/textureMemory.ts';
import {
  TEXTURE_SOURCE,
  createTextureLoader,
  createTextureStore,
} from '@render/textureStore.ts';
import { getBodyScenePosition as readBodyScenePosition } from '@render/scenePosition.ts';
import { getBodyScreenPositions } from '@render/screenPositions.ts';
import { createViewOffsetRig } from '@render/viewOffset.ts';
import { createAnnouncer } from '@ui/announcer.ts';
import { createBodiesDrawer, type BodiesDrawer } from '@ui/bodiesDrawer.ts';
import { createBodiesPanel } from '@ui/bodiesPanel.ts';
import { createBodyCard } from '@ui/bodyCard.ts';
import { createCoachPanel, type CoachPanel } from '@ui/coachPanel.ts';
import { loadCoachDone, type CoachStorages } from '@ui/coachPreference.ts';
import { createBodyLabels } from '@ui/bodyLabels.ts';
import { createLabelObstacles } from '@ui/labelObstacles.ts';
import { createDebugSession } from '@ui/debugSession.ts';
import { createI18n } from '@ui/i18n.ts';
import { showSceneUnavailable } from '@ui/sceneUnavailable.ts';
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

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Reading localStorage can throw (private mode). State then stays in memory.
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
  const frameRenderer = createFrameRenderer(view);
  // Every texture made in render is tracked here (ADR-010 point 8).
  const textureMemory = createTextureMemory();
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
  const storage = localStore();
  const search = window.location.search;
  const pointerCoarse = window.matchMedia('(pointer: coarse)').matches;
  const stored = loadStoredQuality(storage);
  const quality = createQualityStore(
    resolveInitialQuality({ search, pointerCoarse, ...stored }),
    storage,
    { fallbackLevel: pointerCoarse ? 'medium' : 'high' },
  );
  const starfield = createStarfield(STAR_COUNTS[quality.get()]);
  view.scene.add(starfield.points);
  const bodyView = createBodies(bodies, textureMemory);
  view.scene.add(bodyView.group);
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
  const sunMesh = bodyView.meshes.get('sun');
  const sunRadius = bodyView.radii.get('sun');
  const sunDef = bodies.find((body) => body.type === 'star');
  if (sunMesh === undefined || sunRadius === undefined || !sunDef) {
    throw new Error('Missing the Sun mesh');
  }
  const sunGlow = createSunGlow(sunRadius, sunDef.visual.color, textureMemory);
  sunMesh.add(sunGlow.sprite);
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
  const unsubscribeQuality = quality.subscribe(applyLevel);
  const orbitLines = addOrbitLines(view.scene, bodies);
  // The selected body the orbit lines leave a gap around (null = none).
  let gapMesh: ReturnType<typeof bodyView.meshes.get> | null = null;
  let gapRadius = 0;
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
    const framingRadius = bodyView.rings.get(body.id)?.framingRadius;
    projectorEntries.push({
      id: body.id,
      position: mesh.position,
      displayRadius,
      framingRadius,
    });
    directorBodies.push({
      id: body.id,
      object: mesh,
      displayRadius,
      framingRadius,
      isSun: body.type === 'star',
    });
  }
  const viewportFade = createViewportFade(canvas);
  const viewInsets = createViewInsets();
  const viewOffset = createViewOffsetRig({
    camera: view.camera,
    insets: viewInsets,
    reducedMotion,
    widthCss: cssWidth,
    heightCss: cssHeight,
  });
  const unsubscribeOffsetResize = view.onResize((width, height) => {
    viewOffset.resize(width, height);
  });
  const director = createCameraDirector({
    controller: cameraController,
    selection,
    bodies: directorBodies,
    reducedMotion,
    onJump() {
      viewportFade.play();
    },
    insets: viewInsets,
    viewport: {
      get width() {
        return cssWidth;
      },
      get height() {
        return cssHeight;
      },
    },
  });
  const projector = createBodyProjector(projectorEntries, view);
  // Labels also cover the moons, which are not selectable, so they get a
  // frame of their own: the picker and the ring keep the selectable bodies.
  const labelBodies = [];
  const labelEntries = [];
  for (const body of bodies) {
    const mesh = bodyView.meshes.get(body.id);
    const radius = bodyView.radii.get(body.id);
    if (mesh === undefined || radius === undefined) {
      continue;
    }
    labelEntries.push({
      id: body.id,
      position: mesh.position,
      displayRadius: radius,
    });
    labelBodies.push({
      id: body.id,
      radiusKm: body.radiusKm,
      parentId: body.parentId,
      color: body.visual.color,
    });
  }
  const labelProjector = createBodyProjector(labelEntries, view);
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
      gapMesh = bodyView.meshes.get(event.id) ?? null;
      gapRadius = gapMesh === null ? 0 : (bodyView.radii.get(event.id) ?? 0);
      textureStore.requestDetailed(event.id);
      return;
    }
    if (event.kind === 'system') {
      orbitLines.setSelectedBody(null);
      gapMesh = null;
      gapRadius = 0;
    }
  });
  view.scene.add(createLights());
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
  const readRenderStats = () =>
    getRenderStats(view.renderer, {
      debugDrawCalls: debugDraws?.count ?? 0,
      postFxDrawCalls: frameRenderer.getPostFxDrawCalls(),
      textureMiB: textureMemory.getMiB(),
    });
  const readQuality = () => {
    const summary = quality.getLastSummary();
    return {
      level: quality.get(),
      source: quality.getSource(),
      locked: quality.isLocked(),
      medianFps: summary?.medianFps ?? null,
      p90FrameMs: summary?.p90FrameMs ?? null,
      pixelRatio: view.getPixelRatio(),
    };
  };
  const i18n = createI18n(pl, 'pl-PL');
  // three stops the loop on context loss; the student gets a way out.
  const onContextLost = (): void => {
    console.error('WebGL context lost; the scene stopped rendering.');
    showSceneUnavailable(document.body, i18n, 'lost');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
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
  const scaleNotice = createScaleNotice(pageHeader, i18n, {
    textures: TEXTURE_SOURCE,
  });
  let bodiesDrawer: BodiesDrawer | null = null;
  const bodyById = new Map(bodies.map((body) => [body.id, body]));
  const bodiesPanel = createBodiesPanel(document.body, {
    bodies: selectable.map((body) => {
      const def = bodyById.get(body.id);
      return {
        id: body.id,
        color: def?.visual.color ?? '#ffffff',
        axisAu:
          def?.type === 'planet' ? (def.orbit?.semiMajorAxisAu ?? null) : null,
      };
    }),
    selection,
    i18n,
    before: canvas,
    getFocusFallback: () => bodiesDrawer?.getFocusFallback() ?? null,
    onUserCollapsedChange: () => {
      updateListMode();
    },
  });
  bodiesDrawer = createBodiesDrawer(document.body, {
    panel: bodiesPanel,
    selection,
    i18n,
    matchMedia: window.matchMedia.bind(window),
    before: canvas,
  });
  // The list folds into the rail beside an open card up to 1440 px; the
  // tablet drawer has no rail (SPEC §5.4).
  const tabletListQuery = window.matchMedia(
    `(max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  const railWidthQuery = window.matchMedia(
    `(max-width: ${VIEW_CONFIG.railMaxWidthPx}px)`,
  );
  const updateListMode = (): void => {
    const rail =
      !tabletListQuery.matches &&
      shouldShowRail({
        viewportWidthPx: window.innerWidth,
        hasSelection: selection.getSelectedId() !== null,
        userCollapsed: bodiesPanel.isUserCollapsed(),
      });
    bodiesPanel.setMode(rail ? 'rail' : 'list');
  };
  const unsubscribeListMode = selection.subscribe((event) => {
    if (event.kind !== 'hover') {
      updateListMode();
    }
  });
  tabletListQuery.addEventListener('change', updateListMode);
  railWidthQuery.addEventListener('change', updateListMode);
  const viewControls = createViewControls(document.body, {
    i18n,
    selection,
    storage,
    onZoom: (factor) => {
      cameraController.zoomBy(factor, false);
    },
    onOrbitsChange: (visible) => {
      orbitLines.setOrbitLinesVisible(visible);
    },
    onQualityChange: (level) => {
      quality.setOverride(level);
    },
    qualityValue: quality.getSource() === 'override' ? quality.get() : null,
    qualityLocked: quality.getSource() === 'param',
    before: canvas.nextSibling ?? undefined,
  });
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
  // Scene labels stay off the panels (EMI-234).
  const labelObstacles = createLabelObstacles({
    root: document.body,
    elements: () => [
      pageHeader,
      bodiesDrawer?.openButton,
      bodiesPanel.element,
      viewControls.element,
      bodyCard.element,
      timePanel,
      coachPanel?.element,
    ],
  });
  const labels = createBodyLabels(document.body, {
    bodies: labelBodies,
    selection,
    i18n,
    frame: labelProjector.frame,
    obstacles: labelObstacles,
  });
  const debugSession = createDebugSession(search, document.body);
  let lastUiMs = Number.NEGATIVE_INFINITY;
  let timeReady = false;
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
        return readRenderStats();
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
          gapRadius: gapMesh === null ? 0 : gapRadius * ORBIT_GAP_RADIUS_FACTOR,
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

  // Shared per-frame objects: the loop reads the zoom limits without
  // allocating.
  const zoomCamera: CameraControllerState = {
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 1,
    distanceMin: 1,
    distanceMax: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  const zoomLimits = { atMin: false, atMax: false };

  const loop = createLoop({
    update(dtSeconds) {
      simDt = dtSeconds;
      // The first frame after a start or a resume has dt = 0: no sample.
      if (dtSeconds > 0) {
        quality.sampleFrame(dtSeconds, !document.hidden);
      }
      clock.tick(dtSeconds);
      animator.update(clock.days);
      moonAnimator.update(clock.days, clock.daysPerSecond);
      rotationAnimator.update(clock.days, clock.daysPerSecond);
      director.update(dtSeconds);
      cameraController.update(dtSeconds);
      viewOffset.update(dtSeconds);
      starfield.update(view.camera);
      orbitLines.setGap(gapMesh?.position ?? null, gapRadius, view.camera);
      cameraController.getState(zoomCamera);
      zoomLimitState(
        zoomCamera.distance,
        zoomCamera.distanceMin,
        zoomCamera.distanceMax,
        zoomLimits,
      );
      viewControls.setZoomLimits(zoomLimits.atMin, zoomLimits.atMax);
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
      frameRenderer.render();
      if (!timeReady) {
        // The first frame is on screen: the time controls take input.
        timeReady = true;
        timeControls.setReady(true);
        // Textures load after the first frame, so the start is not delayed.
        textureStore.preloadBase();
      }
      if (cssWidth > 0 && cssHeight > 0) {
        projector.update(view.camera, cssWidth, cssHeight);
        labelProjector.update(view.camera, cssWidth, cssHeight);
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
        debugSession.update({ ...readRenderStats(), quality: readQuality() });
        lastUiMs = nowMs;
      }
    },
    requestFrame: view.requestFrame,
    cancelFrame: view.cancelFrame,
  });

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      // A hidden tab ends the window and the warmup; both start over on return.
      quality.sampleFrame(0, false);
      loop.stop();
    } else {
      loop.start();
    }
  };

  // The level for the next session is saved when the page goes away.
  const onPageHide = (): void => {
    quality.flush();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  if (!document.hidden) {
    loop.start();
  }

  return {
    dispose() {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      unsubscribeQuality();
      announcer.dispose();
      unsubscribeListMode();
      tabletListQuery.removeEventListener('change', updateListMode);
      railWidthQuery.removeEventListener('change', updateListMode);
      bodiesPanel.dispose();
      bodiesDrawer?.dispose();
      bodyCard.dispose();
      coachPanel?.dispose();
      unsubscribeCoachInput?.();
      unsubscribeCoachSelection?.();
      labels.dispose();
      labelObstacles.dispose();
      pageHeader.remove();
      director.dispose();
      unsubscribeOffsetResize();
      viewOffset.dispose();
      viewportFade.dispose();
      ring.dispose();
      picker.dispose();
      projector.dispose();
      labelProjector.dispose();
      unsubscribeSelection();
      selection.dispose();
      scaleNotice.dispose();
      viewControls.dispose();
      layoutObserver.dispose();
      timeControls.dispose();
      debugSession?.dispose();
      unsubscribeClock?.();
      unsubscribeClock = null;
      // dispose() forces a context loss itself, so stop listening first.
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete window.__orbitka;
      debugDraws?.dispose();
      debugAxes?.dispose();
      orbitLines.dispose();
      sunGlow.dispose();
      textureStore.dispose();
      bodyView.dispose();
      starfield.dispose();
      textureMemory.dispose();
      frameRenderer.dispose();
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
function start(): App | null {
  const canvas = findCanvas();
  try {
    return mount(canvas);
  } catch (error) {
    if (!isWebGLUnavailable(error)) {
      throw error;
    }
    console.error(
      'WebGL is unavailable; showing a notice instead of the scene.',
      error.cause,
    );
    canvas.hidden = true;
    showSceneUnavailable(document.body, createI18n(pl, 'pl-PL'), 'unsupported');
    return null;
  }
}

let app: App | null = start();

const dispose = (): void => {
  app?.dispose();
  app = null;
};

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept();
}
