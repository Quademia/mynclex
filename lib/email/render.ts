// mynclex/lib/email/render.ts
//
// Fills in the blanks: a queued row goes in, a finished subject line and
// page come out. The one place that knows which template belongs to
// which event key.
//
// Doc: docs/product-plan/transactional-email.md

import type { EmailAttachment, EmailTemplate, OutboxRow } from './types';
import { wrap } from './templates/wrapper';
import { footer } from './templates/footer';
import {
  inactivityNudgeTemplate,
  INACTIVITY_NUDGE_FOOTER_CONTEXT,
} from './templates/inactivity-nudge';
import {
  PAYMENT_RECEIVED_FOOTER_CONTEXT,
  paymentReceivedTemplate,
} from './templates/payment-received';
import {
  ENROLMENT_ADDED_FOOTER_CONTEXT,
  enrolmentAddedTemplate,
} from './templates/enrolment-added';
import {
  ENROLMENT_APPROVED_FOOTER_CONTEXT,
  enrolmentApprovedTemplate,
} from './templates/enrolment-approved';
import {
  ENROLMENT_REJECTED_FOOTER_CONTEXT,
  enrolmentRejectedTemplate,
} from './templates/enrolment-rejected';
import {
  PAYMENT_TUTOR_RECEIVED_FOOTER_CONTEXT,
  paymentTutorReceivedTemplate,
} from './templates/payment-tutor-received';
import {
  PAYMENT_INSTALLMENT_DUE_FOOTER_CONTEXT,
  paymentInstallmentDueTemplate,
} from './templates/payment-installment-due';
import {
  PAYMENT_INSTALLMENT_OVERDUE_FOOTER_CONTEXT,
  paymentInstallmentOverdueTemplate,
} from './templates/payment-installment-overdue';
import {
  SESSION_REMINDER_FOOTER_CONTEXT,
  sessionReminderTemplate,
} from './templates/session-reminder';
import {
  TUTOR_ADDED_BY_ADMIN_FOOTER_CONTEXT,
  tutorAddedByAdminTemplate,
} from './templates/tutor-added-by-admin';
import {
  TUTOR_SUSPENDED_FOOTER_CONTEXT,
  tutorSuspendedTemplate,
} from './templates/tutor-suspended';
import {
  TUTOR_REINSTATED_FOOTER_CONTEXT,
  tutorReinstatedTemplate,
} from './templates/tutor-reinstated';
import {
  TUTOR_APPLICATION_APPROVED_FOOTER_CONTEXT,
  tutorApplicationApprovedTemplate,
} from './templates/tutor-application-approved';
import {
  TUTOR_APPLICATION_REJECTED_FOOTER_CONTEXT,
  tutorApplicationRejectedTemplate,
} from './templates/tutor-application-rejected';
import {
  TUTOR_APPLICATION_RECEIVED_FOOTER_CONTEXT,
  tutorApplicationReceivedTemplate,
} from './templates/tutor-application-received';
import {
  TUTOR_APPLICATION_SUBMITTED_ADMIN_FOOTER_CONTEXT,
  tutorApplicationSubmittedAdminTemplate,
} from './templates/tutor-application-submitted-admin';

export type Rendered = {
  subject: string;
  html: string;
  text: string;
  /**
   * Files travelling with it. Present only for templates that declare
   * `attachments` — one, at the time of writing (`session.reminder`).
   *
   * ⚠ Resolved HERE, on the same pass that builds the HTML, so a retry
   * rebuilds the attachment from the same frozen payload and cannot send
   * a calendar file that disagrees with the words beside it.
   */
  attachments?: EmailAttachment[];
};

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
  // ⭐ The only entry here for an email nobody triggered — it fires
  // because a student did nothing. Its payload is written in SQL by the
  // nightly sweep, so nothing type-checks it at the boundary.
  'progress.inactivity_nudge': {
    template: inactivityNudgeTemplate,
    footerContext: INACTIVITY_NUDGE_FOOTER_CONTEXT,
  },
  'payment.received': {
    template: paymentReceivedTemplate,
    footerContext: PAYMENT_RECEIVED_FOOTER_CONTEXT,
  },
  // ⭐ NOT an alias of payment.received. Same anchor, same money, but a
  // different recipient reading for a different reason — so it is its own
  // template with its own words, and the two are free to diverge.
  'payment.tutor_received': {
    template: paymentTutorReceivedTemplate,
    footerContext: PAYMENT_TUTOR_RECEIVED_FOOTER_CONTEXT,
  },
  // ⭐ Both are enqueued from SQL by the nightly sweep (migration
  // 20260911120000), not by app code — the only two entries here that
  // are. Their payloads are therefore unchecked at the boundary; see the
  // warning on InstallmentDuePayload in types.ts.
  'payment.installment_due': {
    template: paymentInstallmentDueTemplate,
    footerContext: PAYMENT_INSTALLMENT_DUE_FOOTER_CONTEXT,
  },
  'payment.installment_overdue': {
    template: paymentInstallmentOverdueTemplate,
    footerContext: PAYMENT_INSTALLMENT_OVERDUE_FOOTER_CONTEXT,
  },
  // ⭐ The first FAN-OUT entry, and the first template with an
  // attachment. Its payload is also written in SQL — by ONE plpgsql
  // builder that both the nightly sweep and the tutor's button call, so
  // the two triggers cannot drift into two different emails.
  'session.reminder': {
    template: sessionReminderTemplate,
    footerContext: SESSION_REMINDER_FOOTER_CONTEXT,
  },
  'enrolment.tutor_added': {
    template: enrolmentAddedTemplate,
    footerContext: ENROLMENT_ADDED_FOOTER_CONTEXT,
  },
  // ⭐ The two halves of a tutor's verdict on a place already paid for.
  // Two templates, NOT one with a dial: an approval and a refusal share
  // their facts but nothing else — different words, different
  // destination, different footer.
  'enrolment.approved': {
    template: enrolmentApprovedTemplate,
    footerContext: ENROLMENT_APPROVED_FOOTER_CONTEXT,
  },
  'enrolment.rejected': {
    template: enrolmentRejectedTemplate,
    footerContext: ENROLMENT_REJECTED_FOOTER_CONTEXT,
  },
  // ⭐ An ALIAS, not a second template. Same file, same words, one dial
  // turned — see enrolment-added.ts. Both keys must render, because a
  // queued waitlist.converted row has to become an email; but the
  // template declares `key: 'enrolment.tutor_added'`, and that mismatch
  // is what marks this row as an alias for the preview list below.
  'waitlist.converted': {
    template: enrolmentAddedTemplate,
    footerContext: ENROLMENT_ADDED_FOOTER_CONTEXT,
  },
  'tutor.added_by_admin': {
    template: tutorAddedByAdminTemplate,
    footerContext: TUTOR_ADDED_BY_ADMIN_FOOTER_CONTEXT,
  },
  'tutor.suspended': {
    template: tutorSuspendedTemplate,
    footerContext: TUTOR_SUSPENDED_FOOTER_CONTEXT,
  },
  'tutor.reinstated': {
    template: tutorReinstatedTemplate,
    footerContext: TUTOR_REINSTATED_FOOTER_CONTEXT,
  },
  // ⭐ The verdict pair for someone who ASKED, as opposed to
  // tutor.added_by_admin above, which greets someone an admin chose.
  // Deliberately NOT an alias of it — see tutor-application-approved.ts.
  'tutor.application_approved': {
    template: tutorApplicationApprovedTemplate,
    footerContext: TUTOR_APPLICATION_APPROVED_FOOTER_CONTEXT,
  },
  'tutor.application_rejected': {
    template: tutorApplicationRejectedTemplate,
    footerContext: TUTOR_APPLICATION_REJECTED_FOOTER_CONTEXT,
  },
  'tutor.application_received': {
    template: tutorApplicationReceivedTemplate,
    footerContext: TUTOR_APPLICATION_RECEIVED_FOOTER_CONTEXT,
  },
  // ⭐ The only entry in this table whose recipient is us. See the
  // template for why its disclosure rules are the inverse of every
  // other one here.
  'tutor.application_submitted_admin': {
    template: tutorApplicationSubmittedAdminTemplate,
    footerContext: TUTOR_APPLICATION_SUBMITTED_ADMIN_FOOTER_CONTEXT,
  },
};

/**
 * A registry key that is not the template's own key is an alias — two
 * events sharing one template. Aliases render, but they are hidden from
 * the preview list so one email does not appear twice under two names
 * with identical variants beneath each.
 */
function isAlias(registryKey: string, entry: { template: { key: string } }): boolean {
  return registryKey !== entry.template.key;
}

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
  const attachments = entry.template.attachments?.(payload);

  return { subject, html, text: toPlainText(html), attachments };
}

export type PreviewVariant = {
  eventKey: string;
  /** The template's human name, repeated on each variant so a filtered
   *  list still knows what it is looking at without a second lookup. */
  name: string;
  label: string;
  rendered: Rendered;
};

/**
 * Every preview variant across every template, for /admin/emails/preview.
 * Reuses the exact render path a real send takes — a preview that went
 * through different code would prove nothing.
 *
 * Pass an event key to render only that template's variants. The page
 * uses this for its detail view; unrecognised keys yield an empty array,
 * which the page shows as "no such template" rather than an error.
 */
export function allPreviews(eventKey?: string): PreviewVariant[] {
  const out: PreviewVariant[] = [];
  for (const [key, entry] of Object.entries(TEMPLATES)) {
    if (eventKey ? key !== eventKey : isAlias(key, entry)) continue;
    for (const preview of entry.template.previews) {
      const rendered = renderOutboxRow({ event_key: key, payload_json: preview.payload });
      if (rendered) out.push({ eventKey: key, name: entry.template.name, label: preview.label, rendered });
    }
  }
  return out;
}

/**
 * One row per built template, for the preview list.
 *
 * ⚠ Reads TEMPLATES, not the catalog. The plan doc lists 24 emails; this
 * lists what exists. A list built from the catalog would advertise
 * templates nobody wrote — the same mismatch that left gamma with
 * placeholders no template ever used.
 */
export function templateIndex(): { eventKey: string; name: string; variantCount: number }[] {
  return Object.entries(TEMPLATES)
    .filter(([key, entry]) => !isAlias(key, entry))
    .map(([eventKey, entry]) => ({
      eventKey,
      name: entry.template.name,
      variantCount: entry.template.previews.length,
    }));
}
