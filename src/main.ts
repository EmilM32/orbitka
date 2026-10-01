import './style.css';

import { createClock, daysFromDate } from '@core/clock.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';
import { createLoop } from '@core/loop.ts';
import { isStartPaused, parseStartDays } from '@core/startParams.ts';
import { bodies } from '@data/bodies.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createBodies } from '@render/bodies.ts';
import { createLights } from '@render/lights.ts';
import { createRenderer } from '@render/createRenderer.ts';
import { getRenderStats } from '@render/renderStats.ts';
import { getBodyScreenPositions } from '@render/screenPositions.ts';
import { createDebugSession } from '@ui/debugSession.ts';

type App = {
  dispose: () => void;
};

function findCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');

  if (!canvas) {
    throw new Error('Missing canvas element #viewport');
  }

  return canvas;
}

function mount(canvas: HTMLCanvasElement): App {
  const view = createRenderer(canvas);
  const bodyView = createBodies(bodies);
  view.scene.add(bodyView.group);
  view.scene.add(createLights());
  const search = window.location.search;
  const clock = createClock({
    startDays: parseStartDays(search, daysFromDate(new Date())),
  });
  if (isStartPaused(search)) {
    clock.pause();
  }
  const animator = createBodyAnimator(bodies, bodyView.meshes);
  animator.update(clock.days);
  const debugSession = createDebugSession(search, document.body);
  let lastUiMs = Number.NEGATIVE_INFINITY;

  if (isDebugEnabled(search)) {
    const screenEntries: {
      id: string;
      type: string;
      position: { x: number; y: number; z: number };
    }[] = [];
    window.__orbitka = {
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
      clock.tick(dtSeconds);
      animator.update(clock.days);
    },
    render() {
      view.syncPixelRatio();
      view.renderer.render(view.scene, view.camera);
      if (debugSession === null) {
        return;
      }

      const nowMs = performance.now();
      debugSession.tick(nowMs);
      if (nowMs - lastUiMs >= 100) {
        debugSession.update(getRenderStats(view.renderer));
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
      debugSession?.dispose();
      delete window.__orbitka;
      bodyView.dispose();
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
