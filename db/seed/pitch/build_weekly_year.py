#!/usr/bin/env python3
"""
Generates db/seed/pitch/09-weekly-year.sql — turns the Free Weekly NCLEX
Q&A (programme D of 08-maternity.sql) into a full year.

WHAT CHANGES, AND WHY IT IS NOT JUST "MORE WEEKS". The programme shipped
as four weeks of pure open-floor Q&A: "no curriculum, no agenda beyond
what you bring". That is a nice thing to attend and a hard thing to
choose — there is no reason to come back on any particular Tuesday. This
seed gives every week a taught NCLEX topic (~25 min) and keeps the open
floor after it (~30 min), so the week has a reason and the programme
keeps the drop-in quality that makes a free session easy to walk into.

THE 52 WEEKS ARE WEIGHTED BY THE REAL TEST PLAN. Weeks 1-51 each carry
one Client Needs subcategory; week 52 is the finale (exam day + how CAT
works). Across those 51 teaching weeks every one of the eight
subcategories lands INSIDE its published NCSBN range — see BLUEPRINT
below and the assertion at the bottom of this file, which fails the
build rather than shipping a claim that has quietly drifted. Ranges are
read from the same source the app uses,
lib/bank/classifications.ts -> CLIENT_NEEDS_BLUEPRINT_RANGES.

FOUR TERMS OF 13, MIXED — NOT EIGHT BLOCKS BY CATEGORY. Each term touches
all eight subcategories in proportion, so a candidate who joins in
September gets representative coverage inside 13 weeks instead of landing
in the middle of a nine-week Management of Care run.

SIX WEEKS CROSS-SELL. Weeks 6, 17, 22, 29, 34 and 40 are exactly the six
maternity notes from 08-maternity.sql, so the free year has a built-in
route into the paid programmes. The pointer goes in the activity's `note`
field, which online-live-session-viewer.tsx renders as "Note: ...".
They deliberately sit in three different subcategories, which is how
maternity actually appears on the exam (bank-coverage-gap-analysis.md
section 3: woven through every client-needs category).

SCHEDULING IS ONE TERM AT A TIME. All 52 weeks are published, because the
complete year is the attractive thing a prospect reads. Only TERM 1's 13
Tuesdays get live-session rows — 52 dated sessions is a promise to show
up every Tuesday for a year, and a tutor should commit a term at a time.
Terms 2-4 have their topic and no date.

TWO TRAPS THIS FILE HANDLES:
  1. nclex_programmes_reconcile_units_trg fires AFTER UPDATE OF
     length_units and INSERTs blank units with random ids for every new
     index (4 -> 52 makes 48 of them), which collide on
     (programme_id, unit_index). The stray DELETE runs after the
     programme upsert and before the real units, same as 08-maternity.
     nclex_programmes_seed_units_trg does the same on a fresh INSERT.
  2. For a TUTOR_LED programme the student sees the curriculum THROUGH
     nclex_cohort_checklist_items — no checklist row, no activity. The
     seed-on-cohort-INSERT trigger documented in db/schema.sql does not
     exist on dev, so all 52 rows are written explicitly.

Idempotent throughout.

Run:  python3 db/seed/pitch/build_weekly_year.py
"""

import os

TUTOR_ID = "4ed777d7-e4f7-403b-88f4-63ce5432d65e"
PROGRAMME_ID = "80000000-0000-4000-8000-000000000004"
COHORT_ID = "86000000-0000-4000-8000-000000000004"

# Published NCSBN 2023 test-plan ranges, mirroring
# lib/bank/classifications.ts -> CLIENT_NEEDS_BLUEPRINT_RANGES.
BLUEPRINT = {
    "Management of Care": (15, 21),
    "Safety and Infection Control": (10, 16),
    "Health Promotion and Maintenance": (6, 12),
    "Psychosocial Integrity": (6, 12),
    "Basic Care and Comfort": (6, 12),
    "Pharmacological and Parenteral Therapies": (13, 19),
    "Reduction of Risk Potential": (9, 15),
    "Physiological Adaptation": (11, 17),
}

AREA = {
    "MOC": "Management of Care",
    "SAFE": "Safety and Infection Control",
    "HP": "Health Promotion and Maintenance",
    "PSY": "Psychosocial Integrity",
    "BCC": "Basic Care and Comfort",
    "PHARM": "Pharmacological and Parenteral Therapies",
    "ROR": "Reduction of Risk Potential",
    "PHYS": "Physiological Adaptation",
}

TERMS = [
    (1, 13, "Foundations"),
    (14, 26, "The body under stress"),
    (27, 39, "Complex care"),
    (40, 52, "Finishing"),
]

# Cross-sell targets: which paid programme covers this week's ground.
NOTES = "Maternity & Newborn — Revision Notes (GHS 150)"
DOING = "Maternity & Newborn — Learn by Doing (GHS 600)"
MOCK = "Maternity & Newborn — Mock Exam (GHS 100)"
SELL_NOTES = (
    "Going deeper: this week's topic is one of the six notes in "
    + NOTES
    + ", and the same six with practice built into every note in "
    + DOING
    + "."
)
SELL_MOCK = (
    "Going deeper: this week's topic is covered in "
    + NOTES
    + " and "
    + DOING
    + ", and it is examined in "
    + MOCK
    + "."
)

# (week, area, title, what gets taught, cross-sell note or None)
WEEKS = [
    # ---- Term 1 — Foundations -------------------------------------
    (1, "MOC", "Prioritisation: who do you see first?",
     "Maslow, ABC, acute before chronic, unstable before stable — and the order to apply them in.", None),
    (2, "SAFE", "The five rights of delegation",
     "What an RN may delegate to an LPN and to a UAP, and the tasks that can never leave the RN.", None),
    (3, "PHARM", "The six rights of medication administration",
     "The six rights, the three checks, and the high-alert drugs that need a second nurse.", None),
    (4, "PHYS", "Fluids and electrolytes I: sodium and potassium",
     "Hyper- and hyponatraemia, hyper- and hypokalaemia: the signs, and what you never push IV.", None),
    (5, "ROR", "The ten lab values that actually turn up",
     "The values worth memorising, the ones you can reason out, and how the exam disguises them.", None),
    (6, "HP", "Dating a pregnancy",
     "Naegele's rule, the weeks-minus-nine weight shortcut, fundal height and the visit schedule.", SELL_NOTES),
    (7, "MOC", "Consent, advance directives, and who can sign",
     "Informed consent and whose job it is, advance directives, power of attorney, and the minor exceptions.", None),
    (8, "PSY", "Therapeutic communication",
     "Open questions, reflection and silence — and the reassurance, advice and 'why' questions that lose marks.", None),
    (9, "SAFE", "Infection control: the four precaution types",
     "Standard, contact, droplet and airborne — which disease sits where, and the PPE that goes with each.", None),
    (10, "PHARM", "Insulin: types, peaks, and the sliding scale",
     "Onset and peak by insulin type, when hypoglycaemia is due, mixing order, and the sliding-scale question.", None),
    (11, "PHYS", "Acid-base, made mechanical",
     "The tic-tac-toe method: read the pH, read the CO2 and the bicarb, name it, and decide if it is compensated.", None),
    (12, "BCC", "Positioning: the ones the exam asks about",
     "Post-op, post-procedure and emergency positions — and the reason behind each, so you can derive it.", None),
    (13, "ROR", "Pre- and post-operative care",
     "The pre-op checklist, what stops a case going ahead, and the post-op complications by day.", None),

    # ---- Term 2 — The body under stress ---------------------------
    (14, "PHYS", "Heart failure: left versus right",
     "Pulmonary signs versus systemic signs, and the assessment findings that separate them at the bedside.", None),
    (15, "PHARM", "Cardiac drugs and their toxicity signs",
     "Digoxin, beta blockers and ACE inhibitors: what you hold them for, and the first sign of toxicity.", None),
    (16, "MOC", "Triage and disaster",
     "Who gets treated first in a mass-casualty event, and why the usual priority rules invert.", None),
    (17, "HP", "Positive, probable, presumptive",
     "The four signs that PROVE a pregnancy, why a positive test is not one, and the three-word range trick.", SELL_NOTES),
    (18, "SAFE", "Falls, restraints and the rules that govern them",
     "Risk assessment, the least-restrictive rule, the order requirements, and what must be documented.", None),
    (19, "ROR", "ECG basics: the four rhythms you must recognise",
     "Normal sinus, atrial fibrillation, ventricular tachycardia and ventricular fibrillation — and the response to each.", None),
    (20, "PHYS", "COPD versus asthma, and the oxygen trap",
     "How the two differ in presentation and treatment, and why high-flow oxygen is the wrong answer in COPD.", None),
    (21, "PHARM", "Anticoagulants: heparin versus warfarin",
     "Which lab monitors which, the therapeutic ranges, the antidotes, and the teaching points.", None),
    (22, "HP", "The stages of labour, and the prolapsed cord",
     "The four stages, the three phases of the first, how to time contractions, and the emergency you act on before calling.", SELL_NOTES),
    (23, "PSY", "Anxiety versus panic",
     "The four levels of anxiety, what a client can still learn at each, and the level at which you stop teaching and stay.", None),
    (24, "SAFE", "Medication errors: reporting and prevention",
     "What you do first for the client, incident reporting, and the just-culture reasoning behind it.", None),
    (25, "MOC", "Case management, referrals and continuity",
     "Discharge planning, which discipline to refer to, and the handover that does not lose information.", None),
    (26, "BCC", "Therapeutic diets: who gets which",
     "Renal, cardiac, diabetic, low-residue and dysphagia diets — and the food the exam plants as a distractor.", None),

    # ---- Term 3 — Complex care ------------------------------------
    (27, "MOC", "Prioritisation II: the four-patient question",
     "The format where four clients are described and one needs you now. A method, worked live on real stems.", None),
    (28, "PHYS", "DKA versus HHS, Addison versus Cushing",
     "Two pairs the exam confuses on purpose: what separates them, and the treatment that differs.", None),
    (29, "ROR", "Reading a fetal monitor strip",
     "VEAL CHOP: naming the pattern from its timing, and the five actions for a late deceleration.", SELL_MOCK),
    (30, "PHARM", "Pain management and the opioid rules",
     "The analgesic ladder, equianalgesia, the respiratory-rate threshold, and naloxone.", None),
    (31, "MOC", "Delegation II: the assignments you cannot make",
     "Room assignments, infection risk, the new graduate, and the float nurse outside their competence.", None),
    (32, "PHYS", "Stroke, raised ICP, and the signs you never ignore",
     "Ischaemic versus haemorrhagic, the tPA window, Cushing's triad, and the positioning that differs.", None),
    (33, "SAFE", "Emergencies: the order of actions",
     "When several things are happening at once — what you do, what you delegate, and what waits.", None),
    (34, "HP", "Postpartum assessment",
     "Fundus (tone, height, position), lochia, temperature — and why a deviated fundus changes your first action.", SELL_NOTES),
    (35, "PHARM", "Antibiotics: families, toxicities, peak and trough",
     "Aminoglycosides, vancomycin and the rest: what each damages, and when the levels are drawn.", None),
    (36, "ROR", "Diagnostic tests: prep, aftercare, consent",
     "NPO rules, contrast and the kidney, which tests need written consent, and the post-procedure checks.", None),
    (37, "MOC", "Incident reports, QI, and what belongs in a chart",
     "The difference between the chart and the incident report, and the documentation that survives scrutiny.", None),
    (38, "PSY", "Depression and suicide risk",
     "Assessing risk directly, the danger period as mood lifts, and what a safety plan contains.", None),
    (39, "BCC", "Mobility, skin integrity and pressure injuries",
     "The four stages plus unstageable, the sites that break down first, and prevention that is actually done.", None),

    # ---- Term 4 — Finishing ---------------------------------------
    (40, "PHYS", "The normal newborn — and what is not",
     "Skin findings that need only reassurance, the 24-hour jaundice rule, and APGAR bands and actions.", SELL_NOTES),
    (41, "PSY", "Substance use: withdrawal, and what you treat first",
     "Alcohol withdrawal timelines and why it is the lethal one, opioid withdrawal, and the CIWA response.", None),
    (42, "PHARM", "Lithium, SSRIs, antipsychotics — and their crises",
     "Lithium levels and toxicity, serotonin syndrome, neuroleptic malignant syndrome, and extrapyramidal signs.", None),
    (43, "HP", "Immunisation across the lifespan",
     "The childhood schedule, live-vaccine contraindications, and the adult and pregnancy exceptions.", None),
    (44, "SAFE", "Paediatric safety and developmental milestones",
     "The hazard that matches each age, car-seat and sleep rules, and the milestones worth memorising.", None),
    (45, "BCC", "Elimination: catheters, ostomies, bowel programmes",
     "Catheter care and CAUTI prevention, stoma assessment and output by type, and bowel training.", None),
    (46, "ROR", "Paediatric vital signs that change everything",
     "Normal ranges by age, the first sign of paediatric deterioration, and why the blood pressure falls last.", None),
    (47, "PSY", "Grief, loss and end-of-life care",
     "The stages and why they are not a sequence, cultural practice around death, and comfort-focused care.", None),
    (48, "SAFE", "Home and community safety for the older adult",
     "Fall-proofing a home, polypharmacy, driving and heat, and recognising elder abuse.", None),
    (49, "PHARM", "Dosage calculation, worked slowly",
     "The four question types — tablets, liquids, IV rates, weight-based — one method each, done step by step.", None),
    (50, "MOC", "Putting it together: a full prioritisation set",
     "A live set of prioritisation and delegation stems, answered out loud, with the reasoning shown each time.", None),
    (51, "BCC", "Comfort, sleep and complementary therapies",
     "Non-pharmacological pain relief, sleep hygiene on shift work, and the therapies the exam recognises.", None),
    (52, None, "Exam day, and how CAT actually works",
     "What computer-adaptive testing really does, the 85-150 item range, the last two weeks, and the day itself.", None),
]

# Term 1's live sessions are the only dated ones (see the docstring).
SCHEDULED_THROUGH = 13


# ---------------------------------------------------------------- helpers

def q(s):
    """Single-quoted SQL literal."""
    return "'" + s.replace("'", "''") + "'"


def unit_id(w):
    return f"81000000-0000-4000-8000-004{w:03d}000000"


def block_id(w):
    return f"82000000-0000-4000-8000-004{w:03d}001000"


def activity_id(w):
    return f"83000000-0000-4000-8000-004{w:03d}001001"


def session_id(w):
    return f"87000000-0000-4000-8000-004{w:03d}000000"


def term_of(w):
    for first, last, name in TERMS:
        if first <= w <= last:
            return first, last, name
    raise ValueError(w)


# ------------------------------------------------------- blueprint check

def check_blueprint():
    """Fail the build rather than ship a drifted claim."""
    assert len(WEEKS) == 52, f"expected 52 weeks, got {len(WEEKS)}"
    assert [w[0] for w in WEEKS] == list(range(1, 53)), "weeks out of order"

    counts = {}
    for _, area, *_ in WEEKS:
        if area is None:
            continue
        counts[AREA[area]] = counts.get(AREA[area], 0) + 1

    teaching = sum(counts.values())
    assert teaching == 51, f"expected 51 teaching weeks, got {teaching}"
    assert set(counts) == set(BLUEPRINT), "an NCLEX subcategory is missing"

    lines = []
    for name, (lo, hi) in BLUEPRINT.items():
        n = counts[name]
        pct = 100.0 * n / teaching
        assert lo <= pct <= hi, (
            f"{name}: {n}/{teaching} = {pct:.1f}% is outside its "
            f"published range {lo}-{hi}%"
        )
        lines.append(f"--   {name:<42} {n:>2} weeks  {pct:>4.1f}%  ({lo}-{hi}%)")

    # Every term must touch enough of the plan to be worth joining cold.
    for first, last, name in TERMS:
        areas = {a for w, a, *_ in WEEKS if first <= w <= last and a}
        assert len(areas) >= 7, f"term '{name}' covers only {len(areas)} areas"

    return lines


# ------------------------------------------------------------------ SQL

def build():
    blueprint_lines = check_blueprint()
    sold = [w[0] for w in WEEKS if w[4]]

    out = []
    a = out.append

    a("-- db/seed/pitch/09-weekly-year.sql")
    a("-- GENERATED by db/seed/pitch/build_weekly_year.py — edit the generator.")
    a("--")
    a("-- The Free Weekly NCLEX Q&A becomes a full year: 52 weeks, each with a")
    a("-- taught NCLEX topic (~25 min) followed by the open floor (~30 min).")
    a("--")
    a("-- Weeks 1-51 carry one Client Needs subcategory each; week 52 is the")
    a("-- finale. Across the 51 teaching weeks every subcategory lands inside")
    a("-- its published NCSBN range:")
    a("--")
    out.extend(blueprint_lines)
    a("--")
    a("-- Four terms of 13, each touching all eight areas in proportion, so")
    a("-- joining cold in any term still gives representative coverage.")
    a("--")
    a(f"-- Weeks {', '.join(str(w) for w in sold)} point at the paid maternity")
    a("-- programmes from 08-maternity.sql (the activity `note` field).")
    a("--")
    a(f"-- Live sessions are dated for TERM 1 ONLY (weeks 1-{SCHEDULED_THROUGH}).")
    a("-- Terms 2-4 are published with their topic and no date, because 52")
    a("-- dated sessions is a year-long promise a tutor should make a term at")
    a("-- a time.")
    a("--")
    a("-- Requires 08-maternity.sql (the programme row and the six notes it")
    a("-- cross-sells). Idempotent throughout.")
    a("")
    a("BEGIN;")
    a("")

    # -- 1. programme -------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 1. The programme — 4 weeks becomes 52")
    a("-- " + "=" * 68)
    a("-- Upsert rather than UPDATE so the file stands alone if the programme")
    a("-- was never seeded. Either path fires a unit trigger (seed_units on")
    a("-- INSERT, reconcile_units on the length_units change), both of which")
    a("-- create blank units with random ids — section 2 clears them.")
    a("")
    description = (
        "Every Tuesday evening I teach one NCLEX topic for about twenty-five "
        "minutes, and then the floor is open for as long as you have "
        "questions. It is free, and it always will be.\n\n"
        "The year is not a random list of topics. All eight NCLEX Client "
        "Needs areas appear across the 52 weeks in the same proportions the "
        "real exam uses, so a candidate who attends for a year has been "
        "taught the test plan — not somebody's favourite subjects. The year "
        "runs in four terms of thirteen weeks, and every term touches all "
        "eight areas, so it does not matter which week you start.\n\n"
        "Sessions are recorded and posted here the same evening, so a shift "
        "does not cost you the week. Join the cohort and you get the joining "
        "link, the full 52-week plan and every recording so far.\n\n"
        "Who comes: candidates at every stage, including people who have not "
        "decided whether they want a paid programme at all. That is fine. "
        "Come and see how I teach before you spend anything."
    )
    a("INSERT INTO nclex_programmes (")
    a("  programme_id, tutor_id, title, tagline, description,")
    a("  delivery_mode, unit_label, length_units,")
    a("  price_currency, show_price_publicly, payment_collection_mode,")
    a("  access_window_days, payment_gates_access, status, published_at")
    a(") VALUES (")
    a(f"  {q(PROGRAMME_ID)}, {q(TUTOR_ID)},")
    a("  'Free Weekly NCLEX Q&A',")
    a("  'A free taught session every Tuesday, all year — weighted to the real "
      "test plan. Recordings the same evening.',")
    a(f"  {q(description)},")
    a("  'TUTOR_LED', 'WEEK', 52,")
    a("  'GHS', TRUE, 'ON_PLATFORM',")
    a("  NULL, FALSE, 'PUBLISHED', NOW()")
    a(")")
    a("ON CONFLICT (programme_id) DO UPDATE SET")
    a("  title = EXCLUDED.title, tagline = EXCLUDED.tagline,")
    a("  description = EXCLUDED.description, delivery_mode = EXCLUDED.delivery_mode,")
    a("  unit_label = EXCLUDED.unit_label, length_units = EXCLUDED.length_units,")
    a("  access_window_days = EXCLUDED.access_window_days,")
    a("  show_price_publicly = EXCLUDED.show_price_publicly,")
    a("  payment_gates_access = EXCLUDED.payment_gates_access,")
    a("  status = 'PUBLISHED', updated_at = NOW();")
    a("")

    # -- 2. strays ----------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 2. Clear the trigger's blank units")
    a("-- " + "=" * 68)
    a("-- Must run AFTER section 1 and BEFORE section 3: the trigger's rows")
    a("-- carry random ids and collide with ours on (programme_id, unit_index).")
    a("")
    a("DELETE FROM nclex_programme_units")
    a(f"WHERE  programme_id = {q(PROGRAMME_ID)}")
    a("  AND  unit_id::text NOT LIKE '81000000-0000-4000-8000-004%';")
    a("")

    # -- 3. units -----------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 3. Fifty-two weeks")
    a("-- " + "=" * 68)
    a("-- The unit description carries the term and the NCLEX area, so both")
    a("-- are visible everywhere a unit is listed.")
    a("")
    a("INSERT INTO nclex_programme_units")
    a("  (unit_id, programme_id, unit_index, title, description, is_published)")
    a("VALUES")
    rows = []
    for w, area, title, teaches, _note in WEEKS:
        first, last, tname = term_of(w)
        tno = [t[2] for t in TERMS].index(tname) + 1
        label = AREA[area] if area else "The finale"
        desc = f"Term {tno} · {tname} — {label}. {teaches}"
        rows.append(
            f"  ({q(unit_id(w))}, {q(PROGRAMME_ID)}, {w},\n"
            f"   {q(title)},\n"
            f"   {q(desc)}, TRUE)"
        )
    a(",\n".join(rows))
    a("ON CONFLICT (unit_id) DO UPDATE SET")
    a("  title = EXCLUDED.title, description = EXCLUDED.description,")
    a("  is_published = TRUE, updated_at = NOW();")
    a("")

    # -- 4. blocks ----------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 4. One block per week")
    a("-- " + "=" * 68)
    a("")
    a("INSERT INTO nclex_programme_blocks")
    a("  (block_id, unit_id, cohort_id, ordinal, title, description, is_published)")
    a("VALUES")
    rows = [
        f"  ({q(block_id(w))}, {q(unit_id(w))}, NULL, 1, 'This week', NULL, TRUE)"
        for w, *_ in WEEKS
    ]
    a(",\n".join(rows))
    a("ON CONFLICT (block_id) DO UPDATE SET")
    a("  title = EXCLUDED.title, is_published = TRUE, updated_at = NOW();")
    a("")

    # -- 5. activities ------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 5. The live session for each week")
    a("-- " + "=" * 68)
    a("-- ONLINE_LIVE_SESSION is a MARKER: identity and typical duration only.")
    a("-- Dates, joining details and recordings are per-cohort and live in")
    a("-- nclex_cohort_live_sessions (section 8).")
    a("--")
    a("-- `note` renders as \"Note: ...\" in online-live-session-viewer.tsx,")
    a("-- which is where the six cross-sell weeks put their pointer.")
    a("")
    a("INSERT INTO nclex_programme_activities")
    a("  (activity_id, unit_id, block_id, cohort_id, ordinal,")
    a("   type, title, description, note, payload, is_published)")
    a("VALUES")
    rows = []
    for w, area, title, _teaches, note in WEEKS:
        if area:
            desc = (
                f"About 25 minutes on {AREA[area]}, then the floor is open — "
                "bring anything, including questions on other topics."
            )
        else:
            desc = (
                "The last session of the year: exam-day logistics, how the "
                "adaptive test decides, and a recap of the twelve months. "
                "Open floor after, as always."
            )
        rows.append(
            f"  ({q(activity_id(w))},\n"
            f"   {q(unit_id(w))},\n"
            f"   {q(block_id(w))}, NULL, 1,\n"
            f"   'ONLINE_LIVE_SESSION', {q(title)},\n"
            f"   {q(desc)},\n"
            f"   {q(note) if note else 'NULL'},\n"
            f"   $j${{\"typical_duration_minutes\": 60}}$j$::jsonb, TRUE)"
        )
    a(",\n".join(rows))
    a("ON CONFLICT (activity_id) DO UPDATE SET")
    a("  ordinal = EXCLUDED.ordinal, type = EXCLUDED.type, title = EXCLUDED.title,")
    a("  description = EXCLUDED.description, note = EXCLUDED.note,")
    a("  payload = EXCLUDED.payload, is_published = TRUE, updated_at = NOW();")
    a("")

    # -- 6. cohort ----------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 6. The cohort — one cycle, running now")
    a("-- " + "=" * 68)
    a("-- The programme's own description promises a cohort ('join the cohort")
    a("-- and you get the joining link'), and until now there was not one.")
    a("--")
    a("-- start_date is the Tuesday on or before CURRENT_DATE - 56, so eight")
    a("-- weeks have already aired and carry recordings. That is deliberate:")
    a("-- the back catalogue is the reason joining late is attractive rather")
    a("-- than a problem. Anchored to the weekday rather than a raw offset,")
    a("-- because the cohort is named 'Tuesdays' and the first thing anyone")
    a("-- reads is the date beside that name.")
    a("--")
    a("-- allow_late_join is TRUE — a rolling free year that you could not")
    a("-- join in week 30 would be a strange thing to publish. No size cap.")
    a("")
    a("INSERT INTO nclex_cohorts (")
    a("  cohort_id, programme_id, name, start_date, end_date,")
    a("  cohort_size, allow_late_join")
    a(")")
    a("SELECT")
    a(f"  {q(COHORT_ID)}::uuid, {q(PROGRAMME_ID)},")
    a("  'Tuesdays 19:00 GMT — the 2026 cycle',")
    a("  v.start_date, v.start_date + 363, NULL, TRUE")
    a("FROM (")
    a("  SELECT (CURRENT_DATE - 56)")
    a("    - ((EXTRACT(DOW FROM CURRENT_DATE - 56)::int - 2 + 7) % 7) AS start_date")
    a(") AS v")
    a("ON CONFLICT (cohort_id) DO UPDATE SET")
    a("  name = EXCLUDED.name,")
    a("  start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,")
    a("  cohort_size = EXCLUDED.cohort_size,")
    a("  allow_late_join = EXCLUDED.allow_late_join,")
    a("  cancelled_at = NULL, updated_at = NOW();")
    a("")

    # -- 7. checklist -------------------------------------------------
    a("-- " + "=" * 68)
    a("-- 7. Cohort checklist — all 52 weeks")
    a("-- " + "=" * 68)
    a("-- For a TUTOR_LED programme the student sees the curriculum THROUGH")
    a("-- these rows: no checklist row, no activity. All 52 are written, not")
    a("-- just the scheduled term — the complete year is the thing worth")
    a("-- joining for, and an undated week still shows its topic.")
    a("--")
    a("-- release_date follows the app's own week pacing")
    a("-- (lib/curriculum/cohort-attach.ts): start_date + (unit_index - 1) x 7.")
    a("")
    a("INSERT INTO nclex_cohort_checklist_items (")
    a("  cohort_id, template_activity_id, is_included,")
    a("  release_date, due_date, close_date, source")
    a(")")
    a("SELECT")
    a("  c.cohort_id, a.activity_id, TRUE,")
    a("  c.start_date + ((u.unit_index - 1) * 7),")
    a("  NULL, NULL, 'TEMPLATE'")
    a("FROM   nclex_cohorts c")
    a("JOIN   nclex_programme_units u      ON u.programme_id = c.programme_id")
    a("JOIN   nclex_programme_activities a ON a.unit_id = u.unit_id")
    a(f"WHERE  c.cohort_id = {q(COHORT_ID)}")
    a("  AND  a.cohort_id IS NULL")
    a("ON CONFLICT (cohort_id, template_activity_id) DO UPDATE SET")
    a("  is_included = TRUE,")
    a("  release_date = EXCLUDED.release_date,")
    a("  updated_at = NOW();")
    a("")

    # -- 8. live sessions ---------------------------------------------
    a("-- " + "=" * 68)
    a(f"-- 8. Live-session planner — TERM 1 ONLY (weeks 1-{SCHEDULED_THROUGH})")
    a("-- " + "=" * 68)
    a("-- Terms 2-4 deliberately have no rows: published topic, no date. The")
    a("-- tutor schedules the next term when they are ready to commit to it.")
    a("--")
    a("-- The date is derived from the cohort row rather than recomputing the")
    a("-- CURRENT_DATE arithmetic of section 6 — two copies of that sum would")
    a("-- eventually disagree, and this is what students turn up on.")
    a("--")
    a("-- Anything already past carries a recording, which is what makes the")
    a("-- back catalogue visible in the pitch.")
    a("")
    a("INSERT INTO nclex_cohort_live_sessions (")
    a("  session_id, cohort_id, marker_activity_id,")
    a("  scheduled_at, duration_minutes, platform,")
    a("  join_url, meeting_id, passcode, joining_instructions, recording_url")
    a(")")
    a("SELECT")
    a("  ('87000000-0000-4000-8000-004' || lpad(w::text,3,'0') || '000000')::uuid,")
    a("  c.cohort_id,")
    a("  ('83000000-0000-4000-8000-004' || lpad(w::text,3,'0') || '001001')::uuid,")
    a("  c.start_date::timestamptz + INTERVAL '19 hours'")
    a("    + ((w - 1) * INTERVAL '7 days'),")
    a("  60, 'ZOOM',")
    a("  'https://us06web.zoom.us/j/97700112233', '977 0011 2233', 'NCLEX',")
    a("  'Free and open — no registration beyond joining the cohort. Come for "
      "the taught part, stay for the questions, or just lurk. Recording goes "
      "up the same evening.',")
    a("  CASE WHEN c.start_date::timestamptz + INTERVAL '19 hours'")
    a("            + ((w - 1) * INTERVAL '7 days') < NOW()")
    a("       THEN 'https://example.com/mynclex/recordings/weekly/week-' || w")
    a("       ELSE NULL END")
    a(f"FROM generate_series(1,{SCHEDULED_THROUGH}) w")
    a("CROSS JOIN nclex_cohorts c")
    a(f"WHERE c.cohort_id = {q(COHORT_ID)}")
    a("ON CONFLICT (cohort_id, marker_activity_id) DO UPDATE SET")
    a("  scheduled_at = EXCLUDED.scheduled_at,")
    a("  duration_minutes = EXCLUDED.duration_minutes,")
    a("  platform = EXCLUDED.platform,")
    a("  join_url = EXCLUDED.join_url,")
    a("  meeting_id = EXCLUDED.meeting_id,")
    a("  passcode = EXCLUDED.passcode,")
    a("  joining_instructions = EXCLUDED.joining_instructions,")
    a("  recording_url = EXCLUDED.recording_url,")
    a("  updated_at = NOW();")
    a("")
    a("COMMIT;")
    a("")

    return "\n".join(out)


if __name__ == "__main__":
    sql = build()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "09-weekly-year.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"wrote {path} ({len(sql):,} bytes)")
