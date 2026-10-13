import { expect, test } from 'vitest';

import type { BodyContentCatalog } from '@content/bodyContent.ts';
import bodyContentRaw from '@content/pl/bodies.json' with { type: 'json' };
import { interiors } from '@data/interiors.ts';
import { loadBodyContent } from '@app/contentCatalog.ts';
import { collectSourceCitations } from '@app/sourceCitations.ts';

function entry(source: {
  name: string;
  url: string;
}): BodyContentCatalog[string] {
  return {
    kind: 'planet',
    funFact: { text: 'One sentence.', source },
    description: 'Description.',
  };
}

test('sourceCitations › fun facts collapse to one line per address', () => {
  const shared = {
    name: 'NASA Planetary Fact Sheet',
    url: 'https://example.test/sheet',
  };
  const content = {
    sun: entry(shared),
    mercury: entry(shared),
    jupiter: entry({
      name: 'NASA Science: Jupiter',
      url: 'https://example.test/jupiter',
    }),
  } satisfies BodyContentCatalog;

  expect(collectSourceCitations(content).funFacts).toEqual([
    shared,
    {
      name: 'NASA Science: Jupiter',
      url: 'https://example.test/jupiter',
    },
  ]);
});

test('sourceCitations › the catalogs keep the card citations', () => {
  const citations = collectSourceCitations(loadBodyContent(bodyContentRaw));

  expect(citations.funFacts).toEqual([
    {
      name: 'NASA Planetary Fact Sheet',
      url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
    },
  ]);
  expect(citations.cutaways).toEqual(
    [...interiors.values()].map((entry) => ({
      bodyId: entry.id,
      name: entry.source.name,
      url: entry.source.url,
    })),
  );
  expect(
    citations.cutaways.find((item) => item.bodyId === 'jupiter')?.name,
  ).toBe('NASA Science: Jupiter');
});
