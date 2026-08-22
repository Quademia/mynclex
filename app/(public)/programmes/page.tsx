// mynclex/app/(public)/programmes/page.tsx
//
// Public programmes discovery at /programmes — the "cinematic" redesign
// (CD "Programmes Public Page Cinematic", concept-not-source). Warm
// editorial aesthetic (Inter + Newsreader serif via --font-serif).
//
// THE LIST IS THE REAL SURFACE: cards still come from the real
// getDiscoveryProgrammes() read via the public view, with every real card
// state preserved (attribution, delivery mode, "from"/hidden price,
// cohort when-labels) — only the skin changed (programmes-list.tsx).
//
// The hero uses a VISIBLE photo in place of the prototype's floating
// programme-card (Sam, 2026-07-15): the real cards are in the list right
// below, so the hero can be purely human. The interactive "Inside a
// programme" demo (inside-demo.tsx) is a SAMPLE of the student view.
//
// Photos: the hero photo is wired; the how-it-works portrait, photo band,
// and CTA photo are placeholders (gradient fallback) until Sam supplies
// them — set the consts below when the Cloudinary links land.

import { getDiscoveryProgrammes } from '@/lib/discovery/queries';
import { tutorAttribution } from '@/lib/discovery/format';
import { ProgrammesList } from './programmes-list';
import { InsideDemo } from './inside-demo';
import { ScrollReveal } from './scroll-reveal';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Programmes — MyNclex',
  description: 'Vetted tutored NCLEX-RN prep programmes — tutor-led cohorts and self-paced courses.',
};

// Marketing photos (Cloudinary). Empty string → gradient fallback.
const HERO_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1784117174/tutor_having_online_lessons_gnrfbc.jpg';
const HOW_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1784121789/Gemini_Generated_Image_r86sgor86sgor86s_wcwxyt.png'; // portrait — tutor with a student
const BAND_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1784117175/nclex_journey_multi_scene_jcrngt.jpg';             // wide — tutor teaching a live class
const CTA_PHOTO = 'https://res.cloudinary.com/dbyufeays/image/upload/v1784121581/Gemini_Generated_Image_ybwvz8ybwvz8ybwv_zliiyh.png'; // aspirational — bleeds into the CTA background

const STEPS = [
  { n: '1', title: 'Browse open programmes', body: 'Every published programme from every vetted tutor — filter by format, compare prices and cohort dates.' },
  { n: '2', title: 'Pick your path in', body: 'Enrol straight into a cohort, join a waitlist, or message the tutor — every programme has a way in.' },
  { n: '3', title: 'Pay your way', body: 'Pay in full, or choose an installment plan at checkout where the tutor offers one.' },
  { n: '4', title: 'Learn on the platform', body: 'Curriculum, notes, quizzes and practice all live in one place — with your progress tracked throughout.' },
];

export default async function ProgrammesPage() {
  const programmes = await getDiscoveryProgrammes();

  const tutorLed = programmes.filter((p) => p.delivery_mode === 'TUTOR_LED').length;
  const selfPaced = programmes.filter((p) => p.delivery_mode === 'SELF_PACED').length;
  // Distinct tutors/academies, derived from the real attribution rule.
  const tutorCount = new Set(
    programmes.map((p) => tutorAttribution(p.tutor_profile, p.tutor_name, p.tutor_avatar_url).primaryName),
  ).size;

  // Derived, honest stats — nothing invented (mirrors the /bank + /readiness discipline).
  const stats: { v: string; k: string }[] = [];
  if (programmes.length > 0) stats.push({ v: String(programmes.length), k: programmes.length === 1 ? 'programme open now' : 'programmes open now' });
  if (tutorCount > 0) stats.push({ v: String(tutorCount), k: tutorCount === 1 ? 'vetted tutor or academy' : 'vetted tutors & academies' });
  if (tutorLed > 0 && selfPaced > 0) stats.push({ v: '2', k: 'formats — tutor-led & self-paced' });
  stats.push({ v: '100%', k: 'hosted on the MyNclex platform' });

  return (
    <main className="prc">
      <ScrollReveal />

      {/* ═══ HERO ═══ */}
      <section className="prc-hero">
        <span className="prc-glow a" />
        <span className="prc-glow b" />
        <div className="prc-hero-inner">
          <div className="prc-hero-copy">
            <div className="prc-eyebrow">Vetted tutored programmes · NCLEX-RN</div>
            <h1 className="prc-serif">Programmes from tutors who&apos;ve <em>done this before.</em></h1>
            <p className="prc-hero-lede">
              Tutor-led intensives and self-paced courses for internationally trained nurses preparing for
              the NCLEX-RN. Pick a tutor, pick a cohort — Quademia hosts the content.
            </p>
            <div className="prc-hero-ctas">
              <a className="prc-btn prc-btn-primary" href="#list">Browse programmes →</a>
              <a className="prc-btn prc-btn-ghost" href="#how">How it works</a>
            </div>
            <div className="prc-hero-meta">
              <span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                Every tutor vetted by Quademia
              </span>
              <span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Pay in full or in installments
              </span>
            </div>
          </div>

          {/* visible hero photo (replaces the prototype's floating card) */}
          <div className="prc-hero-photo prc-reveal">
            <div className="prc-hero-photo-frame">
              {HERO_PHOTO && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={HERO_PHOTO} alt="A MyNclex tutor teaching an online NCLEX-RN class" />
              )}
              <div className="prc-hero-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                <span>Every tutor vetted</span>
              </div>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="prc-stats-band">
          <div className="prc-stats">
            {stats.map((t) => (
              <div key={t.k} className="prc-stat">
                <div className="v">{t.v}</div>
                <div className="k">{t.k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROGRAMME LIST (real surface) ═══ */}
      <section id="list" className="prc-list">
        <ProgrammesList programmes={programmes} />
      </section>

      {/* ═══ HOW IT WORKS + portrait ═══ */}
      <section id="how" className="prc-how prc-reveal">
        <div className="prc-how-main">
          <div className="prc-how-head">
            <div className="prc-eyebrow">How it works</div>
            <h2 className="prc-serif">Pick a tutor. Pick a cohort.<br /><em>We host the rest.</em></h2>
          </div>
          <div className="prc-steps">
            {STEPS.map((s) => (
              <div key={s.n} className="prc-step">
                <span className="prc-step-n">{s.n}</span>
                <div className="prc-step-title">{s.title}</div>
                <div className="prc-step-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="prc-how-photo">
          <div className="prc-how-photo-frame">
            {HOW_PHOTO && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={HOW_PHOTO} alt="A tutor working with a student" />
            )}
          </div>
        </div>
      </section>

      {/* ═══ PHOTO BAND ═══ */}
      <section className="prc-photo-sec prc-reveal">
        <div className="prc-photo">
          <div className="prc-photo-img">
            {BAND_PHOTO && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={BAND_PHOTO} alt="A tutor teaching a live NCLEX-RN class" />
            )}
          </div>
          <div className="prc-photo-overlay">
            <div className="prc-photo-box">
              <div className="prc-eyebrow on-teal">Real tutors</div>
              <h3 className="prc-serif">Taught by nurses who&apos;ve <em>passed it</em></h3>
              <p>
                Every tutor on MyNclex is a practising or licensed nurse, vetted by Quademia. Their name and
                record are on every programme they run — no anonymous course mills.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INSIDE A PROGRAMME (interactive sample) ═══ */}
      <InsideDemo />

      {/* ═══ FINAL CTA ═══ */}
      <section className="prc-cta-sec">
        <span className="prc-cta-glow" />
        <div className="prc-cta-photo">
          {CTA_PHOTO ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={CTA_PHOTO} alt="A nurse celebrating success" />
          ) : (
            <div className="prc-cta-photo-fallback" />
          )}
        </div>
        <div className="prc-cta-inner prc-reveal">
          <div className="prc-cta-copy">
            <h2 className="prc-serif">Your tutor is<br /><em>waiting.</em></h2>
            <p>
              Cohorts fill and close — browse what&apos;s open now, or message a tutor to hear when their next
              run starts. No dead ends: every programme has a way in.
            </p>
            <div className="prc-cta-row">
              <a className="prc-btn prc-btn-primary" href="#list">Browse programmes →</a>
              <span className="note">Tutoring nurses? <a href="/register">Run your programme on MyNclex</a></span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
