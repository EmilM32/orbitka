#!/usr/bin/env sh
# Runs the visual snapshots (tests/e2e/visual.spec.ts) in the same Playwright
# image as CI, so baselines match on every machine. Extra arguments go to
# `playwright test`, e.g. --update-snapshots (npm run test:visual:update).
# Needs Docker. The image tag must match @playwright/test in package.json.
set -eu

cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').devDependencies['@playwright/test']")
image="mcr.microsoft.com/playwright:v${version}-noble"

# node_modules lives in a named volume: the host copy may hold binaries for
# another OS (esbuild, rollup), and the container must not overwrite it.
exec docker run --rm --ipc=host \
  -v "$PWD":/work \
  -v orbitka-visual-node-modules:/work/node_modules \
  -w /work \
  -e CI=1 \
  -e ORBITKA_VISUAL=1 \
  "$image" \
  sh -c 'npm ci --no-audit --no-fund && npx playwright test visual "$@"' sh "$@"
