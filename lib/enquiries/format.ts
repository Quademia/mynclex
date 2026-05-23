// mynclex/lib/enquiries/format.ts
//
// Display helpers for the tutor enquiry list (Slice 8b).

import type { ContactChannel } from '@/lib/discovery/contact-options';
import type { EnquiryStatus } from './types';

// Status pill copy + tone class (paired with .pill-* styling).
export type StatusPill = { label: string; tone: 'new' | 'open' | 'done' | 'shut' };

export function statusPill(status: EnquiryStatus): StatusPill {
  switch (status) {
    case 'NEW':       return { label: 'New',       tone: 'new'  };
    case 'CONTACTED': return { label: 'Contacted', tone: 'open' };
    case 'CONVERTED': return { label: 'Converted', tone: 'done' };
    case 'CLOSED':    return { label: 'Closed',    tone: 'shut' };
  }
}

// Short, friendly label per contact channel for the row pills.
export function channelLabel(channel: ContactChannel): string {
  switch (channel) {
    case 'WHATSAPP': return 'WhatsApp';
    case 'CALL':     return 'Call';
    case 'SMS':      return 'SMS';
    case 'EMAIL':    return 'Email';
  }
}

// "12 May 2026, 14:32" — for the When column. Stable cross-locale display
// using the en-GB style the rest of the tutor surface uses.
export function formatEnquiryDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────
// Urgency — age × status. Drives the tutor V1 list's left aging
// strip, the admin V1 SLA badges, and the V1 KPI strip's
// "Needs reply now" count (= rows with tier === 'hot'). Mirrors the
// CD design-handoff helper one-for-one so the visual matches the mock.
// ─────────────────────────────────────────────────────────────────

export type UrgencyTier = 'hot' | 'warm' | 'aging' | 'cold' | 'done';

const MS_PER_HOUR = 3_600_000;

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / MS_PER_HOUR;
}

// Terminal statuses (CONVERTED/CLOSED) are always 'done'. Otherwise:
//   hot   — under 4h     (action needed now)
//   warm  — under 24h    (still same day-ish)
//   aging — under 72h    (slipping)
//   cold  — 72h or more  (cold lead)
export function urgencyTier(iso: string, status: EnquiryStatus): UrgencyTier {
  if (status === 'CONVERTED' || status === 'CLOSED') return 'done';
  const h = hoursSince(iso);
  if (h < 4) return 'hot';
  if (h < 24) return 'warm';
  if (h < 72) return 'aging';
  return 'cold';
}

// Display metadata per tier. Colours match the design handoff:
// red→amber→yellow→grey→muted, intended for left-edge accent strips
// + dot markers + SLA badges. Keep these as constants (not CSS classes)
// because some uses are inline SVG strokes.
export const URGENCY_META: Record<UrgencyTier, { label: string; color: string; bg: string }> = {
  hot:   { label: 'Hot',   color: '#dc2626', bg: '#fef2f2' },
  warm:  { label: 'Warm',  color: '#d97706', bg: '#fffbeb' },
  aging: { label: 'Aging', color: '#a16207', bg: '#fefce8' },
  cold:  { label: 'Cold',  color: '#6b7280', bg: '#f3f4f6' },
  done:  { label: '—',     color: '#9ca3af', bg: '#f9fafb' },
};
