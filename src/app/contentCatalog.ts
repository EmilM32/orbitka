import {
  parseBodyContentCatalog,
  type BodyContentCatalog,
} from '@content/bodyContent.ts';
import { bodies } from '@data/bodies.ts';

// The Galilean moons get card content in a later task (EMI-218 scope).
const BODIES_WITHOUT_CONTENT = new Set([
  'io',
  'europa',
  'ganymede',
  'callisto',
]);

/** Validated at startup so a broken content file fails fast. */
export function loadBodyContent(raw: unknown): BodyContentCatalog {
  return parseBodyContentCatalog(
    raw,
    bodies
      .filter((body) => !BODIES_WITHOUT_CONTENT.has(body.id))
      .map((body) => body.contentKey),
  );
}
