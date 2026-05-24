// mynclex/lib/discovery/enquiry-actions.ts
//
// Public "Contact tutor" action (Slice 8a). Called from the programme
// detail page by an UNAUTHENTICATED visitor — no account required. All
// it does is forward to the nclex_submit_enquiry RPC, which is granted
// to anon and does the real validation (programme enquiry-eligible?
// email valid? phone-required-when-phone-channel?) + idempotent insert
// in one auditable place. We mirror the light field checks here only
// for instant, friendly feedback.

'use server';

import { createClient } from '@/lib/supabase/server';

export type SubmitEnquiryResult = { ok: true } | { ok: false; error: string };

const ALLOWED_CONTACT = ['CALL', 'SMS', 'WHATSAPP', 'EMAIL'] as const;
const PHONE_METHODS = ['CALL', 'SMS', 'WHATSAPP'];

export async function submitEnquiryAction(
  formData: FormData,
): Promise<SubmitEnquiryResult> {
  const programmeId = String(formData.get('programmeId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const phone = phoneRaw === '' ? null : phoneRaw;
  const messageRaw = String(formData.get('message') ?? '').trim();
  const message = messageRaw === '' ? null : messageRaw;

  // Preferred-contact checkboxes (name="preferred"); keep only allowed
  // values, default to EMAIL when none ticked.
  let preferred = formData
    .getAll('preferred')
    .map((v) => String(v))
    .filter((v): v is (typeof ALLOWED_CONTACT)[number] =>
      (ALLOWED_CONTACT as readonly string[]).includes(v),
    );
  if (preferred.length === 0) preferred = ['EMAIL'];

  if (!programmeId) {
    return { ok: false, error: 'Programme is missing — please refresh the page.' };
  }
  if (!name) {
    return { ok: false, error: 'Please enter your name.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (preferred.some((p) => PHONE_METHODS.includes(p)) && !phone) {
    return {
      ok: false,
      error: 'Please add a phone number for call, SMS, or WhatsApp contact.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('nclex_submit_enquiry', {
    p_programme_id: programmeId,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_preferred_contact: preferred,
    p_message: message,
  });

  if (error) {
    // The eligibility check is the only RPC failure a normal visitor can
    // realistically hit (e.g. the tutor switched the programme to
    // on-platform between page load and submit). Keep the message human.
    if (error.message.includes('not accepting enquiries')) {
      return {
        ok: false,
        error: 'This programme is no longer accepting enquiries. Please refresh the page.',
      };
    }
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }

  return { ok: true };
}
