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
