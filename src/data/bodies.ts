import raw from './bodies.json' with { type: 'json' };
import type { BodyDef } from './types.ts';
import { validateBodies } from './validate.ts';

const result = validateBodies(raw);

if (!result.ok) {
  throw new Error(
    `Niepoprawne dane ciał niebieskich:\n${result.errors.join('\n')}`,
  );
}

export const bodies: readonly BodyDef[] = result.bodies;

const bodiesById = new Map(bodies.map((body) => [body.id, body]));

export function getBody(id: string): BodyDef {
  const body = bodiesById.get(id);

  if (!body) {
    throw new Error(`Nieznane ciało niebieskie: ${id}`);
  }

  return body;
}
