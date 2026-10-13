import type { BodyContentCatalog } from '@content/bodyContent.ts';
import { interiors } from '@data/interiors.ts';

export type CitedSource = {
  name: string;
  url: string;
};

export type CutawayCitation = {
  bodyId: string;
  name: string;
  url: string;
};

/**
 * Citations for the sources section. Fun facts collapse to one line per
 * address. Each cutaway keeps its own line, because the page differs by body.
 */
export function collectSourceCitations(content: BodyContentCatalog): {
  funFacts: CitedSource[];
  cutaways: CutawayCitation[];
} {
  const funFacts: CitedSource[] = [];
  const seen = new Set<string>();
  for (const entry of Object.values(content)) {
    const source = entry.funFact.source;
    if (seen.has(source.url)) {
      continue;
    }
    seen.add(source.url);
    funFacts.push({ name: source.name, url: source.url });
  }
  const cutaways = [...interiors.values()].map((entry) => ({
    bodyId: entry.id,
    name: entry.source.name,
    url: entry.source.url,
  }));
  return { funFacts, cutaways };
}
