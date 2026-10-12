import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';
import { createIntroReveal } from '@ui/introReveal.ts';

import { createDisposables } from './disposables.ts';
import { sessionStore } from './storage.ts';
import type { OverlayRig } from './wireOverlays.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { UiRig } from './wireUi.ts';
import type { ViewRig } from './wireView.ts';

export type IntroInputs = {
  search: string;
  /** A link with a body in it starts in that view: no intro. */
  hasStartBody: boolean;
  viewRig: ViewRig;
  selectionRig: SelectionRig;
  uiRig: UiRig;
  overlayRig: OverlayRig;
};

/**
 * Whether the intro plays (EMI-248): once per session, and never with
 * `?debug=1` (the tests need a steady first frame) unless `?intro=1` asks.
 */
export function shouldPlayIntro(
  search: string,
  hasStartBody: boolean,
  playedThisSession: boolean,
): boolean {
  if (hasStartBody || playedThisSession) {
    return false;
  }
  if (isDebugEnabled(search)) {
    return new URLSearchParams(search).get('intro') === '1';
  }
  return true;
}

/**
 * The first-visit intro: the camera flies down to the start view while the
 * panels come in one after another. Any input ends it at once, in its final
 * state. With reduced motion there is no flight; the panels only fade in.
 */
export function wireIntro({
  search,
  hasStartBody,
  viewRig,
  selectionRig,
  uiRig,
  overlayRig,
}: IntroInputs) {
  const stack = createDisposables();
  const store = sessionStore();
  let playedThisSession = false;
  try {
    playedThisSession = store.getItem('intro.done') === '1';
  } catch {
    // Blocked storage: the intro plays once per page load.
  }
  const play = shouldPlayIntro(search, hasStartBody, playedThisSession);
  const timePanel = document.querySelector('#time-controls');
  const reveal = createIntroReveal({
    panels: play
      ? [
          uiRig.pageHeader,
          uiRig.viewControls.element,
          uiRig.bodiesPanel.element,
          uiRig.bodiesDrawer.openButton,
          timePanel instanceof HTMLElement ? timePanel : null,
          // The pilot training comes last.
          overlayRig.coachElement,
        ]
      : [],
    staggerMs: CAMERA_CONFIG.introPanelStaggerMs,
  });
  stack.add(reveal.dispose);
  let active = false;
  let started = false;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;

  // Before the first paint, so the panels never flash in the final layout.
  if (play) {
    reveal.hide();
    // If the first frame never comes, the page must not stay empty.
    safetyTimer = setTimeout(() => {
      end();
    }, 8000);
    stack.add(() => {
      if (safetyTimer !== null) {
        clearTimeout(safetyTimer);
      }
    });
  }

  function end(): void {
    if (!active && !reveal.isPending()) {
      return;
    }
    active = false;
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    selectionRig.director.finishIntro();
    reveal.finish();
    document.removeEventListener('pointerdown', end, true);
    document.removeEventListener('wheel', end, true);
    document.removeEventListener('keydown', end, true);
  }

  return {
    /** Called once the first frame is on screen. */
    start(): void {
      if (!play || started) {
        return;
      }
      started = true;
      active = true;
      try {
        store.setItem('intro.done', '1');
      } catch {
        // Not saved: it may play again after a reload.
      }
      document.addEventListener('pointerdown', end, true);
      document.addEventListener('wheel', end, true);
      document.addEventListener('keydown', end, true);
      if (viewRig.reducedMotion.matches) {
        // No flight: every panel fades in at once.
        end();
        return;
      }
      selectionRig.director.startIntro(() => {
        reveal.finish();
        end();
      });
      reveal.start(
        Math.max(
          0,
          CAMERA_CONFIG.introSeconds * 1000 - CAMERA_CONFIG.introPanelsMs,
        ),
      );
    },
    /** For the debug hook. */
    getState(): { played: boolean; active: boolean } {
      return { played: started, active: selectionRig.director.isIntroActive() };
    },
    dispose: stack.disposeAll,
  };
}

export type IntroRig = ReturnType<typeof wireIntro>;
