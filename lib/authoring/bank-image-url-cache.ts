// mynclex/lib/authoring/bank-image-url-cache.ts
//
// Bank rich-content Slice 7 follow-up — client-side cache of minted
// signed URLs, keyed by asset id. Without it, every remount of an image
// (tab switch, back-navigation) re-runs the server gate AND re-downloads
// the bytes — each mint produces a different signed URL, so the browser's
// HTTP cache never hits. Remembering the URL kills the round-trip and,
// because the URL is now identical, lets the browser serve the bytes
// from its own cache.
//
// Page-memory only (module scope) — cleared on refresh. Caching is safe:
// the URL was already minted for this signed-in user by a gated action;
// remembering it client-side grants nothing new.
//
// TTL sits under the 1-hour signed-URL validity (getAssetUrl's
// SIGNED_URL_TTL_SECONDS) so a cached URL is almost always still valid;
// the image components evict + re-mint on a load error as the fallback.

const TTL_MS = 55 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();

/** The still-valid cached URL for an asset, else null. */
export function getCachedBankImageUrl(assetId: string): string | null {
  const hit = cache.get(assetId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(assetId);
    return null;
  }
  return hit.url;
}

/** Remember a freshly minted URL. */
export function cacheBankImageUrl(assetId: string, url: string): void {
  cache.set(assetId, { url, expiresAt: Date.now() + TTL_MS });
}

/** Drop a URL that failed to load (expired / revoked) so the next
 *  render re-mints. */
export function evictBankImageUrl(assetId: string): void {
  cache.delete(assetId);
}
