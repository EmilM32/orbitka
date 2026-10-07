/** Screen-space body slots. Allocated once; callers write into the arrays. */
export type BodyScreenFrame = {
  count: number;
  ids: readonly string[];
  x: Float64Array;
  y: Float64Array;
  depth: Float64Array;
  radiusPx: Float64Array;
  visible: Uint8Array;
};

export function createBodyScreenFrame(ids: readonly string[]): BodyScreenFrame {
  const count = ids.length;
  const owned: string[] = [];
  for (let index = 0; index < count; index += 1) {
    owned.push(ids[index] ?? '');
  }

  return {
    count,
    ids: owned,
    x: new Float64Array(count),
    y: new Float64Array(count),
    depth: new Float64Array(count),
    radiusPx: new Float64Array(count),
    visible: new Uint8Array(count),
  };
}
