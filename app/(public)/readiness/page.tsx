// mynclex/app/(public)/readiness/page.tsx
//
// Public readiness-pack landing at /readiness (readiness-packs.md §12 →
// Slice ①.3). Sells the ONE-SHOT verdict; /bank-access sells duration.
//
// EVERYTHING HERE IS A READ. An admin can create and retire readiness
// SKUs (Products & Pricing) and can edit each pack's question count and
// time limit — so this page encodes no count, no name and no number:
//   · N cards, ordered by sort_order, whatever N is (not "the 3 SKUs")
//   · no "Most popular" badge — there is no `featured` column to read
//   · "unlocks every pack" is DERIVED (credits >= publishedPackCount)
//   · the "Every pack: 100 questions · 3h 20m" line renders only when
//     the published packs actually agree, and vanishes when they don't
//   · zero active SKUs hides the pricing section, never an empty grid
// Pack specifics live in the "What's in a pack" block, not on the cards:
// a credit is spendable on ANY pack, so a card printing "100 questions"
// starts lying the moment one pack is set to 75.
//
// Each SKU card's "Get credits" links to the readiness checkout route
// (Slice ②b.1, /checkout/readiness) — the purchase mints credits (②a). The
// credits are held UNCLAIMED until the claim UI ships (②b.2); the checkout
// + result copy make no claiming promise yet.

import { createClient } from '@/lib/supabase/server';
import { ReadinessPlans, type ReadinessSku } from './readiness-plans';
import { SampleReport } from './sample-report';

export const dynamic = 'force-dynamic';

/** 12000 → "3h 20m" · 9000 → "2h 30m" · 2700 → "45m". */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

interface PackListing {
  pack_id:        string;
  title:          string;
  description:    string | null;
  n:              number | null;
  time_limit_sec: number | null;
}

const STEPS = [
  {
    n: '1',
    title: 'Buy your credits',
    body: 'One payment. Credits wait in your account until you choose to spend them.',
  },
  {
    n: '2',
    title: 'Pick your packs',
    body: 'Choose which published exams to sit — one per credit you hold.',
  },
  {
    n: '3',
    title: 'Sit it once, timed',
    body: 'Full length, on the real exam clock. The 21-day review window opens on activation.',
  },
  {
    n: '4',
    title: 'Keep the verdict',
    body: 'A permanent, measured score and breakdown. No retaking into a nicer number.',
  },
];

export default async function ReadinessLandingPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: packRows }] = await Promise.all([
    supabase
      .from('nclex_products')
      .select(
        'product_id, name, readiness_credits, price_minor_ghs, price_minor_usd, full_price_minor_ghs, full_price_minor_usd',
      )
      .eq('pack_type', 'READINESS')
      .eq('kind', 'PAID')
      .eq('status', 'ACTIVE')
      .order('sort_order', { ascending: true }),
    // Anon-readable since 20260726120000; the policy itself filters to
    // published + active, but we state the predicate anyway — the page's
    // correctness shouldn't depend on remembering what RLS does.
    supabase
      .from('nclex_readiness_packs')
      .select('pack_id, title, description, n, time_limit_sec')
      .eq('published', true)
      .eq('status', 'active')
      .order('pack_id', { ascending: true }),
  ]);

  const skus: ReadinessSku[] = (products ?? []).map((p) => ({
    productId:    p.product_id,
    name:         p.name,
    credits:      p.readiness_credits ?? 0,
    ghsMinor:     p.price_minor_ghs,
    usdMinor:     p.price_minor_usd,
    fullGhsMinor: p.full_price_minor_ghs,
    fullUsdMinor: p.full_price_minor_usd,
  }));

  const packs = (packRows ?? []) as PackListing[];
  const packCount = packs.length;

  // Uniform only when every pack states BOTH numbers and they all agree.
  // A null `n` is "unknown", never "the same as the others" — publishing
  // now blocks on it (composition.ts), but a pack published before that
  // rule existed must not be able to print "Every pack: null questions".
  const first = packs[0];
  const uniform =
    packCount > 0 &&
    packs.every(
      (p) =>
        p.n != null &&
        p.time_limit_sec != null &&
        p.n === first.n &&
        p.time_limit_sec === first.time_limit_sec,
    );
  const uniformLine = uniform
    ? `Every pack: ${first.n} questions · ${formatDuration(first.time_limit_sec!)}`
    : null;

  return (
    <main className="pub-content rdp-content">
      <section className="rdp-hero">
        <div className="rdp-eyebrow">Readiness Packs</div>
        <h1>One shot. A score you can trust.</h1>
        <p className="rdp-lede">
          Everything else in MyNclex is practice you can retake until the number flatters you.
          A readiness pack is a full-length, timed exam you sit <strong>exactly once</strong> —
          so what it tells you is a measured verdict on whether you&apos;re ready to book the
          NCLEX-RN, not a personal best.
        </p>
        <div className="rdp-hero-meta">
          <span className="rdp-meta-item">
            <ShieldIcon />
            Timed like the real thing
          </span>
          <span className="rdp-meta-item">
            <CheckBoxIcon />
            No retakes — the score stands
          </span>
        </div>
      </section>

      {skus.length > 0 && (
        <ReadinessPlans skus={skus} packCount={packCount} uniformLine={uniformLine} />
      )}

      <section className="rdp-section">
        <div className="rdp-eyebrow">What&apos;s in a pack</div>
        <h2>The exams your credits unlock</h2>
        <p className="rdp-section-lede">
          A credit is spendable on any published pack — you pick which after purchase. Each
          pack is its own curated exam.
        </p>

        {packCount > 0 ? (
          <div className="rdp-pack-list">
            {packs.map((p) => (
              <div key={p.pack_id} className="rdp-pack-row">
                <div className="rdp-pack-id">
                  <div className="rdp-pack-title">{p.title}</div>
                  <div className="rdp-pack-desc">
                    {p.description ?? 'Curated full-length readiness exam.'}
                  </div>
                </div>
                <div className="rdp-pack-stats">
                  <div className="rdp-stat">
                    <div className="rdp-stat-val">{p.n ?? '—'}</div>
                    <div className="rdp-stat-key">questions</div>
                  </div>
                  <div className="rdp-stat">
                    <div className="rdp-stat-val">
                      {p.time_limit_sec != null ? formatDuration(p.time_limit_sec) : '—'}
                    </div>
                    <div className="rdp-stat-key">time limit</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rdp-prelaunch">
            <SparkIcon />
            <div>
              <div className="rdp-prelaunch-title">The first packs are being curated</div>
              <p>
                We&apos;re finalising the exams now. When they go live you&apos;ll choose which
                packs to sit — one per credit you hold.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rdp-section">
        <div className="rdp-eyebrow">How it works</div>
        <h2>Buy once, sit once, keep the verdict</h2>
        <div className="rdp-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="rdp-step">
              <div className="rdp-step-head">
                <span className="rdp-step-n">{s.n}</span>
                <span className="rdp-step-rule" />
              </div>
              <div className="rdp-step-title">{s.title}</div>
              <div className="rdp-step-body">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      <SampleReport />

      <section className="rdp-crosssell">
        <GiftIcon />
        <div className="rdp-crosssell-copy">
          <strong>Longer bank passes include readiness credits at no extra cost.</strong>
        </div>
        <a className="rdp-crosssell-btn" href="/bank-access">
          See bank access →
        </a>
      </section>
    </main>
  );
}

/* ── inline icons (no runtime dep; stroke inherits currentColor) ─────── */

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckBoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="rdp-prelaunch-icon" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 2v4" /><path d="M12 18v4" />
      <path d="m4.9 4.9 2.9 2.9" /><path d="m16.2 16.2 2.9 2.9" />
      <path d="M2 12h4" /><path d="M18 12h4" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg className="rdp-crosssell-icon" width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
