// @vitest-environment jsdom

import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { createViewportFade } from '@ui/viewportFade.ts';

test('plays 150 ms opacity', () => {
  const calls: Array<{
    keyframes: Array<{ opacity: number }>;
    duration: number;
  }> = [];
  let cancelled = 0;
  const fade = createViewportFade({
    animate(keyframes, options) {
      calls.push({ keyframes, duration: options.duration });
      return {
        cancel() {
          cancelled += 1;
        },
      };
    },
  });

  fade.play();
  expect(calls).toHaveLength(1);
  expect(calls[0]?.duration).toBe(150);
  expect(calls[0]?.duration).toBe(CAMERA_CONFIG.reducedMotionFadeMs);
  expect(calls[0]?.keyframes).toEqual([{ opacity: 0.5 }, { opacity: 1 }]);

  fade.play();
  expect(cancelled).toBe(1);
  expect(calls).toHaveLength(2);

  fade.dispose();
  expect(cancelled).toBe(2);
  fade.dispose();
  fade.play();
  expect(calls).toHaveLength(2);

  const missing = createViewportFade({});
  expect(() => missing.play()).not.toThrow();
  missing.dispose();
});
