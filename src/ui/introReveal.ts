import './introReveal.css';

export type IntroRevealOptions = {
  /** The panels in the order they appear; a missing one is skipped. */
  panels: readonly (HTMLElement | null | undefined)[];
  staggerMs: number;
  /** Timers: tests pass fakes. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type IntroReveal = {
  /** Hides every panel at once, before the first paint. */
  hide(): void;
  /** Shows the panels one after another, the first after `delayMs`. */
  start(delayMs: number): void;
  /** Shows every panel now (the user did something, or the intro ended). */
  finish(): void;
  isPending(): boolean;
  dispose(): void;
};

// A transition may still be running when its class goes: the class that makes
// it animate stays this long after the panel is shown.
const SETTLE_MS = 400;

export function createIntroReveal(options: IntroRevealOptions): IntroReveal {
  const panels = options.panels.filter(
    (panel): panel is HTMLElement => panel !== null && panel !== undefined,
  );
  const setTimer =
    options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  const timers: unknown[] = [];
  let hidden = false;
  let disposed = false;

  function show(panel: HTMLElement): void {
    panel.classList.remove('intro-hidden');
    timers.push(
      setTimer(() => {
        panel.classList.remove('intro-panel');
      }, SETTLE_MS),
    );
  }

  function cancel(): void {
    for (const handle of timers.splice(0)) {
      clearTimer(handle);
    }
  }

  return {
    hide() {
      if (disposed || hidden) {
        return;
      }
      hidden = true;
      for (const panel of panels) {
        panel.classList.add('intro-panel', 'intro-hidden');
      }
    },
    start(delayMs) {
      if (disposed || !hidden) {
        return;
      }
      panels.forEach((panel, index) => {
        timers.push(
          setTimer(
            () => {
              if (panel.classList.contains('intro-hidden')) {
                show(panel);
              }
            },
            delayMs + index * options.staggerMs,
          ),
        );
      });
    },
    finish() {
      if (disposed || !hidden) {
        return;
      }
      cancel();
      hidden = false;
      for (const panel of panels) {
        if (panel.classList.contains('intro-hidden')) {
          show(panel);
        } else {
          panel.classList.remove('intro-panel');
        }
      }
    },
    isPending() {
      return (
        hidden &&
        panels.some((panel) => panel.classList.contains('intro-hidden'))
      );
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancel();
      for (const panel of panels) {
        panel.classList.remove('intro-panel', 'intro-hidden');
      }
    },
  };
}
