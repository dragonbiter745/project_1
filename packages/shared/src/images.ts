/** Longest side of the small copy that menu lists load instead of the full dish photo. */
export const THUMB_SIDE = 240;

/**
 * Menu photos live at menus/<shop>/<name>.jpg and each has a small sibling, <name>-t.jpg. Lists load
 * the small one (about 10 KB instead of 150 KB). The link is built without the download token because
 * menu photos are publicly readable; null means this link has no small copy, so use the full photo.
 */
export function thumbUrlOf(imageUrl: string | null | undefined): string | null {
  const parsed = parse(imageUrl);
  if (!parsed) return null;
  return `${parsed.origin}${parsed.prefix}${encodeURIComponent(parsed.path.replace(/\.jpg$/, '-t.jpg'))}?alt=media`;
}

/** The two Storage objects behind a shop photo link (the photo and its small copy), or null if it is not one. */
export function imagePathsOf(imageUrl: string | null | undefined): { full: string; thumb: string } | null {
  const parsed = parse(imageUrl);
  return parsed ? { full: parsed.path, thumb: parsed.path.replace(/\.jpg$/, '-t.jpg') } : null;
}

function parse(imageUrl: string | null | undefined): { origin: string; prefix: string; path: string } | null {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    const match = /^(\/v0\/b\/[^/]+\/o\/)(.+)$/.exec(url.pathname);
    if (!match) return null;
    const path = decodeURIComponent(match[2] ?? '');
    if (!/^menus\/[^/]+\/[^/]+\.jpg$/.test(path) || path.endsWith('-t.jpg')) return null;
    return { origin: url.origin, prefix: match[1] ?? '', path };
  } catch {
    return null;
  }
}
