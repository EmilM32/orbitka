import { AmbientLight, Group, PointLight } from 'three';

export function createLights(): Group {
  const group = new Group();

  const sun = new PointLight(0xffffff, 3, 0, 0);
  sun.position.set(0, 0, 0);
  sun.castShadow = false;
  group.add(sun);

  group.add(new AmbientLight(0xffffff, 0.15));
  return group;
}
