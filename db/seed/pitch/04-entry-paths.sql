-- db/seed/pitch/04-entry-paths.sql
--
-- Turns three of the four "TEMP" config fixtures into believable
-- programmes, and retires the two that have no pitch value.
--
-- WHY: the four TEMP programmes were built to force the distinct
-- call-to-action states a public programme page can show. They are all
-- PUBLISHED, and nclex_public_programmes gates only on that — so they
-- appear as cards on /programmes next to the real ones, titled
-- "TEMP 1 — Enrol (self-paced · on-platform · priced)". They also pad the
-- page's "N programmes open now" stat, which is derived from the list
-- length.
--
-- The CAPABILITY they demonstrate is a genuine selling point — the tutor
-- chooses how students get in and how they get paid:
--
--   payment_collection_mode  ON_PLATFORM  -> checkout on the platform
--                            OFF_PLATFORM -> "Collected directly by the tutor"
--   show_price_publicly      false        -> price hidden, enquiry form
--   cohorts + delivery_mode               -> enrol straight in, or waitlist
--
-- So the fix is presentation, not deletion. Each programme below keeps
-- its EXACT config — that combination is the whole point — and gains a
-- real title, tagline, description and unit outline.
--
-- Cheap because nclex_public_units exposes only (programme_id,
-- unit_index, title, description): NO activity count. A programme with
-- no activities looks identical on the public detail page to one with
-- fifty, as long as its units are named. None of these three needs a
-- curriculum built to do its job.
--
-- RETIRED (archived, and renamed so their purpose survives):
--   • TEMP 4 — tutor-led, on-platform, NO cohort. That combination
--     leaves a student with no way in at all. A useful edge-case
--     fixture; the opposite of a selling point.
--   • "Testing payment flow" — an empty 8-unit shell with no distinct
--     state to show.
--
-- Idempotent: every statement is an UPDATE or an ON CONFLICT upsert.

BEGIN;

-- =====================================================================
-- 1. Enrol straight in  (was TEMP 1)
-- =====================================================================
-- Config held: SELF_PACED · MODULE · ON_PLATFORM · price shown ·
-- UPFRONT_FULL GHS 3,500 · no cohorts.
-- Public CTA: "Enrol now" — the simplest path in.

UPDATE nclex_programmes SET
  title = 'Pharmacology Made Simple — Self-Paced',
  tagline = 'The drug families the exam keeps coming back to, in six modules you can take at your own pace.',
  description = E'Pharmacology is the single biggest reason candidates run out of confidence. Not because it is hard, but because it is usually taught as a list to memorise rather than a set of patterns to recognise.\n\nThis programme takes the six areas the NCLEX-RN actually tests and teaches the pattern in each: what the drug family does, what it therefore does wrong, and what you watch for. Once you can predict a side effect from the mechanism, you stop needing to memorise them one by one.\n\nIt is entirely self-paced. There are no live sessions and no fixed dates — enrol and start the same day, work through it in whatever order suits your shifts, and come back to any module as often as you like.\n\nWho this is for: anyone preparing for NCLEX-RN who loses marks on medication questions. It sits alongside a fuller programme rather than replacing one.',
  updated_at = NOW()
WHERE programme_id = 'aaaa0001-0000-4000-8000-000000000001';

UPDATE nclex_programme_units u SET
  title = v.title, description = v.description,
  is_published = TRUE, updated_at = NOW()
FROM  (VALUES
  (1, 'How a drug moves through the body',
      'Absorption, distribution, metabolism and excretion — and the two organs whose failure changes every dose on the chart.'),
  (2, 'The cardiovascular drugs',
      'Beta blockers, ACE inhibitors, calcium channel blockers and diuretics: what each one does to blood pressure, and what it costs.'),
  (3, 'Anticoagulants, insulin and the high-alert list',
      'The drugs that kill people when they go wrong. Antidotes, monitoring, and the values that stop a dose.'),
  (4, 'Pain, sedation and controlled drugs',
      'Opioids and their reversal, sedation scoring, and the respiratory depression question the exam asks in five different ways.'),
  (5, 'Antibiotics, antivirals and infection',
      'Classes, the toxicities that identify them, and why a trough level is drawn when it is.'),
  (6, 'Dosage calculation and safe administration',
      'The three formulas, weight-based paediatric dosing, and the unit conversions that cause most calculation errors.')
) AS v(unit_index, title, description)
WHERE u.programme_id = 'aaaa0001-0000-4000-8000-000000000001'
  AND u.unit_index = v.unit_index;

-- The fixture carried GHS 3,500. Harmless while it was called "TEMP 1";
-- under a real name it sits on the listing page as a SELF-PACED course
-- priced above the 4-week tutor-led bootcamp (GHS 3,000) and beside the
-- other self-paced ones at GHS 250–300, which reads as a data error.
-- The amount is not part of what this fixture demonstrates — only
-- show_price_publicly, payment_collection_mode and cohort presence drive
-- the call-to-action state — so it is safe to make coherent.
UPDATE nclex_programme_payment_strategies SET
  total_price_minor = 90000, initial_price_minor = 90000, updated_at = NOW()
WHERE programme_id = 'aaaa0001-0000-4000-8000-000000000001'
  AND kind = 'UPFRONT_FULL';


-- =====================================================================
-- 2. Join the waitlist  (was TEMP 2)
-- =====================================================================
-- Config held: TUTOR_LED · WEEK · OFF_PLATFORM · price shown ·
-- UPFRONT_FULL GHS 4,000 · one cohort.
-- Public CTA: "Join the waitlist", and the price sub-line reads
-- "Collected directly by the tutor" rather than offering checkout.

UPDATE nclex_programmes SET
  title = 'Weekend Intensive — NCLEX-RN in Four Weeks',
  tagline = 'Four Saturdays, one cohort at a time. For nurses who cannot give up a weeknight.',
  description = E'A condensed programme for candidates who already have the content and need the reasoning sharpened before a booked test date.\n\nFour weeks, one long session each Saturday, run as a single small cohort so there is time for everyone to be heard. Between sessions you work through the set questions and send me what you got wrong — the next Saturday starts from those.\n\nBecause the group is deliberately small, intakes run one at a time. If the current cohort has started, join the waitlist and I will contact you as soon as the next set of dates is confirmed.\n\nFees for this programme are arranged directly with me rather than through the platform — mobile money or bank transfer, and I can split it across the four weeks if that helps.',
  updated_at = NOW()
WHERE programme_id = 'aaaa0002-0000-4000-8000-000000000002';

UPDATE nclex_programme_units u SET
  title = v.title, description = v.description,
  is_published = TRUE, updated_at = NOW()
FROM  (VALUES
  (1, 'Management of Care and delegation',
      'The largest category on the test plan, and the one where marks are most often given away. Scope, prioritisation, delegation.'),
  (2, 'Safety, infection control and risk reduction',
      'Precautions, error prevention, and reading a lab value for what it changes about your next action.'),
  (3, 'Pharmacology and the high-alert drugs',
      'The drug families that dominate the exam, worked through live at exam pace.'),
  (4, 'Physiological adaptation, and the mock',
      'The emergencies, ranked against each other — then a full timed mock with the paper marked together.')
) AS v(unit_index, title, description)
WHERE u.programme_id = 'aaaa0002-0000-4000-8000-000000000002'
  AND u.unit_index = v.unit_index;

-- The cohort had rotted: it started 2026-07-25 with allow_late_join
-- FALSE, so the waitlist gate (start_date >= today OR allow_late_join)
-- was already failing and the "Join the waitlist" CTA this fixture
-- exists to demonstrate had stopped rendering.
--
-- Rebased on CURRENT_DATE so it cannot rot again, and snapped to a
-- Saturday to match the programme's name.
UPDATE nclex_cohorts SET
  name = 'Weekend cohort — Saturdays',
  start_date = (CURRENT_DATE + 21)
               + ((6 - EXTRACT(DOW FROM CURRENT_DATE + 21)::int + 7) % 7),
  end_date   = (CURRENT_DATE + 21)
               + ((6 - EXTRACT(DOW FROM CURRENT_DATE + 21)::int + 7) % 7) + 21,
  cohort_size = 12,
  allow_late_join = FALSE,
  cancelled_at = NULL,
  updated_at = NOW()
WHERE programme_id = 'aaaa0002-0000-4000-8000-000000000002';


-- =====================================================================
-- 3. Send an enquiry  (was TEMP 3)
-- =====================================================================
-- Config held: SELF_PACED · MODULE · ON_PLATFORM · price HIDDEN ·
-- NO payment strategies.
-- Public CTA: the enquiry form, with no price shown anywhere.
--
-- The hidden price now has a reason a tutor recognises: the programme is
-- quoted per candidate after a diagnostic conversation.

UPDATE nclex_programmes SET
  title = 'Retake Recovery Programme',
  tagline = 'For candidates who have sat NCLEX-RN once already. Priced individually, after we have talked.',
  description = E'Failing NCLEX-RN is survivable, and the second attempt is very winnable — but not by repeating the first attempt louder. It needs a different plan, built from what actually went wrong.\n\nThat is why this programme has no published price. Every retake starts with a conversation and a look at your candidate performance report, because the work required varies enormously. Some candidates need one weak pillar rebuilt over three weeks. Others were failed by timing, or by nerves, or by a habit of changing correct answers — and no amount of extra content would have helped them.\n\nSend an enquiry and tell me when you sat, what your report said if you have it, and when you are hoping to test again. I will come back to you with an honest plan and what it costs. If I think you do not need a paid programme at all, I will tell you that too.\n\nWho this is for: NCLEX-RN candidates who have received an unsuccessful result. First-time candidates are better served by one of the full programmes.',
  updated_at = NOW()
WHERE programme_id = 'aaaa0003-0000-4000-8000-000000000003';

UPDATE nclex_programme_units u SET
  title = v.title, description = v.description,
  is_published = TRUE, updated_at = NOW()
FROM  (VALUES
  (1, 'Reading your candidate performance report',
      'What the report actually tells you, what it does not, and which parts are worth planning around.'),
  (2, 'Rebuilding the weakest pillar',
      'Targeted work on the one or two categories that came back Below Passing Standard.'),
  (3, 'The reasoning habits that cost you marks',
      'Second-guessing, changing correct answers, and reading a question after the choices instead of before.'),
  (4, 'The question formats you avoided',
      'Select-all-that-apply, matrix and bow-tie items — the formats candidates skim past in practice and then meet on the day.'),
  (5, 'Timed practice under real conditions',
      'Full-length sittings at exam pace, because stamina and timing fail more retakers than content does.'),
  (6, 'Your test-day plan, second time around',
      'Booking, the fortnight before, and managing the part of the day that went wrong last time.')
) AS v(unit_index, title, description)
WHERE u.programme_id = 'aaaa0003-0000-4000-8000-000000000003'
  AND u.unit_index = v.unit_index;


-- =====================================================================
-- 4. Retire the two with no pitch value
-- =====================================================================
-- Archived, not deleted: ARCHIVED drops out of nclex_public_programmes
-- (which gates on PUBLISHED), so they leave /programmes and stop
-- inflating its "programmes open now" count, while the rows survive for
-- whatever they were testing.
--
-- Renamed FIXTURE rather than TEMP so the next person can see at a
-- glance what they are for and that the state is deliberate.

UPDATE nclex_programmes SET
  title = 'FIXTURE — no open path (tutor-led · on-platform · no cohort)',
  tagline = 'Config fixture: a student has no way in. Republish temporarily to test that state.',
  status = 'ARCHIVED',
  archived_at = COALESCE(archived_at, NOW()),
  updated_at = NOW()
WHERE programme_id = 'aaaa0004-0000-4000-8000-000000000004';

UPDATE nclex_programmes SET
  title = 'FIXTURE — payment flow (three strategies, no curriculum)',
  tagline = 'Config fixture: upfront, deposit-balance and installment side by side. Republish temporarily to test checkout.',
  status = 'ARCHIVED',
  archived_at = COALESCE(archived_at, NOW()),
  updated_at = NOW()
WHERE programme_id = '00df7a9b-401e-47d4-83b1-cfce435fa59e';

COMMIT;
