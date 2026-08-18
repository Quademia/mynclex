// mynclex/app/cron/email-drain/route.ts
//
// The private door a scheduler knocks on to say "send anything waiting".
//
// ⓘ WHY THERE IS A DOOR AT ALL. pg_cron can select rows and write rows,
// and with pg_net it can even make an HTTP call — but it cannot RENDER an
// email, because the templates are .ts files and nothing inside Postgres
// executes those. So the database's part ends at "there is post", and
// something in the app has to do the sending. This is that something's
// address. The standing rule is untouched: SENDS STAY APP-LAYER, NEVER
// FROM A POSTGRES TRIGGER (see the outbox migration's header) — a trigger
// that rings this bell is not sending, it is ringing.
//
// ⓘ WHY IT LIVES UNDER app/cron/. This repo has no `app/api/`; route
// handlers sit at the top level (`app/logout/route.ts`,
// `app/auth/callback/route.ts`). `cron/` groups the addresses that
// MACHINES knock on rather than pages a person visits, so that a year from
// now this does not read as a stray route next to /login. The stuck-queue
// alarm is the likely second occupant.
//
// ⓘ Middleware does not need changing: this path is not in
// AUTH_REQUIRED_PREFIXES, so the auth guard lets it through untouched. The
// gate here is the shared secret, deliberately — a caller with no session
// is the normal case, not the suspicious one.
//
// Doc: docs/product-plan/transactional-email.md → "1b — the shape"

import { drainOutbox } from '@/lib/email/drain';
import { NextResponse, type NextRequest } from 'next/server';

// A queue read must never be served from a cache. Whatever is due changes
// by the minute, and a cached "0 sent" would be indistinguishable from a
// drain that is quietly no longer running — the exact silence this whole
// layer exists to catch.
export const dynamic = 'force-dynamic';

/**
 * Compare without leaking the answer through timing.
 *
 * Over a network this is close to theatre — but it costs three lines, and
 * the alternative habit (`a === b` on a secret) is the one worth not
 * forming.
 */
function secretMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;

  // ⚠ NO SECRET CONFIGURED MEANS CLOSED, NEVER OPEN. A missing environment
  // variable is the most likely deployment mistake there is, and the
  // failure has to be the safe one: an unguarded door here would let
  // anyone on the internet drain the queue at will. 503 rather than 401,
  // because the fault is ours and the log should say so.
  if (!expected) {
    return NextResponse.json(
      { error: 'Drain is not configured (no CRON_SECRET).' },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!given || !secretMatches(given, expected)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  // `limit` is accepted so a person diagnosing a backlog can widen one
  // knock without a deploy. Clamped, because the cap exists to stay under
  // the Worker's subrequest ceiling and an unbounded value would defeat it.
  const requested = Number(request.nextUrl.searchParams.get('limit'));
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 100) : undefined;

  const summary = await drainOutbox(limit);

  // ⭐ The body is the point, not the status code. A scheduler's run log is
  // where somebody looks first when mail has gone quiet, and "claimed 4,
  // sent 4" answers the question there without opening the admin page. A
  // failure list is included for the same reason.
  //
  // ⚠ 200 even when sends failed. A failed send is a recorded outcome, not
  // a broken endpoint — the row carries its reason and its next attempt
  // time. Only a caller that could not be admitted gets a non-200, so the
  // scheduler's own red/green means "did the drain run", which is the
  // question a scheduler can actually answer.
  return NextResponse.json(summary, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
