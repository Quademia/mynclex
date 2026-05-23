// mynclex/lib/discovery/contact-options.ts
//
// Single source of truth for the "how should the tutor reach you?"
// channel set. Used by the cohort-waitlist form (Slice 4) and the
// programme-enquiry form (Slice 8a). The same set is enforced at the
// DB level (CHECK constraints on nclex_cohort_waitlist.preferred_contact
// and nclex_programme_enquiries.preferred_contact); changing the allowed
// channels here means changing both CHECKs in lockstep.
//
// Audience is WhatsApp-heavy (Ghanaian nurses pursuing US/UK/Canada
// migration), so phone-based channels matter — the form makes Phone
// required the moment any phone-based channel is ticked.

export type ContactChannel = 'WHATSAPP' | 'CALL' | 'SMS' | 'EMAIL';

export interface ContactOption {
  value: ContactChannel;
  label: string;
  needsPhone: boolean;
}

export const CONTACT_OPTIONS: ContactOption[] = [
  { value: 'WHATSAPP', label: 'WhatsApp', needsPhone: true },
  { value: 'CALL',     label: 'Call',     needsPhone: true },
  { value: 'SMS',      label: 'SMS',      needsPhone: true },
  { value: 'EMAIL',    label: 'Email',    needsPhone: false },
];

// True when the chosen set contains any phone-based channel — the form
// flips the Phone field's (optional)/(required) hint + HTML required
// attribute off this.
export function preferredContactNeedsPhone(chosen: ReadonlySet<string>): boolean {
  return CONTACT_OPTIONS.some((o) => o.needsPhone && chosen.has(o.value));
}
