// mynclex/lib/curriculum/activity-payload.ts
//
// Pure + Supabase-helper validators for activity payloads, extracted
// from actions.ts (slice "cohort-specific activities" 1) so they can be
// reused by the cohort-only activity actions in lib/cohorts/actions.ts.
//
// WHY a separate module: actions.ts is a 'use server' file, where every
// export must be an async Server Action. buildPayload() is sync and
// validatePdfAssetForSave() takes a Supabase client argument — neither is
// a Server Action — so they can't be exported from there. They live here
// (a plain module) and are imported by BOTH actions.ts and the cohort
// actions, keeping the per-type validation single-sourced.

import type { createClient } from '@/lib/supabase/server';
import type { ActivityFormValues } from './types';

// Shared SupabaseClient type for the client-using validators.
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Slice 9.3d-a — URL gate.
// Accepts http: + https: only. `javascript:`, `data:`, `file:`,
// and any other scheme rejects so we can safely render the URL
// as an anchor on the student side without an XSS vector.
export function validateHttpUrl(
  value: string,
  fieldLabel: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `${fieldLabel} is not a valid URL.` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `${fieldLabel} must start with http:// or https://`,
    };
  }
  return { ok: true, url: trimmed };
}

// Slice 9.3d-a — datetime gate.
// The client sends UTC ISO (converted from the datetime-local
// input via new Date(localStr).toISOString()). We re-parse to
// catch malformed values and re-emit canonical ISO.
export function validateScheduledAt(
  value: string
): { ok: true; iso: string } | { ok: false; error: string } {
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { ok: false, error: 'Session date/time is not valid.' };
  }
  return { ok: true, iso: d.toISOString() };
}

// Slice 9.3d-a — payload builder.
// Per-type validation + assembly of the JSONB payload column. The
// discriminated `ActivityFormValues` argument narrows on `type`;
// every branch returns the strict payload shape for that type.
//
// All six activity types are covered as of slice 9.3d-d. MOCK +
// PRACTICE_QUIZ ship with the future-link shape pre-populated to
// `{ quiz_id: null }` — strict null today; relaxes to accept a
// real id when the central tutor-quiz system lands.
export function buildPayload(
  values: ActivityFormValues
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  switch (values.type) {
    case 'TEXT': {
      return {
        ok: true,
        payload: {
          body: values.body,
          ...(values.estimated_minutes != null
            ? { estimated_minutes: values.estimated_minutes }
            : {}),
        },
      };
    }
    case 'PDF': {
      // pdf_asset_id is required at the type level (string, not
      // nullable) because the modal-side buildValues blocks save
      // without one. Defence in depth: re-check here.
      if (!values.pdf_asset_id) {
        return { ok: false, error: 'A PDF is required.' };
      }
      return {
        ok: true,
        payload: {
          pdf_asset_id: values.pdf_asset_id,
          ...(values.estimated_minutes != null
            ? { estimated_minutes: values.estimated_minutes }
            : {}),
        },
      };
    }
    case 'EXTERNAL_LINK': {
      const u = validateHttpUrl(values.url, 'URL');
      if (!u.ok) return u;
      return {
        ok: true,
        payload: {
          url: u.url,
          ...(values.estimated_minutes != null
            ? { estimated_minutes: values.estimated_minutes }
            : {}),
        },
      };
    }
    case 'ONLINE_LIVE_SESSION': {
      const when = validateScheduledAt(values.scheduled_at);
      if (!when.ok) return when;

      if (
        !Number.isInteger(values.duration_minutes) ||
        values.duration_minutes <= 0
      ) {
        return {
          ok: false,
          error: 'Duration must be a positive whole number of minutes.',
        };
      }

      const join = validateHttpUrl(values.join_url, 'Join URL');
      if (!join.ok) return join;

      let recordingClean: string | null = null;
      if (values.recording_url != null && values.recording_url.trim() !== '') {
        const rec = validateHttpUrl(values.recording_url, 'Recording URL');
        if (!rec.ok) return rec;
        recordingClean = rec.url;
      }

      return {
        ok: true,
        payload: {
          scheduled_at: when.iso,
          duration_minutes: values.duration_minutes,
          join_url: join.url,
          ...(recordingClean ? { recording_url: recordingClean } : {}),
        },
      };
    }
    case 'MOCK':
    case 'PRACTICE_QUIZ': {
      // Publish gate: a Live quiz activity with no quiz linked is a
      // permanently dead "Open" button for students. A draft may be
      // saved without one. The quiz's ownership / kind /
      // published-status is checked separately in the action via
      // validateQuizForActivity — that needs a DB read so it can't
      // live in this pure builder.
      if (values.is_published && !values.quiz_id) {
        return {
          ok: false,
          error:
            'Choose a quiz before publishing this activity. You can save it as a draft without one.',
        };
      }
      return { ok: true, payload: { quiz_id: values.quiz_id ?? null } };
    }
  }
}

// Slice 9.3d-c — PDF asset gate.
// Used by create/edit-PDF-activity paths after buildPayload. RLS on
// nclex_media_assets enforces owner_user_id = auth.uid() on SELECT,
// so a missing row means "doesn't exist OR isn't yours" — both
// surface as the same generic error so a malicious client can't
// probe for asset ids belonging to someone else. Also rejects
// not-READY rows (mid-upload, soft-deleted) and any non-PDF
// purpose. Supabase-client-using, so it can't live inside the pure
// buildPayload() switch.
export async function validatePdfAssetForSave(
  supabase: SupabaseClient,
  assetId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase
    .from('nclex_media_assets')
    .select('asset_id, status, purpose')
    .eq('asset_id', assetId)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: 'PDF not found or not yours to use.' };
  }
  if (data.status !== 'READY') {
    return {
      ok: false,
      error: `PDF is not available (status: ${data.status}). Please re-upload.`,
    };
  }
  if (data.purpose !== 'PDF_ACTIVITY') {
    return { ok: false, error: 'Asset is not a PDF activity file.' };
  }
  return { ok: true };
}
