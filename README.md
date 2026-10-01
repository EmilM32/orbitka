# Orbitka

Interactive educational simulation of the Solar System in three.js (12+).

## Running

Node.js `^24.0.0` (Active LTS), npm. The directory has `.nvmrc` (`24.21.0`). `.npmrc` sets `engine-strict=true`, so `npm ci` fails on a Node version outside `engines`.

```bash
npm ci
npm run dev
```

Open the address printed in the terminal.

## CI

Every pull request and every push to `main` runs the GitHub Actions workflow in `.github/workflows/ci.yml`. The `verify` job on Node 24 (the version from `.nvmrc`, the same major version as `engines`) runs `npm ci`, then `npm run verify`. Before a pull request, run `npm run verify` locally: the same command checks format (`format:check`), lint, typecheck, tests with coverage, and the build, and stops at the first failure. The check name to mark as required in branch protection for `main` is `verify`; a red result then blocks the merge. A new push to the same branch cancels the previous unfinished run.

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
- `npm run test:e2e` — Playwright smoke test (Chromium)

## Smoke test

The browser test checks application startup: no console errors, a non-empty canvas, and the Sun and planets. Locally:

```bash
npx playwright install chromium
npm run test:e2e
```

The `e2e` job in GitHub Actions runs the same test only on pull requests. A push to `main` does not start it.

Layer aliases always include a subpath (`@core/…`, `@sim/…`). A bare import `@core` works in Vite, but `tsc` reports TS2307.

## Layer boundaries

`npm run lint` enforces the ADR-002 dependency matrix: `data` imports no other layer, `sim` imports only `data`, `core` only `data` and `sim`, `content` only `data`, `render` only `core`, `sim`, and `data`, and `ui` only `core`, `data`, and `content`. `three` may be imported only in `src/render` and `tests/render`. Imports between layers use aliases; relative `./` and `../` are allowed only inside one layer.
