import { expect, test } from 'vitest';
import { build, type Rolldown } from 'vite';

// EMI-235. Built in memory with the real vite.config.ts. The app chunk was
// 167 kB at the split (9.10.2026); the limit leaves room for M5 without
// letting it creep up unnoticed. three.js sits in its own chunk under the
// 700 kB chunkSizeWarningLimit, pinned with the dependency.
const APP_CHUNK_LIMIT_KB = 220;
const THREE_CHUNK_LIMIT_KB = 700;

type Output = Rolldown.RolldownOutput;

async function bundle(): Promise<
  (Rolldown.OutputChunk | Rolldown.OutputAsset)[]
> {
  const result = await build({
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Output[];
  return outputs.flatMap((item) => item.output);
}

test('three.js has its own chunk and the app chunk stays small', async () => {
  const chunks = (await bundle()).filter(
    (item): item is Rolldown.OutputChunk => item.type === 'chunk',
  );
  const sizes = new Map(
    chunks.map((chunk) => [chunk.name, Buffer.byteLength(chunk.code) / 1000]),
  );

  expect([...sizes.keys()].toSorted()).toEqual(['index', 'three']);
  expect(sizes.get('index')).toBeLessThan(APP_CHUNK_LIMIT_KB);
  expect(sizes.get('three')).toBeLessThan(THREE_CHUNK_LIMIT_KB);

  // No three.js code in the app chunk.
  const app = chunks.find((chunk) => chunk.name === 'index');
  expect(
    Object.keys(app?.modules ?? {}).filter((id) =>
      id.includes('node_modules/three/'),
    ),
  ).toEqual([]);
}, 60_000);
