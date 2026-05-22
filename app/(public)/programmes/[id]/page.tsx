// mynclex/app/(public)/programmes/[id]/page.tsx
//
// Read-only public programme detail. Server component — reads the
// programme from the public view by id (404 if not publicly visible),
// plus its published units (syllabus) and open cohorts. No enrolment
// path yet: the Enrol CTA is disabled "coming soon" until on-platform
// checkout lands (Slice 5). The tutor "About" section waits on the
// JSONB tutor-profile slice.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getPublicProgramme,
  getPublicUnits,
  getPublicCohorts,
  getBankOptinDiscountPct,
} from '@/lib/discovery/queries';
import { getPublicPaymentPlans } from '@/lib/strategies/public-queries';
import { formatMoney, systemLabel } from '@/lib/strategies/format';
import {
  accessWindowLabel,
  cohortStatus,
  formatCohortDateLong,
  initials,
  lengthLabel,
  priceParts,
  tutorAttribution,
  yearsTutoringLabel,
} from '@/lib/discovery/format';
import { WaitlistCta } from './waitlist-cta';

export const dynamic = 'force-dynamic';

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const programme = await getPublicProgramme(id);
  if (!programme) notFound();

  const [units, cohorts, plans, bankDiscountPct] = await Promise.all([
    getPublicUnits(id),
    getPublicCohorts(id),
    getPublicPaymentPlans(id),
    getBankOptinDiscountPct(),
  ]);

  const selfPaced = programme.delivery_mode === 'SELF_PACED';
  const isOnPlatform = programme.payment_collection_mode === 'ON_PLATFORM';
  const unitNoun = programme.unit_label === 'WEEK' ? 'Week' : 'Module';
  const { ccy, amount } = priceParts(
    programme.price_currency,
    programme.price_minor
  );
  const showPrice = programme.show_price_publicly;
  const ctaLabel = selfPaced ? 'Start now' : 'Enrol';

  // Sub-line under the headline price. Off-platform programmes don't take
  // online payment; on-platform ones note whether plans are available.
  const priceSubLabel = !isOnPlatform
    ? 'Collected directly by the tutor'
    : plans.length >= 2
      ? 'Pay in full, or choose a plan at checkout'
      : 'Upfront — one payment';

  // Waitlist-joinable cohorts: tutor-led only, and (matching the
  // nclex_join_waitlist gate) upcoming OR late-join-allowed. getPublicCohorts
  // already dropped ended/cancelled ones.
  const todayStr = new Date().toISOString().slice(0, 10);
  const waitlistCohorts = selfPaced
    ? []
    : cohorts
        .filter((c) => c.start_date >= todayStr || c.allow_late_join)
        .map((c) => ({
          id: c.cohort_id,
          label: c.name
            ? `${c.name} · starts ${formatCohortDateLong(c.start_date)}`
            : `Starts ${formatCohortDateLong(c.start_date)}`,
        }));

  // On-platform checkout (slice 5.4a). The Enrol button goes live when the
  // programme takes online payment with a public price and there's something
  // to enrol into (self-paced always; tutor-led needs a joinable cohort).
  // Otherwise the button stays the "coming soon" placeholder and the
  // off-platform waitlist shows instead.
  const canEnrol =
    programme.payment_collection_mode === 'ON_PLATFORM' &&
    showPrice &&
    programme.price_minor > 0 &&
    (selfPaced || waitlistCohorts.length > 0);

  // Short note under the Enrol button: the soonest joinable cohort for
  // tutor-led (no seat counts — the public view omits them by design).
  const nextJoinable = selfPaced
    ? null
    : cohorts.find((c) => c.start_date >= todayStr || c.allow_late_join) ?? null;
  const nextCohortNote = nextJoinable
    ? nextJoinable.name ?? `Starts ${formatCohortDateLong(nextJoinable.start_date)}`
    : 'Next cohort';

  // Tutor public profile (slice 3.5). Attribution = the "show person +
  // business together" rule; the rest feeds the header sub-line and the
  // About sections.
  const prof = programme.tutor_profile;
  const attr = tutorAttribution(
    prof,
    programme.tutor_name,
    programme.tutor_avatar_url
  );
  const yrs = yearsTutoringLabel(prof?.years_experience);
  const headerSub = [prof?.headline, yrs].filter(Boolean).join(' · ');
  const personFirst = (programme.tutor_name ?? '').trim().split(/\s+/)[0] || 'the tutor';

  return (
    <main className="pub-content">
      <Link className="det-back" href="/programmes">
        ← Back to programmes
      </Link>

      <div className="det-shell">
        <article>
          <header className="det-header">
            <div className="tutor-row">
              <div className="avatar">
                {attr.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attr.imageUrl} alt="" />
                ) : (
                  initials(attr.initialsSeed)
                )}
              </div>
              <div className="who">
                <div className="nm">
                  {attr.primaryName}
                  {attr.secondaryName && (
                    <span className="with"> · with {attr.secondaryName}</span>
                  )}
                </div>
                {headerSub && <div className="sub">{headerSub}</div>}
              </div>
              <span className={`delivery-tag${selfPaced ? ' self-paced' : ''}`}>
                {selfPaced ? 'SELF-PACED' : 'TUTOR-LED'}
              </span>
            </div>

            <h1>{programme.title}</h1>
            {programme.tagline && (
              <p className="tagline">{programme.tagline}</p>
            )}

            <div className="det-meta">
              <div className="cell">
                <div className="k">Length</div>
                <div className="v">
                  {lengthLabel(programme.length_units, programme.unit_label)}
                </div>
              </div>
              <div className="cell">
                <div className="k">Format</div>
                <div className="v">
                  {selfPaced ? 'Self-paced' : 'Tutor-led'}
                </div>
              </div>
              <div className="cell">
                <div className="k">Access window</div>
                <div className="v">
                  {accessWindowLabel(programme.access_window_days)}
                </div>
              </div>
              <div className="cell">
                <div className="k">Collection</div>
                <div className="v">
                  {programme.payment_collection_mode === 'ON_PLATFORM'
                    ? 'On-platform'
                    : 'Off-platform'}
                </div>
              </div>
            </div>
          </header>

          {programme.description && (
            <section className="det-section">
              <h2>About this programme</h2>
              <p>{programme.description}</p>
            </section>
          )}

          {units.length > 0 && (
            <section className="det-section">
              <h2>{selfPaced ? 'Modules' : 'Syllabus'}</h2>
              <div className="syllabus">
                {units.map((u) => (
                  <div className="wk" key={u.unit_index}>
                    <div className="num">
                      {unitNoun} {String(u.unit_index).padStart(2, '0')}
                    </div>
                    <div className="ttl">
                      {u.title ?? `${unitNoun} ${u.unit_index}`}
                    </div>
                    {u.description && <div className="sub">{u.description}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!selfPaced && cohorts.length > 0 && (
            <section className="det-section">
              <h2>Available cohorts</h2>
              <div className="cohort-list">
                {cohorts.map((c) => {
                  const status = cohortStatus(c);
                  return (
                    <div className="cohort-row" key={c.cohort_id}>
                      <div>
                        <div className="nm">
                          {c.name ?? 'Cohort'}
                        </div>
                        <div className="dates">
                          {formatCohortDateLong(c.start_date)} —{' '}
                          {formatCohortDateLong(c.end_date)}
                        </div>
                      </div>
                      <div className="pill-host">
                        <span className={`tag-soft ${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(prof?.bio || prof?.speciality || yrs) && (
            <section className="det-section">
              <h2>About {personFirst}</h2>
              {(prof?.speciality || yrs) && (
                <p className="det-tutor-meta">
                  {[prof?.speciality, yrs].filter(Boolean).join(' · ')}
                </p>
              )}
              {prof?.bio && <p>{prof.bio}</p>}
            </section>
          )}

          {attr.isBusiness && prof?.business_bio && (
            <section className="det-section">
              <h2>About {prof.business_name}</h2>
              <p>{prof.business_bio}</p>
            </section>
          )}
        </article>

        <aside className="det-aside">
          <div className="det-rail">
            {showPrice ? (
              <>
                <div className="price">
                  {ccy && <span className="ccy">{ccy}</span>}
                  {amount}
                </div>
                <div className="price-sub">{priceSubLabel}</div>
              </>
            ) : (
              <div className="price price-contact">Contact for price</div>
            )}

            <div className="det-cta">
              {canEnrol ? (
                <Link className="pub-btn-primary" href={`/checkout/programme/${id}`}>
                  {selfPaced ? 'Start now →' : 'Enrol in next cohort →'}
                </Link>
              ) : (
                <button type="button" className="pub-btn-primary" disabled>
                  {ctaLabel}
                </button>
              )}
              {canEnrol ? (
                <p className="det-cta-note">
                  {selfPaced ? 'No cohort wait · instant access' : nextCohortNote}
                </p>
              ) : !isOnPlatform ? (
                <p className="det-cta-note">
                  This tutor collects payment directly — reach out to them to
                  enrol.
                </p>
              ) : (
                <p className="det-cta-note">
                  Enrolment isn&apos;t open right now — check back soon.
                </p>
              )}
            </div>

            {/* Bank opt-in hint — only meaningful for on-platform checkout (5.4b),
                and only when a discount is actually configured. The percent is
                read from nclex_config so it tracks the live setting. */}
            {isOnPlatform && bankDiscountPct > 0 && (
              <div className="bank-hint">
                <strong>Optional add-on</strong>
                Add NCLEX Bank Access at checkout — {bankDiscountPct}% off the standalone
                price, stacking on any access you already have.
              </div>
            )}

            {/* Payment options — the programme's real active plans (Slice 7c).
                On-platform only; off-platform has no online checkout. */}
            {isOnPlatform && showPrice && plans.length > 0 && (
              <div className="what-includes">
                <h4>Payment options</h4>
                <ul>
                  {plans.map((p) => {
                    const title = (p.label ?? '').trim() || systemLabel(p.kind);
                    const isUpfront = p.kind === 'UPFRONT_FULL';
                    return (
                      <li key={p.strategy_id}>
                        {title} ·{' '}
                        {formatMoney(programme.price_currency, p.initial_price_minor)}
                        {isUpfront ? '' : ' now'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {waitlistCohorts.length > 0 && (
            <WaitlistCta cohorts={waitlistCohorts} tutorName={personFirst} />
          )}
        </aside>
      </div>
    </main>
  );
}
