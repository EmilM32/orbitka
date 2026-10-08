import './debugOverlay.css';

export type DebugStats = {
  fps: number;
  drawCalls: number;
  postFxDrawCalls: number;
  triangles: number;
  textureMiB: number;
};

export type DebugOverlay = {
  update(stats: DebugStats): void;
  dispose(): void;
};

const FPS_GOOD = 'debug-fps-good';
const FPS_MID = 'debug-fps-mid';
const FPS_LOW = 'debug-fps-low';

function isReportable(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function formatGrouped(value: number): string {
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded));
  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  return `${rounded < 0 ? '-' : ''}${groups.join('\u00A0')}`;
}

function writeLine(
  line: HTMLElement,
  label: string,
  value: number,
  colorFps: boolean,
): void {
  if (!isReportable(value)) {
    line.textContent = `${label}: —`;
    line.className = '';
    return;
  }

  // FPS is cut down to a whole number, so the color always matches the number
  // shown: 54.9 reads "54" in yellow, not "55" in yellow.
  const shown = colorFps ? Math.floor(value) : value;
  line.textContent = `${label}: ${formatGrouped(shown)}`;
  if (!colorFps) {
    line.className = '';
    return;
  }

  if (shown >= 55) {
    line.className = FPS_GOOD;
    return;
  }

  line.className = shown >= 45 ? FPS_MID : FPS_LOW;
}

function writeMiB(line: HTMLElement, label: string, value: number): void {
  line.textContent = isReportable(value)
    ? `${label}: ${value.toFixed(1)} MiB`
    : `${label}: —`;
}

export function createDebugOverlay(parent: HTMLElement): DebugOverlay {
  const root = document.createElement('div');
  root.id = 'debug-overlay';

  const fpsLine = document.createElement('div');
  const callsLine = document.createElement('div');
  const postFxLine = document.createElement('div');
  const trianglesLine = document.createElement('div');
  const texturesLine = document.createElement('div');
  fpsLine.dataset.debugLine = 'fps';
  callsLine.dataset.debugLine = 'calls';
  postFxLine.dataset.debugLine = 'postfx';
  trianglesLine.dataset.debugLine = 'triangles';
  texturesLine.dataset.debugLine = 'textures';
  root.append(fpsLine, callsLine, postFxLine, trianglesLine, texturesLine);
  parent.append(root);

  let disposed = false;

  return {
    update(stats: DebugStats) {
      if (disposed) {
        return;
      }

      writeLine(fpsLine, 'FPS', stats.fps, true);
      writeLine(callsLine, 'Draw calls', stats.drawCalls, false);
      writeLine(postFxLine, 'Post-FX calls', stats.postFxDrawCalls, false);
      writeLine(trianglesLine, 'Triangles', stats.triangles, false);
      writeMiB(texturesLine, 'Textures', stats.textureMiB);
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      root.remove();
    },
  };
}
