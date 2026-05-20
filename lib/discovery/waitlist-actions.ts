// mynclex/lib/discovery/waitlist-actions.ts
//
// Public "Join the waitlist" action (Payments Slice 4). Called from the
// programme detail page by an UNAUTHENTICATED visitor — no account
// required. All it does is forward to the nclex_join_waitlist RPC, which
// is granted to anon and does the real validation (cohort open? email
// valid?) + idempotent insert in one auditable place. We mirror the
// light field checks here only for instant, friendly feedback.

'use server';

import { createClient } from '@/lib/supabase/server';

export type JoinWaitlistResult = { ok: true } | { ok: false; error: string };

const ALLOWED_CONTACT = ['CALL', 'SMS', 'WHATSAPP', 'EMAIL'] as const;
const PHONE_METHODS = ['CALL', 'SMS', 'WHATSAPP'];

export async function joinWaitlistAction(
  formData: FormData,
): Promise<JoinWaitlistResult> {
  const cohortId = String(formData.get('cohortId') ?? '').trim();
  const forename = String(formData.get('forename') ?? '').trim();
  const surname = String(formData.get('surname') ?? '').trim();
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

  if (!cohortId) {
    return { ok: false, error: 'Please choose a cohort to join.' };
  }
  if (!forename || !surname) {
    return { ok: false, error: 'Please enter your first name and surname.' };
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
  const { error } = await supabase.rpc('nclex_join_waitlist', {
    p_cohort_id: cohortId,
    p_forename: forename,
    p_surname: surname,
    p_email: email,
    p_phone: phone,
    p_preferred_contact: preferred,
    p_message: message,
  });

  if (error) {
    // The cohort-open check is the only RPC failure a normal visitor can
    // realistically hit (e.g. the cohort closed between page load and
    // submit); everything else is caught above. Keep the message human.
    if (error.message.includes('not open')) {
      return {
        ok: false,
        error: 'This cohort is no longer open to join. Please refresh the page.',
      };
    }
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }

  return { ok: true };
}
