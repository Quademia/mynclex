// mynclex/lib/library/video-embed.ts
//
// URL parsing for the library Video block (slice 11.6b). Maps a
// pasted share/watch URL from one of the three supported providers
// (YouTube · Vimeo · Loom) to the canonical embed URL the block's
// iframe loads. No network, no API key — pure string parsing, so it
// runs equally in the editor NodeView and a future server-side read
// renderer (slice 11.13).
//
// Kept free of @tiptap/* imports for that reuse.

export type VideoProvider = 'youtube' | 'vimeo' | 'loom';

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  embedUrl: string;
}

/**
 * Parse a pasted video URL into { provider, videoId, embedUrl }, or
 * null if it isn't a recognised YouTube / Vimeo / Loom link.
 *
 * Accepted shapes:
 *   YouTube — youtube.com/watch?v=ID, youtu.be/ID,
 *             youtube.com/embed/ID, youtube.com/shorts/ID
 *   Vimeo   — vimeo.com/ID (numeric), player.vimeo.com/video/ID
 *   Loom    — loom.com/share/ID, loom.com/embed/ID
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = url.pathname;

  // ── YouTube ──
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (isPlausibleId(id)) return youtube(id);
    return null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (path === '/watch') {
      const id = url.searchParams.get('v');
      if (id && isPlausibleId(id)) return youtube(id);
      return null;
    }
    const m = path.match(/^\/(embed|shorts)\/([^/]+)/);
    if (m && isPlausibleId(m[2])) return youtube(m[2]);
    return null;
  }

  // ── Vimeo ──
  if (host === 'vimeo.com') {
    const id = path.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return vimeo(id);
    return null;
  }
  if (host === 'player.vimeo.com') {
    const m = path.match(/^\/video\/(\d+)/);
    if (m) return vimeo(m[1]);
    return null;
  }

  // ── Loom ──
  if (host === 'loom.com') {
    const m = path.match(/^\/(share|embed)\/([^/]+)/);
    if (m && isPlausibleId(m[2])) return loom(m[2]);
    return null;
  }

  return null;
}

// IDs are alphanumeric plus - and _ (YouTube) or hex (Loom). A loose
// guard — we only need to reject obvious junk, the provider does the
// real validation when the iframe loads.
function isPlausibleId(id: string | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]+$/.test(id);
}

function youtube(id: string): ParsedVideo {
  return {
    provider: 'youtube',
    videoId: id,
    embedUrl: `https://www.youtube.com/embed/${id}`,
  };
}

function vimeo(id: string): ParsedVideo {
  return {
    provider: 'vimeo',
    videoId: id,
    embedUrl: `https://player.vimeo.com/video/${id}`,
  };
}

function loom(id: string): ParsedVideo {
  return {
    provider: 'loom',
    videoId: id,
    embedUrl: `https://www.loom.com/embed/${id}`,
  };
}

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
};

export interface VideoLink {
  /** The pasted URL, trimmed — used as the link-card href. */
  url: string;
  /** Bare hostname (www. stripped) for display, e.g. "drive.google.com". */
  host: string;
}

export type VideoClassification =
  | { kind: 'embed'; embed: ParsedVideo }
  | { kind: 'link'; link: VideoLink }
  | { kind: 'invalid' };

/**
 * Classify a pasted URL for the Video block:
 *   • 'embed'   — a recognised YouTube/Vimeo/Loom link (plays inline).
 *   • 'link'    — any other safe http(s) URL (rendered as a watch-card
 *                 the student follows out to the source site).
 *   • 'invalid' — empty, malformed, or a non-http(s) scheme (e.g. a
 *                 javascript: URL). Rejected with an inline error.
 *
 * The safety gate here is the scheme check: only http/https links are
 * accepted, so a pasted `javascript:` / `data:` payload can never reach
 * an anchor href. The recognised-provider set is the embed allow-list;
 * everything else degrades to a click-through link rather than a blank
 * iframe (cross-origin frame refusals are silent and undetectable).
 */
export function classifyVideoUrl(raw: string): VideoClassification {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'invalid' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'invalid' };
  }

  const embed = parseVideoUrl(trimmed);
  if (embed) return { kind: 'embed', embed };

  return {
    kind: 'link',
    link: { url: trimmed, host: url.hostname.replace(/^www\./, '') },
  };
}

/** Derive a display hostname from a stored link URL (defensive). */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/**
 * Rebuild the canonical embed URL from a stored provider + videoId.
 * The block persists only { provider, videoId } (plus the pasted url
 * for display); the iframe src is derived on render so a future
 * embed-format change is a one-place edit. Returns null for an
 * unknown provider (defensive — the union should make that
 * unreachable).
 */
export function buildEmbedUrl(
  provider: VideoProvider,
  videoId: string,
): string | null {
  switch (provider) {
    case 'youtube':
      return `https://www.youtube.com/embed/${videoId}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${videoId}`;
    case 'loom':
      return `https://www.loom.com/embed/${videoId}`;
    default:
      return null;
  }
}
