// Icons from Lucide (ISC license, ATTRIBUTION.md), drawn on a 24×24 grid with
// a 2 px stroke in currentColor. Circles and rectangles are written as paths,
// so every icon is a list of path data. An icon is never the only label: its
// button has text or an aria-label.

export type IconName =
  | 'orbit'
  | 'info'
  | 'close'
  | 'play'
  | 'pause'
  | 'reverse'
  | 'plus'
  | 'minus'
  | 'system'
  | 'orbits'
  | 'chevron'
  | 'more'
  | 'check'
  | 'list'
  | 'settings';

const SVG_NS = 'http://www.w3.org/2000/svg';

function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export const ICON_PATHS: Readonly<Record<IconName, readonly string[]>> = {
  orbit: [
    'M20.341 6.484A10 10 0 0 1 10.266 21.85',
    'M3.659 17.516A10 10 0 0 1 13.74 2.152',
    circle(12, 12, 3),
    circle(19, 5, 2),
    circle(5, 19, 2),
  ],
  info: [circle(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  play: [
    'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
  ],
  pause: [
    'M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
  ],
  reverse: [
    'M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z',
    'M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z',
  ],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  system: [
    circle(12, 12, 4),
    'M12 2v2',
    'M12 20v2',
    'm4.93 4.93 1.41 1.41',
    'm17.66 17.66 1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'm6.34 17.66-1.41 1.41',
    'm19.07 4.93-1.41 1.41',
  ],
  orbits: [
    'M10.1 2.182a10 10 0 0 1 3.8 0',
    'M13.9 21.818a10 10 0 0 1-3.8 0',
    'M17.609 3.721a10 10 0 0 1 2.69 2.7',
    'M2.182 13.9a10 10 0 0 1 0-3.8',
    'M20.279 17.609a10 10 0 0 1-2.7 2.69',
    'M21.818 10.1a10 10 0 0 1 0 3.8',
    'M3.721 6.391a10 10 0 0 1 2.7-2.69',
    'M6.391 20.279a10 10 0 0 1-2.69-2.7',
  ],
  chevron: ['m6 9 6 6 6-6'],
  more: [circle(12, 12, 1), circle(19, 12, 1), circle(5, 12, 1)],
  check: ['M20 6 9 17l-5-5'],
  list: [
    'M3 5h.01',
    'M3 12h.01',
    'M3 19h.01',
    'M8 5h13',
    'M8 12h13',
    'M8 19h13',
  ],
  settings: [
    'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    circle(12, 12, 3),
  ],
};

export function createIcon(name: IconName): SVGSVGElement {
  if (!Object.hasOwn(ICON_PATHS, name)) {
    throw new RangeError(
      `createIcon: parameter "name" must be a known icon name, got ${String(name)}`,
    );
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const data of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', data);
    svg.append(path);
  }
  return svg;
}
