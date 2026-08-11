// mynclex/lib/email/render.ts
//
// Fills in the blanks: a queued row goes in, a finished subject line and
// page come out. The one place that knows which template belongs to
// which event key.
//
// Doc: docs/product-plan/transactional-email.md

import type { EmailTemplate, OutboxRow } from './types';
import { wrap } from './templates/wrapper';
import { footer } from './templates/footer';
import {
  PAYMENT_RECEIVED_FOOTER_CONTEXT,
  paymentReceivedTemplate,
} from './templates/payment-received';

export type Rendered = { subject: string; html: string; text: string };

/**
 * Every wired template, by event key.
 *
 * ⚠ ONE ENTRY PER EMAIL THAT ACTUALLY EXISTS. The catalog in the plan
 * doc lists 24; this holds what is built. A key here with no template,
 * or a template for an email nobody enqueues, is the mismatch that left
 * gamma with `{{expiryDate}}` placeholders no template ever used.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATES: Record<string, { template: EmailTemplate<any>; footerContext: string }> = {
  'payment.received': {
    template: paymentReceivedTemplate,
    footerContext: PAYMENT_RECEIVED_FOOTER_CONTEXT,
  },
};

export function hasTemplate(eventKey: string): boolean {
  return eventKey in TEMPLATES;
}

/**
 * A plain-text twin of the HTML.
 *
 * Not decoration: a message with no text part scores worse with spam
 * filters, and deliverability is the whole reason we care. Crude by
 * design — strip the markup, keep the words, collapse the whitespace.
 */
function toPlainText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|tr|h1|h2|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')
    .trim();
}

/**
 * Render one queued row.
 *
 * ⭐ Renders from `payload_json` ALONE — it never reads a table. That is
 * what makes the snapshot worth storing: a receipt re-sent weeks later
 * still states what was true when the money moved, and a retry cannot
 * quietly produce different words than the first attempt did.
 *
 * Returns null when there is no template for the event key, which the
 * sender treats as a permanent failure rather than an exception — a row
 * queued for an email nobody built should land on the admin page saying
 * exactly that, not crash the sweep for every other row behind it.
 */
export function renderOutboxRow(row: Pick<OutboxRow, 'event_key' | 'payload_json'>): Rendered | null {
  const entry = TEMPLATES[row.event_key];
  if (!entry) return null;

  const payload = row.payload_json;
  const subject = entry.template.subject(payload);
  const inner = entry.template.body(payload);
  const html = wrap({ heading: subject, body: inner, footer: footer(entry.footerContext) });

  return { subject, html, text: toPlainText(html) };
}

/**
 * Every preview variant across every template, for /admin/emails/preview.
 * Reuses the exact render path a real send takes — a preview that went
 * through different code would prove nothing.
 */
export function allPreviews(): { eventKey: string; label: string; rendered: Rendered }[] {
  const out: { eventKey: string; label: string; rendered: Rendered }[] = [];
  for (const [eventKey, entry] of Object.entries(TEMPLATES)) {
    for (const preview of entry.template.previews) {
      const rendered = renderOutboxRow({ event_key: eventKey, payload_json: preview.payload });
      if (rendered) out.push({ eventKey, label: preview.label, rendered });
    }
  }
  return out;
}
