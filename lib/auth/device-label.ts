// mynclex/lib/auth/device-label.ts
//
// User-Agent → a short human-readable label like 'Android · Chrome'.
//
// WHY A LABEL AND NOT A FINGERPRINT. Gamma hashed the user-agent
// (fp_hash / ua_hash) so it could enforce per-device rate limits. We
// dropped that axis in favour of Turnstile, which leaves a hash with no
// job except being quasi-identifying data at rest. What remains useful is
// the part a human reads: support looking at one student's timeline, and
// — the reason this exists in slice 2a at all — account sharing becoming
// VISIBLE (one account, five labels, one week) before anyone has to pick
// a device limit. See domain-and-identity.md → "Sequencing: capture
// first, decide with evidence".
//
// ⚠ THIS IS DELIBERATELY COARSE. It cannot tell two Android phones apart,
// and that is the point — it answers "how many kinds of thing sign in as
// her", not "which physical device is this". Anything sharper would be
// the fingerprint we just declined to build.
//
// ⚠ IT COUNTS BROWSERS, NOT DEVICES. One laptop running Chrome and Edge
// produces two labels. Whatever number a future session limit picks, it
// must be picked knowing that — "2 devices" and "2 browsers" are not the
// same promise, and the support conversation will be about the gap.
//
// Built once here and shared with any future session-limit slice, per the
// doc's note. Don't write a second one.

const UNKNOWN = 'Unknown device';

// ORDER MATTERS IN BOTH LISTS — every entry is a substring test against
// one messy string, and the browsers deliberately lie about each other.
// Chrome's UA contains 'Safari'; Edge's contains both 'Chrome' and
// 'Safari'; Opera's and Samsung Internet's contain 'Chrome' too. So the
// impostors are matched first and the widely-impersonated names last. A
// tidy alphabetical sort of this array would report every Edge user as
// Chrome and every Chrome user as Safari.
const BROWSERS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ['Edg/', 'Edge'],            // Chromium Edge
  ['EdgA/', 'Edge'],           // Edge on Android
  ['EdgiOS/', 'Edge'],         // Edge on iOS
  ['Edge/', 'Edge'],           // legacy EdgeHTML
  ['OPR/', 'Opera'],
  ['Opera', 'Opera'],
  ['SamsungBrowser/', 'Samsung Internet'],
  ['FxiOS/', 'Firefox'],       // Firefox on iOS
  ['Firefox/', 'Firefox'],
  ['CriOS/', 'Chrome'],        // Chrome on iOS
  ['Chrome/', 'Chrome'],
  ['Safari/', 'Safari'],       // last: everyone above also says Safari
];

// Also order-sensitive, for one case: an iPad's UA can contain both
// 'iPad' and 'Macintosh' (desktop-mode Safari), and iPad is the truer
// answer.
const PLATFORMS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ['Android', 'Android'],
  ['iPhone', 'iPhone'],
  ['iPad', 'iPad'],
  ['CrOS', 'ChromeOS'],
  ['Windows', 'Windows'],
  ['Macintosh', 'Mac'],
  ['Mac OS X', 'Mac'],
  ['Linux', 'Linux'],
];

function firstMatch(
  ua: string,
  table: ReadonlyArray<readonly [string, string]>
): string | null {
  for (const [needle, label] of table) {
    if (ua.includes(needle)) return label;
  }
  return null;
}

/**
 * Turn a raw User-Agent header into 'Platform · Browser'.
 *
 * Returns null for a missing or empty header — null means "we were not
 * told", which reads differently in the log from 'Unknown device', which
 * means "we were told something we could not place" (a bot, a script, or
 * simply a browser newer than this file).
 */
export function deviceLabelFrom(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').trim();
  if (!ua) return null;

  const platform = firstMatch(ua, PLATFORMS);
  const browser = firstMatch(ua, BROWSERS);

  if (!platform && !browser) return UNKNOWN;

  return `${platform ?? 'Unknown'} · ${browser ?? 'Unknown'}`;
}
