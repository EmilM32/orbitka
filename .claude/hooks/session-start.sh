#!/bin/bash
# Claude Code cloud sessions only: Node from .nvmrc, npm dependencies and the
# Chromium build that the pinned @playwright/test expects. Safe to run again.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# The cloud image ships nvm in /opt/nvm and an older Node as the default.
# Node 24 goes on PATH for this session only; the nvm default stays as is.
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
fi
# nvm.sh reads unset variables.
set +u
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh" --no-use
HAD_DEFAULT="$([ -f "$NVM_DIR/alias/default" ] && echo yes || echo no)"
nvm install --no-progress >/dev/null # version from .nvmrc
# The first install also makes itself the default; undo that.
if [ "$HAD_DEFAULT" = no ]; then
  nvm unalias default >/dev/null 2>&1 || true
fi
nvm use >/dev/null
set -u
NODE_BIN="$(dirname "$(nvm which current)")"

# npm ci only when package-lock.json changed since the last install, so a
# cached container skips it. engine-strict in .npmrc needs Node 24 here.
LOCK_HASH="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
STAMP="node_modules/.session-start-lock-hash"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund
  echo "$LOCK_HASH" >"$STAMP"
fi

# The image presets PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers with an older
# Chromium and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1. Install the matching build
# into the default cache instead; nothing is downloaded when it is there.
BROWSERS="$HOME/.cache/ms-playwright"
PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='' \
  npx playwright install chromium

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export NVM_DIR=\"$NVM_DIR\""
    echo "export PATH=\"$NODE_BIN:\$PATH\""
    echo "export PLAYWRIGHT_BROWSERS_PATH=\"$BROWSERS\""
    echo "unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"
  } >>"$CLAUDE_ENV_FILE"
fi
