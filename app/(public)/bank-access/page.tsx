// mynclex/app/(public)/bank-access/page.tsx
//
// Public standalone bank landing at /bank-access (Slice 5.5). What the
// QAcademy NCLEX-RN bank is + the 5 duration tiers in a GHS/USD toggle,
// flowing into /checkout/bank. Tier prices/credits come from the real
// nclex_products catalogue (single source).

import { createClient } from '@/lib/supabase/server';
import { BankPlans, type BankPlan } from './bank-plans';

export const dynamic = 'force-dynamic';

export default async function BankLandingPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('nclex_products')
    .select('product_id, name, duration_days, bundled_readiness_credits, price_minor_ghs, price_minor_usd')
    .eq('pack_type', 'BANK_DURATION')
    .eq('kind', 'PAID')
    .eq('status', 'ACTIVE')
    .order('sort_order', { ascending: true });

  const plans: BankPlan[] = (products ?? []).map((p) => ({
    productId: p.product_id,
    days: p.duration_days ?? 0,
    readinessCredits: p.bundled_readiness_credits ?? 0,
    ghsMinor: p.price_minor_ghs,
    usdMinor: p.price_minor_usd,
  }));

  return (
    <main className="pub-content bank-content">
      <section className="bank-hero">
        <div className="bank-eyebrow">QACADEMY · NCLEX-RN QUESTION BANK</div>
        <h1>Practice the NCLEX-RN, the way the exam actually asks.</h1>
        <p className="bank-lede">
          A self-study question bank built for the Next-Generation NCLEX — every item type,
          a worked rationale on every question, and history that shows you exactly where to
          focus next. Buy a duration that fits your timeline.
        </p>
        <div className="bank-hero-meta">
          <span>✓ All NGN item types</span>
          <span>✓ Rationale on every question</span>
          <span>✓ Practice &amp; exam modes</span>
          <span>✓ 7-day free trial</span>
        </div>
      </section>

      <BankPlans plans={plans} />

      <section className="bank-includes">
        <h2>What you get</h2>
        <div className="bank-feature-grid">
          <div className="bank-feature">
            <h4>Every NGN item type</h4>
            <p>MCQ, SATA, matrix, cloze, drag-and-drop, bow-tie, highlight, ordering — the full
              Next-Gen format set, plus case studies and trend questions.</p>
          </div>
          <div className="bank-feature">
            <h4>Learn from every answer</h4>
            <p>A clear rationale on each question — why the right answer is right and the others
              aren&apos;t — so practice actually teaches.</p>
          </div>
          <div className="bank-feature">
            <h4>Practice or exam mode</h4>
            <p>Study with instant feedback, or sit timed exam-style sets that mirror real
              test pressure.</p>
          </div>
          <div className="bank-feature">
            <h4>Know your weak spots</h4>
            <p>Every attempt is saved. Filter to the questions you got wrong and drill them
              until they stick.</p>
          </div>
          <div className="bank-feature">
            <h4>Build your own sets</h4>
            <p>Pick the topics, client-needs categories, difficulty and length — the builder
              assembles a session to match.</p>
          </div>
          <div className="bank-feature">
            <h4>Adaptive CAT mode</h4>
            <p><span className="bank-soon">Coming soon</span> — a computer-adaptive practice mode
              that tunes to your level, just like the real exam.</p>
          </div>
        </div>
      </section>

      <p className="bank-trust">
        Secured by Paystack · pay by card or mobile money · GHS &amp; international cards accepted.
      </p>
    </main>
  );
}
