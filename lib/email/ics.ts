// mynclex/lib/email/ics.ts
//
// Builds the calendar attachment a live-session reminder carries.
//
// ⭐⭐ WHY AN ATTACHMENT AT ALL, when we could just write the time in the
// email: because she taps it once and then **her own phone** reminds her,
// at whatever notice she already uses for everything else, for every
// future occurrence. That is more reliable than anything we can send — it
// survives a full inbox, and it lives where she looks to see what she is
// doing tonight. It is also why this arc does not need a T-1h email: the
// job that email would do is done better, once, by the device in her hand.
//
// ⭐ It is also what makes the volume affordable. The shape this replaced
// (T-24h + T-1h per session, per student) cost 50 emails per class of 25;
// this costs ~1 per student per week. See transactional-email.md →
// Live sessions.
//
// ─────────────────────────────────────────────────────────────────────
// The three rules of RFC 5545 that break real calendars when ignored
// ─────────────────────────────────────────────────────────────────────
//   1. **CRLF, always.** Some parsers accept bare LF; Outlook is not
//      reliably one of them, and a file that opens in Gmail and not in
//      Outlook is worse than no file.
//   2. **TEXT values must be escaped** — backslash, semicolon, comma and
//      newline all have meaning in the grammar. A tutor's joining note
//      containing "Bring your notes, and a pen" would otherwise end the
//      property early and truncate the rest.
//   3. **Lines fold at 75 octets**, continued by CRLF + one space. A long
//      DESCRIPTION is the normal case here, not an edge one.

import 'server-only';

/** What Resend wants: a filename and base64 content. */
export type EmailAttachment = {
  filename: string;
  /** base64, no data: prefix. */
  content: string;
  /** Resend infers from the filename when omitted; we are explicit. */
  contentType?: string;
};

export type CalendarEvent = {
  /**
   * ⭐⭐ STABLE ACROSS RESCHEDULES, and that is the whole point. The UID
   * is what tells her calendar "this is the class you already have", so a
   * moved session UPDATES the entry in her phone rather than leaving two
   * and letting her turn up to the older one. Which is exactly why it is
   * the session id and NOT the outbox fingerprint — the fingerprint
   * deliberately changes when the time changes, so that we re-send.
   */
  uid: string;
  /**
   * ⚠ Must INCREASE on every change to the event, or a calendar is
   * entitled to ignore the update and keep showing the old time. We feed
   * it the row's `updated_at` as epoch seconds: monotonic by definition,
   * needs no counter of ours to maintain, and cannot go backwards.
   */
  sequence: number;
  startISO: string;
  durationMinutes: number;
  title: string;
  description: string;
  /** The joining link, if the tutor has set one. */
  url: string | null;
};

// ─────────────────────────────────────────────────────────────────────

/** RFC 5545 DATE-TIME in UTC: 20260825T190000Z. */
function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Rule 2. Order matters — the backslash must be escaped first. */
function esc(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Rule 3. Folds on 75 **octets**, not characters — a name or a note in
 * any non-ASCII script is multi-byte, and folding by `.length` would put
 * the break mid-character and corrupt it.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let chunk = '';
  let used = 0;
  // Continuation lines carry a leading space, so they have one octet less
  // to play with. First line: 75. Subsequent: 74 plus the space.
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const cap = out.length === 0 ? 75 : 74;
    if (used + size > cap) {
      out.push(chunk);
      chunk = '';
      used = 0;
    }
    chunk += ch;
    used += size;
  }
  if (chunk) out.push(chunk);
  return out.map((c, i) => (i === 0 ? c : ` ${c}`)).join('\r\n');
}

/**
 * The .ics text for one class.
 *
 * ⓘ METHOD:PUBLISH, not REQUEST. REQUEST is an *invitation* — it asks the
 * reader to accept or decline and, in Outlook, prints RSVP buttons whose
 * replies would go to an address nobody reads. This is an informational
 * copy of something she is already enrolled in; there is nothing to
 * accept.
 */
export function buildSessionIcs(ev: CalendarEvent): string {
  const start = new Date(ev.startISO);
  const end = new Date(start.getTime() + ev.durationMinutes * 60_000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quademia//MyNclex//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${esc(ev.uid)}@quademia.com`,
    `SEQUENCE:${Math.max(0, Math.floor(ev.sequence))}`,
    // ⚠ DTSTAMP is when this FILE was made, DTSTART when the class is.
    // Parsers reject a VEVENT without the first, and it is not the second.
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.description)}`,
    'STATUS:CONFIRMED',
    // ⓘ LOCATION carries the link too: phone calendars surface LOCATION on
    // the lock screen and make it tappable, while URL is often buried in a
    // detail view or dropped entirely.
    ...(ev.url ? [`URL:${esc(ev.url)}`, `LOCATION:${esc(ev.url)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(fold).join('\r\n') + '\r\n';
}

/**
 * base64 without Buffer.
 *
 * ⚠ Deliberately not `Buffer.from(...)`. This runs inside the Worker,
 * where Node built-ins are present only under nodejs_compat — and the
 * send path is the last place to discover a runtime difference, because
 * its failures are invisible until someone reports a missing email.
 * TextEncoder and btoa are web standards present in both runtimes.
 */
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The finished attachment, ready for the Resend payload. */
export function sessionIcsAttachment(ev: CalendarEvent): EmailAttachment {
  return {
    filename: 'class.ics',
    content: toBase64(buildSessionIcs(ev)),
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
  };
}
