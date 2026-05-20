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
} from '@/lib/discovery/queries';
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

export const dynamic = 'force-dynamic';

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const programme = await getPublicProgramme(id);
  if (!programme) notFound();

  const [units, cohorts] = await Promise.all([
    getPublicUnits(id),
    getPublicCohorts(id),
  ]);

  const selfPaced = programme.delivery_mode === 'SELF_PACED';
  const unitNoun = programme.unit_label === 'WEEK' ? 'Week' : 'Module';
  const { ccy, amount } = priceParts(
    programme.price_currency,
    programme.price_minor
  );
  const showPrice = programme.show_price_publicly;
  const ctaLabel = selfPaced ? 'Start now' : 'Enrol';

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

        <aside className="det-rail">
          {showPrice ? (
            <div className="price">
              {ccy && <span className="ccy">{ccy}</span>}
              {amount}
            </div>
          ) : (
            <div className="price price-contact">Contact for price</div>
          )}

          <div className="det-cta">
            <button type="button" className="pub-btn-primary" disabled>
              {ctaLabel}
            </button>
            <p className="det-cta-note">
              Online enrolment is coming soon. For now, contact the tutor to
              join.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
