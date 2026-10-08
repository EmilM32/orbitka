import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 1280, height: 720 };

// The one tolerance for visual snapshots (tests/e2e/visual.spec.ts): the
// share of pixels that may differ before a snapshot fails. The DOM renders
// the same in the pinned image, so this only absorbs stray antialiasing.
// 0.001 was too loose: recoloring the time slider (about 1000 pixels) passed
// at 1280×720. 0.0001 is 92 pixels at 1280×720 and 207 at 1920×1080.
const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.0001;

export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 1 : 0,
  // The HTML report shows expected, actual and diff images of a failed
  // snapshot. CI uploads it as an artifact.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    viewport,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
      },
    },
  ],
});
