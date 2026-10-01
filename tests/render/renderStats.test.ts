import { expect, test } from 'vitest';

import { getRenderStats } from '@render/renderStats.ts';

test('renderStats › liczby', () => {
  const info = { render: { calls: 12, triangles: 34_560 } };
  const source = { info };
  const stats = getRenderStats(source);

  expect(stats).toEqual({ calls: 12, triangles: 34_560 });
  stats.calls = 0;
  stats.triangles = 1;
  expect(source.info.render).toEqual({ calls: 12, triangles: 34_560 });

  for (const calls of [Number.NaN, -1]) {
    const call = () =>
      getRenderStats({ info: { render: { calls, triangles: 1 } } });
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `getRenderStats: parametr „calls” musi być skończony i ≥ 0, otrzymano ${calls}`,
    );
  }

  expect(() =>
    getRenderStats({
      info: { render: { calls: 1, triangles: Number.NEGATIVE_INFINITY } },
    }),
  ).toThrow('„triangles”');
});
