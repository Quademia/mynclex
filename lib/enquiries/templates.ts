// mynclex/lib/enquiries/templates.ts
//
// Quick-reply templates for the tutor V1 polished inbox (Slice 8 UI
// rebuild). Each template is a labelled canned message the tutor can
// fire in one click; the reply-bar component pairs it with the lead's
// preferred channel (WhatsApp / Call / SMS / Email) and URL-encodes
// the body into the deep-link.
//
// Audience is Ghanaian nurses pursuing US/UK/Canada migration — bodies
// are written in plain English, no jargon. Placeholders use {name},
// {tutor}, {programme} — `renderTemplate()` handles the substitution.
// Keep these in one place so the copy stays consistent + easy to tune.

import type { ContactChannel } from '@/lib/discovery/contact-options';

export type QuickReplyTemplate = {
  id: 'cohort-dates' | 'payment-plan' | 'schedule-call' | 'custom';
  label: string;          // Short caption with leading emoji.
  description: string;    // One-line "what this sends" for the card hint.
  // Channel the template is best for. The component may fall back to
  // another channel if the lead's preferred_contact doesn't include it
  // — e.g. SCHEDULE_CALL prefers CALL but degrades to WHATSAPP/SMS to
  // request a call time.
  bestChannel: ContactChannel;
  // For 'custom' the body is empty — opens the composer blank.
  body: string;
  emailSubject?: string;
};

// Renders a template body against a lead context. Unrecognised
// placeholders are left in place (no silent stripping) so the tutor
// notices and edits before sending.
export type TemplateRenderContext = {
  name: string;          // Lead's name
  tutor: string;         // Tutor's display name
  programme: string;     // Programme title
};

export function renderTemplate(
  template: Pick<QuickReplyTemplate, 'body'>,
  ctx: TemplateRenderContext,
): string {
  return template.body
    .replaceAll('{name}', ctx.name)
    .replaceAll('{tutor}', ctx.tutor)
    .replaceAll('{programme}', ctx.programme);
}

export const QUICK_REPLY_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'cohort-dates',
    label: '📅 Send cohort dates + fees',
    description: "Reply with the next cohort's start date and the fee.",
    bestChannel: 'WHATSAPP',
    body:
      'Hi {name}, thanks for reaching out about {programme}.\n\n' +
      "Our next cohort starts on [DATE]. The fee is [AMOUNT], with payment plans available if you need them.\n\n" +
      'Let me know if you have any questions before signing up — happy to jump on a quick call.\n\n' +
      '— {tutor}',
    emailSubject: 'Next cohort dates for {programme}',
  },
  {
    id: 'payment-plan',
    label: '💳 Share payment plan',
    description: 'Outline deposit + installment options.',
    bestChannel: 'WHATSAPP',
    body:
      'Hi {name}, here are the payment options for {programme}:\n\n' +
      '• Pay in full: [TOTAL]\n' +
      '• Deposit + balance: [DEPOSIT] now, [BALANCE] in [N] days\n' +
      '• Installments: [N] × [PER]\n\n' +
      "Let me know which works for you and I'll set you up.\n\n" +
      '— {tutor}',
    emailSubject: 'Payment options for {programme}',
  },
  {
    id: 'schedule-call',
    label: '📞 Schedule a call',
    description: 'Propose two call times the lead can pick from.',
    bestChannel: 'WHATSAPP',
    body:
      'Hi {name}, easier to talk through {programme} on a quick call?\n\n' +
      "I'm free [DAY 1] [TIME] or [DAY 2] [TIME] — let me know which works for you and I'll call.\n\n" +
      '— {tutor}',
    emailSubject: 'Quick call about {programme}?',
  },
  {
    id: 'custom',
    label: '✍️ Write custom',
    description: 'Open the channel without a template — write your own.',
    bestChannel: 'WHATSAPP',
    body: '',
  },
];
