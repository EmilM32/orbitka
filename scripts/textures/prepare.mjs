// Builds the planet textures in public/assets/textures/{512,1k,2k}/<key>.jpg
// from the Solar System Scope 2k originals (CC BY 4.0) listed in
// sources.json. The originals go to a temporary directory and never into the
// repo.
//
// Usage: node scripts/textures/prepare.mjs
//
// Needs two command-line tools on PATH (no npm dependencies):
//   magick  ImageMagick 7      macOS: brew install imagemagick
//                              Linux: https://imagemagick.org/script/download.php
//                              (ImageMagick 6 `convert` is accepted as a fallback)
//   cjpeg   from mozjpeg       macOS: brew install mozjpeg (then add
//                              $(brew --prefix mozjpeg)/bin to PATH)
//                              Linux: build from https://github.com/mozilla/mozjpeg
//
// oxipng is for a PNG ring texture, which this script does not make yet.

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'public', 'assets', 'textures');
const SOURCES = JSON.parse(
  readFileSync(new URL('./sources.json', import.meta.url), 'utf8'),
);
const SIZES = [
  ['512', 512, 256],
  ['1k', 1024, 512],
  ['2k', 2048, 1024],
];
const JPEG_QUALITY = '82';
const MAX_TOTAL_BYTES = 6_000_000;

// The same -resize WxH! -strip runs on ImageMagick 6 as `convert`.
const RESIZERS = ['magick', 'convert'];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.toString().trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout.toString();
}

function fail(message) {
  console.error(
    `prepare: ${message}\nSee the header of scripts/textures/prepare.mjs.`,
  );
  process.exit(1);
}

// Returns the resize command. cjpeg must be the mozjpeg one: libjpeg-turbo's
// cjpeg makes larger files at the same quality.
function checkTools() {
  const resizer = RESIZERS.find(
    (command) =>
      spawnSync(command, ['-version'], { stdio: 'pipe' }).error === undefined,
  );
  if (resizer === undefined) {
    fail('missing magick (ImageMagick 7: brew install imagemagick)');
  }
  const cjpeg = spawnSync('cjpeg', ['-version'], { stdio: 'pipe' });
  if (cjpeg.error !== undefined) {
    fail('missing cjpeg (mozjpeg: brew install mozjpeg)');
  }
  if (!/mozjpeg/i.test(`${cjpeg.stdout}${cjpeg.stderr}`)) {
    fail('cjpeg on PATH is not mozjpeg; put the mozjpeg cjpeg first on PATH');
  }
  return resizer;
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download ${url} failed: HTTP ${response.status}`);
  }
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  const resizer = checkTools();
  const work = mkdtempSync(join(tmpdir(), 'orbitka-textures-'));
  try {
    for (const [folder] of SIZES) {
      mkdirSync(join(OUT, folder), { recursive: true });
    }

    for (const [key, url] of Object.entries(SOURCES)) {
      const original = join(work, `${key}-original.jpg`);
      await download(url, original);
      for (const [folder, width, height] of SIZES) {
        const scaled = join(work, `${key}-${folder}.ppm`);
        run(resizer, [
          original,
          '-resize',
          `${width}x${height}!`,
          '-strip',
          scaled,
        ]);
        run('cjpeg', [
          '-quality',
          JPEG_QUALITY,
          '-progressive',
          '-optimize',
          '-outfile',
          join(OUT, folder, `${key}.jpg`),
          scaled,
        ]);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  let total = 0;
  for (const [folder] of SIZES) {
    for (const name of readdirSync(join(OUT, folder)).sort()) {
      const bytes = statSync(join(OUT, folder, name)).size;
      total += bytes;
      console.log(`${folder}/${name}\t${formatBytes(bytes)}`);
    }
  }
  console.log(
    `total\t${formatBytes(total)} (limit ${formatBytes(MAX_TOTAL_BYTES)})`,
  );
  if (total > MAX_TOTAL_BYTES) {
    console.error('prepare: public/assets/textures/ is over 6 MB');
    process.exit(1);
  }
}

await main();
