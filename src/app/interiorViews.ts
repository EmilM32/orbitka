import {
  parseInteriorContent,
  type InteriorContentCatalog,
} from '@content/interiorContent.ts';
import { interiors, layerMeasure } from '@data/interiors.ts';
import type { BodyCardInterior } from '@ui/bodyCard.ts';

/** Validated at startup so a broken content file fails fast. */
export function loadInteriorContent(raw: unknown): InteriorContentCatalog {
  return parseInteriorContent(
    raw,
    [...interiors.values()].map((entry) => ({
      id: entry.id,
      layerIds: entry.layers.map((layer) => layer.id),
    })),
  );
}

/** Joins the kilometer catalog with the Polish layer copy for the body card. */
export function interiorCardViews(
  content: InteriorContentCatalog,
): Record<string, BodyCardInterior> {
  const views: Record<string, BodyCardInterior> = {};
  for (const entry of interiors.values()) {
    const copy = content[entry.id];
    if (copy === undefined) {
      throw new RangeError(
        `interiorCardViews: parameter "content" must include ${entry.id}, got none`,
      );
    }
    views[entry.id] = {
      atmosphere: entry.atmosphere,
      sourceName: entry.source.name,
      sourceUrl: entry.source.url,
      layers: entry.layers.map((layer, index) => {
        const measure = layerMeasure(entry.layers, index);
        const layerCopy = copy.layers[layer.id];
        if (layerCopy === undefined) {
          throw new RangeError(
            `interiorCardViews: parameter "content" must include layer ${entry.id}.${layer.id}, got none`,
          );
        }
        return {
          id: layer.id,
          name: layerCopy.name,
          text: layerCopy.text,
          measure: measure.kind,
          km: measure.km,
          color: layer.color,
        };
      }),
    };
  }
  return views;
}
