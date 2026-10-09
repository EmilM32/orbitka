# Orbitka

Interactive educational simulation of the Solar System in three.js (12+).

## Running

Node.js `^24.0.0` (Active LTS), npm. The directory has `.nvmrc` (`24.21.0`). `.npmrc` sets `engine-strict=true`, so `npm ci` fails on a Node version outside `engines`.

```bash
npm ci
npm run dev
```

Open the address printed in the terminal.

### Production build

```bash
npm run build      # tsc --noEmit && vite build, output in dist/
npm run preview    # serves dist/ with vite preview
```

`vite preview` prints the address, by default `http://localhost:4173`. Options go after `--`:

- `npm run preview -- --host` exposes the app on the local network (for example to test on a tablet).
- `npm run preview -- --port 5000` changes the port.

`preview` serves the last build, so run `npm run build` again after changing the code. Use `npm run dev` for day-to-day work. Deployment is deferred; `vite preview` is the only supported way to run the build for now.

## CI

Every pull request and every push to `main` runs the GitHub Actions workflow in `.github/workflows/ci.yml`, with two jobs: `verify` and `e2e`. A push to any other branch runs nothing until it has a pull request. The `verify` job on Node 24 (the version from `.nvmrc`, the same major version as `engines`) runs `npm ci`, then `npm run verify`. Before a pull request, run `npm run verify` locally: the same command checks format (`format:check`), lint, typecheck, tests with coverage, and the build, and stops at the first failure. The check name to mark as required in branch protection for `main` is `verify`; a red result then blocks the merge. A new push to the same branch cancels the previous unfinished run.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — typecheck of `src` and a production build
- `npm run preview` — preview of the build
- `npm run typecheck` — `tsc` for `src` (`tsconfig.json`), config files (`tsconfig.node.json`), and tests (`tsconfig.test.json`)
- `npm run lint` — ESLint
- `npm run format` — Prettier for the whole repository
- `npm run format:check` — format check without writing
- `npm run verify` — format, lint, typecheck, tests with coverage, and the build; run it before a pull request
- `npm run test` — Vitest
- `npm run test:coverage` — Vitest with a line-coverage threshold for `src/sim`
- `npm run test:e2e` — Playwright tests in Chromium (smoke, moons, and time controls)

## Smoke test

The browser test checks application startup: no console errors, a non-empty canvas, the Sun and planets, and the draw-call budget (`DRAW_CALL_BUDGET` = 25 for the scene without debug objects, ADR-006). `tests/e2e/timeControls.spec.ts` checks that pause, speed, reverse, the speed slider, and the date drive the simulation. Tests wait for rendered frames, not for fixed time: with `?debug=1` on the counter `window.__orbitka.frameCount`, without it on browser animation frames. Locally:

```bash
npx playwright install chromium
npm run test:e2e
```

The `e2e` job in GitHub Actions runs the same test on every pull request and on every push to `main`, so a commit that lands on `main` without a pull request still gets the browser test. When it fails, the job uploads `playwright-report/` and `test-results/` as artifacts.

Layer aliases always include a subpath (`@core/…`, `@sim/…`). A bare import `@core` works in Vite, but `tsc` reports TS2307.

## Layer boundaries

`npm run lint` enforces the ADR-002 dependency matrix: `data` imports no other layer, `sim` imports only `data`, `core` only `data` and `sim`, `content` only `data`, `render` only `core`, `sim`, and `data`, and `ui` only `core`, `data`, and `content`. `three` may be imported only in `src/render` and `tests/render`. Imports between layers use aliases; relative `./` and `../` are allowed only inside one layer.
