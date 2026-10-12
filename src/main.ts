import './style.css';
import '@ui/controls.ts';

import { mount } from '@app/mount.ts';
import type { App } from '@app/types.ts';
import pl from '@content/locales/pl.json' with { type: 'json' };
import bodyContentRaw from '@content/pl/bodies.json' with { type: 'json' };
import interiorContentRaw from '@content/pl/interiors.json' with { type: 'json' };
import { isWebGLUnavailable } from '@render/webglSupport.ts';
import { createI18n } from '@ui/i18n.ts';
import { showSceneUnavailable } from '@ui/sceneUnavailable.ts';
import '@ui/layout.ts';

function findCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');

  if (!canvas) {
    throw new Error('Missing canvas element #viewport');
  }

  return canvas;
}

// Vite keeps every replaced version of this module alive, so after HMR the
// module scope must not hold the renderer, the scene, or the old canvas.
function start(): App | null {
  const canvas = findCanvas();
  const i18n = createI18n(pl, 'pl-PL');
  try {
    return mount(canvas, { i18n, bodyContentRaw, interiorContentRaw });
  } catch (error) {
    if (!isWebGLUnavailable(error)) {
      throw error;
    }
    console.error(
      'WebGL is unavailable; showing a notice instead of the scene.',
      error.cause,
    );
    canvas.hidden = true;
    showSceneUnavailable(document.body, i18n, 'unsupported');
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
