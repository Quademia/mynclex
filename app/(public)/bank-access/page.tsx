// mynclex/app/(public)/bank-access/page.tsx
//
// Public standalone bank landing at /bank-access — the "cinematic"
// redesign (CD "Bank Public Page Cinematic", concept-not-source). A light
// technical grid-paper aesthetic (Inter + IBM Plex Mono via --font-mono).
//
// THE PURCHASING SURFACE IS UNCHANGED: tier prices/credits still come from
// the real nclex_products catalogue (single source), the GHS/USD toggle is
// still SEEDED from the visitor's geo currency, and cards still flow into
// /checkout/bank. The one new marketing piece is the interactive Builder
// demo (builder-demo.tsx) — a SAMPLE of the real builder, no data, no
// checkout effect.
//
// Deliberate deviation from the prototype: the hero stats avoid an
// unverifiable "2,000+ questions" figure (the published count varies by
// environment) in favour of evergreen truths — same data-honesty discipline
// as the /readiness redesign.

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { defaultCurrencyForCountry } from '@/lib/products/money';
import { BankPlans, type BankPlan } from './bank-plans';
import { BuilderDemo } from './builder-demo';
import { ScrollReveal } from './scroll-reveal';

export const dynamic = 'force-dynamic';

// Hero backdrop photo (Cloudinary). Sits muted behind the floating
// question-card collage — warmth without displacing the product cards.
const HERO_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1784117174/nurse_holding_books_myegne.jpg';

const HERO_META = ['All NGN item types', 'Rationale on every question', 'Practice & exam modes', '7-day free trial'];

const FEATURES = [
  { n: '01', title: 'Every NGN item type', body: 'MCQ, SATA, matrix, cloze, drag-and-drop, bow-tie, highlight, ordering — the full Next-Gen format set, plus case studies and trend questions.', soon: false },
  { n: '02', title: 'Learn from every answer', body: "A clear rationale on each question — why the right answer is right and the others aren't — so practice actually teaches.", soon: false },
  { n: '03', title: 'Practice or exam mode', body: 'Study with instant feedback, or sit timed exam-style sets that mirror real test pressure.', soon: false },
  { n: '04', title: 'Know your weak spots', body: 'Every attempt is saved. Filter to the questions you got wrong and drill them until they stick.', soon: false },
  { n: '05', title: 'Build your own sets', body: 'Pick the topics, client-needs categories, difficulty and length — the builder assembles a session to match.', soon: false },
  { n: '06', title: 'Adaptive CAT mode', body: 'A computer-adaptive practice mode that tunes to your level, just like the real exam.', soon: false },
];

export default async function BankLandingPage() {
  const supabase = await createClient();

  // Pre-select the currency from the visitor's country (Cloudflare's
  // CF-IPCountry). Absent off-edge (localhost) → GHS fallback. Toggle wins.
  const initialCurrency = defaultCurrencyForCountry((await headers()).get('cf-ipcountry'));

  const { data: products } = await supabase
    .from('nclex_products')
    .select('product_id, name, duration_days, readiness_credits, cat_allowance, price_minor_ghs, price_minor_usd')
    .eq('pack_type', 'BANK_DURATION')
    .eq('kind', 'PAID')
    .eq('status', 'ACTIVE')
    .order('sort_order', { ascending: true });

  const plans: BankPlan[] = (products ?? []).map((p) => ({
    productId: p.product_id,
    days: p.duration_days ?? 0,
    readinessCredits: p.readiness_credits ?? 0,
    catAllowance: p.cat_allowance,
    ghsMinor: p.price_minor_ghs,
    usdMinor: p.price_minor_usd,
  }));

  // Evergreen, verifiable stats — no invented question count (see header).
  const stats: { v: string; k: string }[] = [
    { v: '11', k: 'NGN item types' },
    { v: '100%', k: 'of questions carry a worked rationale' },
  ];
  if (plans.length > 0) stats.push({ v: String(plans.length), k: `durations — ${plans[0].days} to ${plans[plans.length - 1].days} days` });
  stats.push({ v: '7 days', k: 'free trial — no card needed' });

  return (
    <main className="bkc">
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="bkc-hero">
        <div className="bkc-hero-photo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_PHOTO} alt="" />
        </div>
        <div className="bkc-hero-grid" />
        <span className="bkc-hero-glow" />
        <div className="bkc-hero-inner">
          <div className="bkc-hero-copy">
            <div className="bkc-eyebrow">QAcademy · NCLEX-RN question bank</div>
            <h1>Practice the NCLEX-RN, the way the exam <span className="bkc-accent">actually asks.</span></h1>
            <p className="bkc-lede">
              A self-study question bank built for the Next-Generation NCLEX — every item type, a worked
              rationale on every question, and history that shows you exactly where to focus next. Buy a
              duration that fits your timeline.
            </p>
            <div className="bkc-hero-ctas">
              <a className="bkc-btn bkc-btn-primary" href="#plans">See plans →</a>
              <a className="bkc-btn bkc-btn-ghost" href="#builder">Try the builder</a>
            </div>
            <div className="bkc-hero-meta">
              {HERO_META.map((m) => (
                <span key={m}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* floating question-card collage */}
          <div className="bkc-collage" aria-hidden="true">
            <div className="bkc-cq">
              <div className="bkc-cq-tags">
                <span className="bkc-cq-tag">SATA</span>
                <span className="bkc-cq-tag teal">PHARM THERAPIES</span>
              </div>
              <div className="bkc-cq-stem">Which findings require <strong>immediate follow-up</strong> for a client on a continuous heparin infusion?</div>
              <div className="bkc-cq-opts">
                <span className="bkc-cq-opt on"><strong>A</strong> Blood noted in the urine</span>
                <span className="bkc-cq-opt on"><strong>B</strong> aPTT of 110 seconds</span>
                <span className="bkc-cq-opt off"><strong>C</strong> Heart rate 78/min</span>
              </div>
              <div className="bkc-cq-rat"><strong>Rationale</strong> · Hematuria and an aPTT above the therapeutic range signal over-anticoagulation…</div>
            </div>
            <div className="bkc-chip-card a">
              <div className="bkc-chip-k">ITEM TYPES</div>
              <div className="bkc-chip-v">All 11 NGN formats</div>
            </div>
            <div className="bkc-chip-card b">
              <div className="bkc-chip-k">YOUR HISTORY</div>
              <div className="bkc-chip-v">Drill what you got wrong</div>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="bkc-stats-band">
          <div className="bkc-stats">
            {stats.map((t) => (
              <div key={t.k} className="bkc-stat">
                <div className="v">{t.v}</div>
                <div className="k">{t.k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PLANS (real purchasing surface) ═══ */}
      <BankPlans plans={plans} initialCurrency={initialCurrency} />

      {/* ═══ BUILDER DEMO (interactive sample) ═══ */}
      <BuilderDemo />

      {/* ═══ WHAT YOU GET ═══ */}
      <section className="bkc-get bkc-reveal">
        <div className="bkc-get-head">
          <div className="bkc-eyebrow">What you get</div>
          <h2>Practice that actually <span className="bkc-accent">teaches</span></h2>
        </div>
        <div className="bkc-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.n} className="bkc-feature">
              <div className="bkc-feature-head">
                <span className="bkc-feature-n">{f.n}</span>
                <span className="bkc-feature-rule" />
                {f.soon && <span className="bkc-soon">Coming soon</span>}
              </div>
              <div className="bkc-feature-title">{f.title}</div>
              <div className="bkc-feature-body">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="bkc-cta-sec bkc-reveal">
        <div className="bkc-cta">
          <div className="bkc-cta-grid" />
          <div className="bkc-cta-copy">
            <h2>Start practising <span className="bkc-accent">today.</span></h2>
            <p>Seven days free, no card needed. Then pick a duration — and if you buy more later, it stacks on what&apos;s left.</p>
            <div className="bkc-cta-ctas">
              <a className="bkc-btn bkc-btn-primary bkc-cta-primary" href="#plans">Start free trial</a>
              <a className="bkc-btn bkc-btn-ghost" href="#plans">See plans</a>
            </div>
          </div>
          <div className="bkc-cta-fig">
            <div className="v">7 days</div>
            <div className="k">free · no card needed</div>
          </div>
        </div>
        <p className="bkc-trust">Secured by Paystack · pay by card or mobile money · GHS &amp; international cards accepted.</p>
      </section>
    </main>
  );
}
