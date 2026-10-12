import { buildViewQuery, type ViewState } from '@core/viewParams.ts';

type LinkLocation = Pick<Location, 'origin' | 'pathname'>;

/**
 * The address of the page with the view in it: the body, the date and the
 * speed preset (or the pause). Camera position is not part of a link.
 */
export function buildViewLink(
  location: LinkLocation,
  state: ViewState,
): string {
  const query = buildViewQuery(state);
  const base = `${location.origin}${location.pathname}`;
  return query === '' ? base : `${base}?${query}`;
}

/** Puts `text` on the clipboard. False when the browser does not allow it. */
export async function copyText(
  clipboard: Pick<Clipboard, 'writeText'> | undefined,
  text: string,
): Promise<boolean> {
  if (clipboard === undefined) {
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // Blocked by permissions or by an insecure page.
    return false;
  }
}
