// mynclex/lib/auth/thresholds.ts
//
// The per-email rate limits — build-order item 2, slice 2c. Gamma's rules
// (db/migrations/auth_events_and_rate_limit.sql + reset_rate_limit.sql in
// the sibling repo) ported into our server actions, counting the rows
// slice 2a's logbook already writes. No migration: the index this needs
// (email, occurred_at DESC) and the *_BLOCKED event types were both put
// in place by 2a for exactly this.
//
// ⭐ IT FAILS OPEN, ON PURPOSE. If the count query breaks, every caller is
// ALLOWED through. Closed would be the instinctive choice and it is the
// wrong one: it converts a database blip into "nobody in the world can
// sign in", which is a far worse outage than "for ten minutes we did not
// rate-limit". This is also what domain-and-identity.md already promises —
// "if the table broke ... only the per-email thresholds and support
// visibility would pause". Layers 1 and 3 (Turnstile, the auth hook) stand
// on their own and are unaffected.
//
// ⚠ EMAIL AXIS ONLY, AND THAT IS A REAL GAP UNTIL 2d. Gamma runs a second
// axis on a device fingerprint, and — read its SQL closely — that axis has
// no email filter on it, so it is not a duplicate of this one. It catches
// the opposite attack: ONE machine failing against MANY addresses (a
// spray), where this catches many attempts against one address
// (credential stuffing on a known target). We dropped the fingerprint
// deliberately (2a removed fp_hash/ua_hash to keep quasi-identifying data
// out of the table) and Turnstile is the substitute — a better one, since
// the native Supabase integration binds the direct auth endpoint that our
// server actions never see. But that is only true once 2d ships. Until
// then the spray door has no lock on it that gamma didn't have.
//
// ⚠ AND IT MUST NEVER GROW AN IP AXIS. The address is logged and never
// enforced on: Ghanaian mobile carriers put thousands of subscribers
// behind a handful of addresses, so one per-IP rule could lock out a
// whole network's worth of nurses on a busy evening.

import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/** One rule: "more than `limit` events inside `windowSec` and you're out." */
type Rule = {
  windowSec: number;
  limit: number;
  /** Written to the blocked row's `reason` so support can see which rule fired. */
  label: string;
};

/**
 * The long login rule, named because the login form has to recognise it:
 * a 24-hour lockout offers the reset link, a 10-minute one does not.
 * Exported so that comparison is a shared constant rather than the same
 * string literal typed out in two files — rename it here and a stale
 * comparison becomes a compile error instead of a link that quietly
 * stops appearing.
 */
export const LOGIN_RULE_24H = 'threshold_24h';

// Gamma's numbers, unchanged. Graduated on purpose — the short window is a
// sharp brake on a burst, the long one catches the patient attacker who
// spaces attempts out to stay under it.
const LOGIN_RULES: Rule[] = [
  { windowSec: 10 * 60, limit: 5, label: 'threshold_10min' },
  { windowSec: 24 * 60 * 60, limit: 10, label: LOGIN_RULE_24H },
];

const RESET_RULES: Rule[] = [
  { windowSec: 60 * 60, limit: 3, label: 'threshold_60min' },
];

// Slice 3c. Deliberately the same shape and the same numbers as RESET_RULES,
// because it is the same shape of abuse: an address being made to receive
// email it did not ask for. Copying the reset rule rather than inventing a
// number means there is one answer to "how often may a stranger make your
// inbox ring", not two that drift.
//
// ⚠ NO LONG RULE, for the reason reset has none. A second, 24-hour window
// would catch the patient attacker — but the only thing he wins by being
// patient here is that somebody else's inbox gets a few more emails, and
// the cost of the rule lands on a student who genuinely cannot get a code
// to arrive and is trying again this evening.
const CODE_REQUEST_RULES: Rule[] = [
  { windowSec: 60 * 60, limit: 3, label: 'threshold_request_60min' },
];

/**
 * Never report "try again in 0 seconds" — the student refreshes instantly,
 * gets blocked again, and learns the countdown is lying. Gamma floors at
 * 30/60s for the same reason.
 */
const MIN_RETRY_SECONDS = 30;

export type ThresholdVerdict =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number; rule: string };

/**
 * The whole decision, as pure arithmetic — no database, no clock of its
 * own. Split out from the queries below so the interesting part is
 * testable without mocking Supabase.
 *
 * ⭐ WHY THE Nth-NEWEST AND NOT THE OLDEST. Gamma computes its countdown
 * from MIN(created_utc), the oldest attempt in the window. That is right
 * only when the count sits exactly on the threshold. With 7 failures
 * against a limit of 5, ageing out the oldest leaves 6 — still blocked —
 * so gamma tells her "2 minutes", she comes back, and she is refused
 * again. A countdown that lies is worse than no countdown, and the
 * countdown is the reason this rule exists rather than a flat refusal.
 *
 * The exact answer is short: rows sorted newest-first, the block lifts
 * when the `limit`-th newest ages out of the window, because that is the
 * moment the in-window count first drops to limit - 1. It also needs at
 * most `limit` rows, so the query stays tiny.
 *
 * @param occurredAtMs event times in ms, any order — sorted here.
 * @param nowMs        the caller's clock, injected so tests aren't timing-dependent.
 */
export function decide(
  occurredAtMs: number[],
  rules: Rule[],
  nowMs: number
): ThresholdVerdict {
  const newestFirst = [...occurredAtMs].sort((a, b) => b - a);

  let unblockAtMs = 0;
  let firedRule = '';

  for (const rule of rules) {
    const windowMs = rule.windowSec * 1000;
    const cutoff = nowMs - windowMs;

    const inWindow = newestFirst.filter((t) => t > cutoff);
    if (inWindow.length < rule.limit) continue;

    const nthNewest = inWindow[rule.limit - 1];
    const lifts = nthNewest + windowMs;

    // Both rules can be tripped at once. The one that keeps her out
    // longest is the one that decides — anything else would quote a
    // countdown that expires while she is still blocked by the other.
    if (lifts > unblockAtMs) {
      unblockAtMs = lifts;
      firedRule = rule.label;
    }
  }

  if (!firedRule) return { blocked: false };

  return {
    blocked: true,
    retryAfterSeconds: Math.max(
      MIN_RETRY_SECONDS,
      Math.ceil((unblockAtMs - nowMs) / 1000)
    ),
    rule: firedRule,
  };
}

/**
 * Fetch the recent events one email needs, then decide.
 *
 * The service-role client is not a shortcut — it is the only option. The
 * caller here is anonymous by definition (she is standing at the login
 * form), and nclex_auth_events grants SELECT to admins alone. Same
 * reasoning as the write side in events.ts.
 *
 * ⭐ ONLY THE UN-BLOCKED FAILURES ARE COUNTED. `eventTypes` deliberately
 * excludes LOGIN_BLOCKED / RESET_BLOCKED, so a refusal never feeds the
 * counter that produced it. Without that, one tripped limit renews itself
 * every time she retries and a ten-minute block becomes permanent. 2a made
 * this structural by giving blocks their own event type rather than a flag
 * — the exclusion is a fact in the data, not a rule each query has to
 * remember.
 */
async function check(
  email: string,
  eventTypes: string[],
  rules: Rule[]
): Promise<ThresholdVerdict> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return { blocked: false };

  // The longest window and the largest limit across the rule set: fetch
  // once, and every rule reads off the same rows.
  const widestWindowSec = Math.max(...rules.map((r) => r.windowSec));
  const deepestLimit = Math.max(...rules.map((r) => r.limit));

  const nowMs = Date.now();
  const since = new Date(nowMs - widestWindowSec * 1000).toISOString();

  try {
    const { data, error } = await createServiceRoleClient()
      .from('nclex_auth_events')
      .select('occurred_at')
      .eq('email', normalised)
      .in('event_type', eventTypes)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(deepestLimit);

    if (error) {
      // Fails open — see the header. Loud in the log, invisible to her.
      console.error('[auth-thresholds] count failed', error.message);
      return { blocked: false };
    }

    return decide(
      (data ?? []).map((row) => new Date(row.occurred_at as string).getTime()),
      rules,
      nowMs
    );
  } catch (err) {
    console.error('[auth-thresholds] count failed', err);
    return { blocked: false };
  }
}

/** 5 failures in 10 minutes, or 10 in 24 hours, for this address. */
export function checkLoginThreshold(email: string): Promise<ThresholdVerdict> {
  // LOGIN_FAIL alone. CODE_LOGIN_FAIL arrives with slice 3 and gets its own
  // rule there — folding it in here would let a student's mistyped login
  // code lock her out of her password too.
  return check(email, ['LOGIN_FAIL'], LOGIN_RULES);
}

/** 3 reset requests in 60 minutes, for this address. */
export function checkResetThreshold(email: string): Promise<ThresholdVerdict> {
  return check(email, ['RESET_REQUESTED'], RESET_RULES);
}

/**
 * 3 sign-in codes in 60 minutes, for this address (slice 3c).
 *
 * ⭐ COUNTS REQUESTS, NOT FAILURES, and that is the difference between this
 * and the login rule above. There is no such thing as a failed code
 * request: an unknown address and a real one both return the same silent
 * success, by design. So the thing worth limiting is the asking itself —
 * every ask is potentially an email somebody did not want.
 *
 * ⓘ CODE_REQUESTED is written for unknown addresses too, even though no
 * email is sent to them. If it were not, this rule would only ever bite
 * real accounts, and how quickly the limit tripped would itself answer the
 * question the whole flow refuses to answer.
 */
export function checkCodeRequestThreshold(email: string): Promise<ThresholdVerdict> {
  return check(email, ['CODE_REQUESTED'], CODE_REQUEST_RULES);
}

/**
 * "8 minutes" / "about 3 hours" — the tail of the message the student
 * reads, so it is written the way a person would say it rather than as a
 * unit conversion. Rounds UP throughout: telling her to come back a minute
 * early only earns her a second refusal.
 */
export function formatRetry(seconds: number): string {
  if (seconds <= 90) return 'in a minute';

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} minutes`;

  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'in about an hour' : `in about ${hours} hours`;
}
