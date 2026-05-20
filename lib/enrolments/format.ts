// mynclex/lib/enrolments/format.ts
//
// Small presentational helpers for the cohort workspace (Slice 4 rework
// to the CD design): avatar initials + a compact relative-time label.

/** Up-to-two-letter uppercase initials from a name ("Ama Mensah" → "AM",
 *  "Kwame" → "K"). Falls back to "?" for an empty string. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/** Compact relative time: "just now", "3h ago", "yesterday", "5 days ago",
 *  then an absolute date past a week. Mirrors the prototype's "when" column. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}
