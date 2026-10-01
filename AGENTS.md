# Orbitka — agent instructions

Educational solar-system simulation in the browser. Audience 12+, UI copy in Polish, code in English, laptop and tablet, target about 60 FPS. The app is static: no backend, no accounts, no analytics.

## Where the truth lives

Work scope is in Linear, project [Orbitka](https://linear.app/emilm/project/orbitka-eccde281385d) (team EmilM). The issue description says what to build and what to leave alone. Accepted architecture decisions live as issues, not as files in the repo:

| ADR             | Issue                                                                                                  | Rule to keep                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 001 Stack       | [EMI-89](https://linear.app/emilm/issue/EMI-89/adr-001-stack-i-narzedzia)                              | Vite, TypeScript `strict`, three.js, plain DOM UI   |
| 002 Layers      | [EMI-91](https://linear.app/emilm/issue/EMI-91/adr-002-struktura-repo-i-modulow)                       | Directories below; `sim` stays free of three and UI |
| 003 Data        | [EMI-90](https://linear.app/emilm/issue/EMI-90/adr-003-model-danych-cial-niebieskich)                  | Keplerian elements in JSON, Newton solver           |
| 004 Scale       | [EMI-92](https://linear.app/emilm/issue/EMI-92/adr-004-uproszczona-skala-odleglosci-rozmiarow-i-czasu) | Distance `AU^0.5`, size `radiusKm^0.4`              |
| 005 Loop        | [EMI-93](https://linear.app/emilm/issue/EMI-93/adr-005-petla-renderowania-i-symulacji)                 | One loop, state = f(time), `dt` max 0.1 s           |
| 006 Performance | [EMI-94](https://linear.app/emilm/issue/EMI-94/adr-006-budzet-wydajnosci)                              | FPS budget, `pixelRatio`, local assets              |
| 007 Tests       | [EMI-95](https://linear.app/emilm/issue/EMI-95/adr-007-strategia-testow)                               | Vitest for the math, Playwright smoke               |
| 008 Language    | [EMI-176](https://linear.app/emilm/issue/EMI-176/adr-008-jezyk-kodu-i-interfejsu-tlumaczenia-ui-i18n)  | Code in English, UI copy in Polish from `pl.json`   |

A new decision that affects the whole project gets its own ADR in Linear. This file holds rules, not task history. Do not record milestone progress here.

## Stack

- npm. Node from `engines` in `package.json` (`^24.0.0`, Active LTS 24). `.nvmrc` pins `24.21.0`. Vite 8 accepts `>=22.12.0`; Node 20 is EOL and is not a supported runtime. When `node -v` is not 24, switch with nvm (`nvm use`) and leave the user's default Node version unchanged.
- Pin dependencies to exact versions, with no `^`. That applies especially to `three` and `@types/three`: a three upgrade is a deliberate change.
- Import only the classes you need from `three` (`import { Scene } from 'three'`).
- UI is plain DOM. No React, react-three-fiber, or Preact until an ADR says otherwise.
- TypeScript 6 rejects `baseUrl` (TS5101). Aliases live in `paths` as paths relative to `tsconfig.json` (`@core/*` → `./src/core/*`), with the same prefixes in `vite.config.ts`.
- Scene mount point: `<canvas id="viewport">`.
- Deployment is deferred. The app has to run through `npm run dev` and `vite preview`.

## Layers

| Directory       | Responsibility                                                                           |
| --------------- | ---------------------------------------------------------------------------------------- |
| `src/core`      | Loop, simulation clock, event bus                                                        |
| `src/data`      | `BodyDef`, body JSON, validation                                                         |
| `src/sim`       | Orbit and scale math. No imports of `three`, `@render`, or `@ui`                         |
| `src/render`    | Scene, materials, camera, orbit lines, labels                                            |
| `src/ui`        | DOM panels: time, body card, scale notice                                                |
| `src/content`   | Polish UI copy (`locales/pl.json`) and educational content, keyed by body `id`. No logic |
| `public/assets` | Textures and sounds, local files only                                                    |
| `tests/`        | Mirrors `src/` (`tests/sim/scale.test.ts`)                                               |

Allowed imports between layers (ADR-002, enforced by `npm run lint`): `data` imports nothing, `sim` only `data`, `core` only `data` and `sim`, `content` only `data`, `render` only `core`, `sim`, and `data`, `ui` only `core`, `data`, and `content`. `three` is allowed only in `src/render` and `tests/render`. Cross-layer imports use aliases; relative imports stay inside one layer.

`sim` returns positions in physical units (AU, km). Only `render` converts those to scene units.

## Language

ADR-008: code in English, everything the student sees in Polish.

- English: identifiers, comments, tests, docs, data in `src/data`, commit messages, and pull requests. Developer-facing messages too: `throw` and `RangeError` messages, `console.*`, validator messages, and the debug overlay.
- Polish: everything the end user sees, including labels, buttons, `aria-label`, `aria-live` announcements, dates, numbers, body names, and educational content. The page language is `<html lang="pl">`.
- Never hardcode Polish in `.ts` files or in `src/data`. UI copy lives in `src/content/locales/pl.json`: a flat object with dotted English keys (`time.presets.day`, `bodies.uranus.name`). A value is a string with `{name}` placeholders or an object of plural forms `{ "one", "few", "many", "other" }`.
- UI text goes through `createI18n(dictionary, locale)` in `src/ui/i18n.ts` (`t`, `plural`, `formatNumber`), built on `Intl.PluralRules` and `Intl.NumberFormat`. No i18n library. `main.ts` builds it from `pl.json` and passes it to UI modules as a parameter. `render` does not import `content`; it gets ready strings from `main.ts`.
- `name` in `bodies.json` stays English. The name a student sees is `bodies.<id>.name` in `pl.json`.
- Tests may contain Polish expected strings, because they check what the student sees.
- Copy is straightforward, for age 12+, with no unexplained jargon.

## Model, scale, time

- A body's position is a function of simulation time (Kepler's equation, Newton). No N-body integration and no ephemeris tables.
- Body data lives in JSON, copy lives apart, joined by `id`. Next to the data, record the source (NASA/JPL, epoch J2000) and that perturbations are omitted.
- Scene distance `d = k·AU^0.5`, size `r = c·radiusKm^0.4`, with a lower and an upper bound. Constants `k` and `c` live only in `src/sim/scale.ts`. Moons use their own scale relative to the parent planet.
- Simulation time is days since J2000. The clock is in `src/core`, with an injectable time source so it can be tested without a browser.
- The UI states plainly that distance and size are simplified. A realistic-scale mode is a later milestone.

## Loop and performance

- One loop: `renderer.setAnimationLoop`. Order: `update(dtSeconds)`, then `render()`.
- `dt` comes from `performance.now()` and is clamped to 0.1 s. A hidden tab (`visibilitychange`) does not render; returning resumes without a jump.
- Window size: `ResizeObserver`. `pixelRatio = min(devicePixelRatio, 2)`, and at most 1.5 when `(pointer: coarse)`.
- No dynamic shadows and no postprocessing. Orbits are a `Line` with precomputed points. Geometries and textures get `dispose()`.
- Assets come from `public/assets`. No CDN and no third-party scripts. No analytics.
- FPS overlay only behind a `debug` flag.

## Tests

When a task introduces the tooling: Vitest in the `node` environment (jsdom only once a test needs the DOM), 90% line coverage only for `src/sim`. Playwright is a Chromium smoke test (swiftshader): startup with no `console.error`, canvas not empty. No WebGL screenshot regression.

## Working on a task

- Do the task named in the request. The boundaries are the issue's "Out of scope" section.
- Take the branch name from the issue's git branch name in Linear.
- After verification, comment on the issue with the result (versions, commands, any departure from the description).
- Commit messages are English, imperative mood (`Add orbit lines for the eight planets`). Pull request titles too.

## Commands

```sh
npm ci
npm run dev
npm run build          # tsc --noEmit && vite build
npm run preview
npm run typecheck      # src, config files, and tests (tsconfig.json, .node.json, .test.json)
npm run lint
npm run format
npm run test
npm run test:coverage
```

`test:e2e` arrives with its own issue. Do not add it while doing something else.
