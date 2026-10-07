export type ScenePosition = {
  x: number;
  y: number;
  z: number;
};

// Structural on purpose: callers in main.ts must not import three.
type Positioned = {
  position: {
    x: number;
    y: number;
    z: number;
  };
};

// A plain copy of the mesh position in scene units. Null when the id is absent.
export function getBodyScenePosition(
  meshes: ReadonlyMap<string, Positioned>,
  id: string,
): ScenePosition | null {
  const mesh = meshes.get(id);
  if (mesh === undefined) {
    return null;
  }

  return {
    x: mesh.position.x,
    y: mesh.position.y,
    z: mesh.position.z,
  };
}
