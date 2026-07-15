// mynclex/app/(public)/readiness/page.tsx
//
// Public readiness-pack landing at /readiness — the "cinematic" redesign
// (CD V3). Sells the ONE-SHOT verdict; /bank-access sells duration.
//
// EVERYTHING THAT MATTERS IS STILL A READ, and the purchasing surface is
// UNCHANGED — same catalogue + published-pack queries, same derived
// unlock/uniform logic, same /checkout/readiness link (see readiness-plans).
// An admin can create/retire SKUs and edit each pack's n/time, so the page
// encodes no count, name or number: SKU cards + the pack list + the hero
// stats strip are all derived, honest at zero published packs.
//
// The cinematic additions — the hero collage, the four report feature
// demos, and the in-exam runner demo — are SAMPLE illustrations with no
// data and no effect on checkout (report-showcase.tsx / runner-demo.tsx).

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { defaultCurrencyForCountry } from '@/lib/products/money';
import { ReadinessPlans, type ReadinessSku } from './readiness-plans';
import { HeroCollage } from './hero-collage';
import { ReportShowcase } from './report-showcase';
import { RunnerDemo } from './runner-demo';
import { ScrollReveal } from './scroll-reveal';

export const dynamic = 'force-dynamic';

// Marketing photos (hosted on Cloudinary). Empty string → gradient fallback.
const BAND_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1783980651/iDRaz_eewajr.jpg'; // wide landscape: "Sat under real exam conditions"
const CTA_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1783980787/LKTR5_p8rczm.jpg'; //  portrait / square: graduating nurse

/** 12000 → "3h 20m". Local (not exported) — a page.tsx may export only the
 *  default + route config or the prod build type-check fails. */
function formatDuration(seconds: number): string {
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
  { n: '1', title: 'Buy your credits', body: 'One payment. Credits wait in your account until you choose to spend them.' },
  { n: '2', title: 'Pick your packs', body: 'Choose which published exams to sit — one per credit you hold.' },
  { n: '3', title: 'Sit it once, timed', body: 'Full length, on the real exam clock. The 21-day review window opens on activation.' },
  { n: '4', title: 'Keep the verdict', body: 'A permanent, measured score and breakdown. No retaking into a nicer number.' },
];

export default async function ReadinessLandingPage() {
  const supabase = await createClient();

  // Pre-select the currency from the visitor's country (Cloudflare's
  // CF-IPCountry). Absent off-edge (localhost) → GHS fallback. Toggle wins.
  const initialCurrency = defaultCurrencyForCountry((await headers()).get('cf-ipcountry'));

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
  const first = packs[0];
  const uniform =
    packCount > 0 &&
    packs.every(
      (p) => p.n != null && p.time_limit_sec != null && p.n === first.n && p.time_limit_sec === first.time_limit_sec,
    );
  const uniformLine = uniform
    ? `Every pack: ${first.n} questions · ${formatDuration(first.time_limit_sec!)}`
    : null;

  // Hero stats — honest constants + derived-from-live-data. Never prints a
  // count we can't stand behind (0 published packs → the pack/question
  // stats simply don't appear).
  const stats: { v: string; k: string }[] = [{ v: 'One shot', k: 'per pack · no retakes' }];
  if (packCount > 0) stats.push({ v: String(packCount), k: packCount === 1 ? 'curated pack' : 'curated packs' });
  if (uniform) {
    stats.push({ v: String(first.n), k: 'questions per pack' });
    stats.push({ v: formatDuration(first.time_limit_sec!), k: 'on the real exam clock' });
  }
  stats.push({ v: '21 days', k: 'to review every rationale' });

  return (
    <main className="rpc">
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="rpc-hero">
        <span className="rpc-glow a" />
        <span className="rpc-glow b" />
        <div className="rpc-inner rpc-hero-inner">
          <div className="rpc-hero-copy">
            <div className="rpc-eyebrow on-dark">Readiness Packs</div>
            <h1>
              One shot.<br />A score you can<br /><span className="rpc-serif">actually trust.</span>
            </h1>
            <p className="rpc-hero-lede">
              Practice tests flatter you — you retake them until the number looks good. A readiness
              pack is a full-length, timed NCLEX-RN exam you sit <strong>exactly once</strong>. What
              comes back is a measured verdict on whether you&apos;re ready to book the real thing.
            </p>
            <div className="rpc-hero-ctas">
              <a className="rpc-btn rpc-btn-primary" href="#plans">Get your credits →</a>
              <a className="rpc-btn rpc-btn-ghost" href="#report">See the report</a>
            </div>
            <div className="rpc-hero-meta">
              <span><ShieldIcon /> Timed like the real thing</span>
              <span><CheckBoxIcon /> No retakes — the score stands</span>
            </div>
          </div>

          {/* floating SAMPLE report collage — cycles through the bands */}
          <HeroCollage />
        </div>

        <div className="rpc-stats-band">
          <div className="rpc-inner rpc-stats">
            {stats.map((t) => (
              <div key={t.k} className="rpc-stat">
                <div className="v">{t.v}</div>
                <div className="k">{t.k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ REPORT FEATURE DEMOS (sample) ═══ */}
      <div id="report">
        <ReportShowcase />
      </div>

      {/* ═══ PHOTO BAND ═══ */}
      <section className="rpc-photo-sec">
        <div className="rpc-inner rpc-reveal">
          <div className="rpc-photo">
            {BAND_PHOTO ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={BAND_PHOTO} alt="A nurse sitting the readiness exam" />
            ) : (
              <div className="rpc-photo-fallback" />
            )}
            <div className="rpc-photo-overlay">
              <div className="box">
                <div className="rpc-eyebrow on-dark">The sitting</div>
                <h3>Sat under <span className="rpc-serif">real</span> exam conditions</h3>
                <p>
                  100 questions on a 3h 20m clock, the full NGN item mix, no pausing and no second
                  sitting. That&apos;s why the number means something.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ IN-EXAM RUNNER DEMO (sample) ═══ */}
      <RunnerDemo />

      {/* ═══ PRICING (real) ═══ */}
      <section id="plans" className="rpc-pricing-sec">
        <div className="rpc-inner">
          {skus.length > 0 ? (
            <ReadinessPlans skus={skus} packCount={packCount} uniformLine={uniformLine} initialCurrency={initialCurrency} />
          ) : (
            <div className="rpc-pricing-head rpc-reveal">
              <div>
                <div className="rpc-eyebrow">Pricing</div>
                <h2>Credits are on their <span className="rpc-serif">way.</span></h2>
                <p className="rpc-uniform">Readiness credits go on sale shortly — check back soon.</p>
              </div>
            </div>
          )}

          {/* pack list — real published packs */}
          <div className="rpc-packs rpc-reveal">
            <h3>The exams your credits unlock</h3>
            {packCount > 0 ? (
              <div className="rpc-pack-list">
                {packs.map((p) => (
                  <div key={p.pack_id} className="rpc-pack-row">
                    <div className="rpc-pack-main">
                      <div className="rpc-pack-title">{p.title}</div>
                      <div className="rpc-pack-desc">{p.description ?? 'Curated full-length readiness exam.'}</div>
                    </div>
                    <div className="rpc-pack-stats">
                      <div className="rpc-pack-stat">
                        <div className="v">{p.n ?? '—'}</div>
                        <div className="k">questions</div>
                      </div>
                      <div className="rpc-pack-stat">
                        <div className="v">{p.time_limit_sec != null ? formatDuration(p.time_limit_sec) : '—'}</div>
                        <div className="k">time limit</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rpc-prelaunch">
                <SparkIcon />
                <div>
                  <div className="t">The first packs are being curated</div>
                  <p>
                    We&apos;re finalising the exams now. When they go live you&apos;ll choose which
                    packs to sit — one per credit you hold.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* how it works */}
          <div className="rpc-how rpc-reveal">
            <h3>Buy once, sit once, keep the verdict</h3>
            <div className="rpc-steps">
              {STEPS.map((s) => (
                <div key={s.n} className="rpc-step">
                  <span className="rpc-step-n">{s.n}</span>
                  <div className="rpc-step-title">{s.title}</div>
                  <div className="rpc-step-body">{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="rpc-cta-sec">
        <span className="rpc-cta-glow" />
        <div className="rpc-inner rpc-cta-inner rpc-reveal">
          <div className="rpc-cta-copy">
            <h2>Ready to find out<br />if you&apos;re <span className="rpc-serif">ready?</span></h2>
            <p>
              One payment, one sitting per pack, one number you can plan around. Your score, band and
              full breakdown stay in your history forever.
            </p>
            <div className="rpc-cta-row">
              <a className="rpc-btn rpc-btn-primary" href="#plans">Get your credits →</a>
              <span className="note">Longer bank passes include credits at no extra cost.</span>
            </div>
          </div>
          <div className="rpc-cta-photo">
            <div className="rpc-cta-circle">
              {CTA_PHOTO ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={CTA_PHOTO} alt="A nurse celebrating success" />
              ) : (
                <div className="rpc-photo-fallback" />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ── inline icons ─────────────────────────────────────────────── */

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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v4" /><path d="M12 18v4" />
      <path d="m4.9 4.9 2.9 2.9" /><path d="m16.2 16.2 2.9 2.9" />
      <path d="M2 12h4" /><path d="M18 12h4" />
    </svg>
  );
}
