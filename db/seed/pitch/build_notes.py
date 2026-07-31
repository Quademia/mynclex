#!/usr/bin/env python3
"""
Generates db/seed/pitch/02-library-notes.sql — real bodies for the tutor
library notes the pitch programme links to.

Why a generator: the note body is a Tiptap document stored as JSONB, with
custom block types (callout / lab_values / drug_card). Hand-writing that
JSON inside SQL string literals is unreadable and easy to get wrong; the
helpers below let the content read like content.

Body shape is Tiptap's native doc — see lib/library/body-tiptap.ts.
Block ids are NOT required (no UniqueID extension on the editor).

Run:  python3 db/seed/pitch/build_notes.py
"""

import json
import os

TUTOR_ID = "4ed777d7-e4f7-403b-88f4-63ce5432d65e"

# ---------------------------------------------------------------- helpers

def t(s, *marks):
    node = {"type": "text", "text": s}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node

def p(*inline):
    """Paragraph. Bare strings are promoted to text nodes."""
    content = [t(i) if isinstance(i, str) else i for i in inline]
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}

def h(level, s):
    return {"type": "heading", "attrs": {"level": level}, "content": [t(s)]}

def _li(item):
    inline = item if isinstance(item, (list, tuple)) else [item]
    return {"type": "listItem", "content": [p(*inline)]}

def ul(*items):
    return {"type": "bulletList", "content": [_li(i) for i in items]}

def ol(*items):
    return {"type": "orderedList", "attrs": {"start": 1},
            "content": [_li(i) for i in items]}

def callout(tone, *inline):
    """tone: note | tip | warning | critical | memory"""
    content = [t(i) if isinstance(i, str) else i for i in inline]
    return {"type": "callout", "attrs": {"tone": tone}, "content": content}

def labs(title, columns, rows):
    return {"type": "lab_values", "attrs": {
        "title": title,
        "columns": [{"label": c} for c in columns],
        "rows": [list(r) for r in rows],
    }}

def drug(name, drug_class, fields):
    return {"type": "drug_card", "attrs": {
        "name": name, "drug_class": drug_class,
        "fields": [{"label": k, "value": v} for k, v in fields],
    }}

def doc(*blocks):
    return {"type": "doc", "content": list(blocks)}

# Shorthand marks
def b(s):
    return t(s, "bold")

def hl(s):
    return t(s, "highlight")


# ---------------------------------------------------------------- content
#
# Each entry: note_id (existing) or new_id, title, subtitle, tags, pillars,
# body. `new` entries are INSERTed; the rest UPDATE the existing stub row.

NOTES = []

def note(note_id, title, subtitle, pillars, tags, body, new=False):
    NOTES.append({
        "note_id": note_id, "title": title, "subtitle": subtitle,
        "pillars": pillars, "tags": tags, "body": body, "new": new,
    })


# ============================================================ WEEK 1 — strategy

note(
    "55000000-0000-4000-8000-000000000001",
    "Why the length of your exam tells you nothing",
    "How computerised adaptive testing actually decides",
    ["Management of Care"],
    ["cat", "exam-strategy", "high-yield"],
    doc(
        p("The NCLEX-RN is a ", b("computerised adaptive test"), ". There is no 70% pass "
          "mark. The computer asks one question, re-estimates your ability from your "
          "answer, then picks the next question to sit as close to that estimate as it can."),
        h(2, "Three consequences candidates lose sleep over"),
        h(3, "1. About half your questions will feel hard"),
        p("That is the machine working correctly. It hunts for the level where you get "
          "roughly half right, because that is where it learns the most about you. An "
          "exam that feels easy the whole way through is the more worrying sign."),
        h(3, "2. Shutting off at 85 questions means nothing on its own"),
        p("The exam ends when the computer is ", b("95% confident"), " you are either "
          "above or below the passing standard. It can reach that confidence at 85 "
          "questions or at 150. Candidates pass at 85; candidates fail at 85."),
        callout("warning",
                "You cannot read your result from the question count. The friend in your "
                "WhatsApp group who says \"it stopped at 85, you passed\" is guessing."),
        h(3, "3. The last question is not the deciding one"),
        p("Your ability estimate is built from your whole performance. Getting the final "
          "question wrong does not undo the exam."),
        h(2, "The three ways your test ends"),
        labs("How the exam stops",
             ["Rule", "What happens", "Pass condition"],
             [["Confidence rule", "95% certain you are above or below the standard",
               "Estimate sits above the standard"],
              ["Maximum length", "You reach the maximum number of questions",
               "Final estimate above the standard"],
              ["Run-out-of-time", "The clock expires before either rule triggers",
               "Your last 60 answers hold above the standard"]]),
        h(2, "What this changes about how you study"),
        p("Because the engine adapts, you cannot pass by memorising a bank of questions. "
          "It will keep climbing until it finds your ceiling. What moves your ceiling is "
          "reasoning — knowing why you assess before you intervene, and why airway beats "
          "pain every time."),
        callout("tip",
                "Practise in untimed learning mode early in the programme, and switch to "
                "timed mocks in the last three weeks. Speed without reasoning just gets "
                "you to the wrong answer faster."),
    ),
    new=True,
)

note(
    "e3eb4c15-3aec-46cd-b0d5-992651f4fe39",
    "ABC priority hierarchy",
    "Airway, Breathing, Circulation — and when it does not apply",
    ["Management of Care", "Physiological Adaptation"],
    ["priority", "abc", "strategy"],
    doc(
        p("When a question asks which client to see ", b("first"), ", which action takes "
          "priority, or who is most at risk, ABC decides most of them."),
        h(2, "The order"),
        ol(["Airway", " — is it open and protected? Stridor, choking, swelling, "
            "unresponsive with no gag reflex."],
           ["Breathing", " — is air actually moving? Rate, effort, saturation, absent "
            "breath sounds, silent chest in asthma."],
           ["Circulation", " — is blood reaching tissue? Bleeding, blood pressure, "
            "pulses, capillary refill, arrhythmia."]),
        callout("memory",
                "A patient can survive minutes without circulation and seconds without an "
                "airway. Time-to-death is the whole logic of the ordering."),
        h(2, "The traps"),
        h(3, "Trap 1 — a normal-sounding airway problem hidden in ordinary words"),
        p("\"Hoarse voice after a thyroidectomy\", \"drooling and won't lie flat\", "
          "\"restless\" — restlessness is early hypoxia, not anxiety. Restless plus a "
          "respiratory history outranks a client in severe pain."),
        h(3, "Trap 2 — ABC only ranks the unstable"),
        p("If every option is stable, ABC gives you nothing and the question is really "
          "about Maslow, safety, or timing. Check that at least one option describes an "
          "actual physiological threat before you reach for ABC."),
        callout("critical",
                "Exception: in a cardiac arrest the order is C-A-B — compressions first. "
                "The NCLEX tests this directly."),
        h(2, "Worked example"),
        p(b("Which client should the nurse assess first?")),
        ul("A client 2 days post-op reporting pain of 8/10",
           "A client with a new tracheostomy who is coughing up thick secretions",
           "A client with a haemoglobin of 8.1 g/dL awaiting transfusion",
           "A client with a blood pressure of 88/56 who is alert"),
        p("The tracheostomy client. Thick secretions in a new trach is an airway at risk "
          "of occlusion. The hypotensive client is circulation — real, but one level down, "
          "and the client is alert. Pain never outranks ABC."),
    ),
)

note(
    "59c113e5-0fcd-4d04-ad1a-1d91d222a203",
    "Maslow's hierarchy on NCLEX",
    "When physiological needs beat psychosocial ones — and when they do not",
    ["Psychosocial Integrity", "Management of Care"],
    ["priority", "maslow", "strategy"],
    doc(
        p("Maslow answers priority questions that ABC cannot, because every option is "
          "physiologically stable and the exam wants to know what you value."),
        h(2, "The order you apply"),
        ol("Physiological — airway, fluids, nutrition, elimination, pain, sleep",
           "Safety — falls, infection, injury, suicide risk, medication error",
           "Love and belonging — isolation, family, support",
           "Esteem — dignity, independence, body image",
           "Self-actualisation — meaning, acceptance, growth"),
        callout("tip",
                "Physical need first, then safety, then feelings. If two options are both "
                "physiological, drop back to ABC to split them."),
        h(2, "Where candidates go wrong"),
        h(3, "Assuming psychosocial answers are always wrong"),
        p("They are not. When the question stem is about ", b("communication"), " — a "
          "client who has just received a diagnosis, a grieving family, a client refusing "
          "treatment — the psychosocial option is usually correct. Maslow ranks competing "
          "needs; it does not delete the top of the pyramid."),
        h(3, "Forgetting that safety includes psychological safety"),
        p("A client expressing suicidal intent is a ", b("safety"), " problem, not an "
          "esteem one. It outranks nutrition, sleep and pain."),
        callout("warning",
                "Read the stem for the word 'first', 'initial', 'priority' or 'most "
                "important'. If none of them appear, the question may not be a priority "
                "question at all, and Maslow will lead you astray."),
        h(2, "Quick discriminator"),
        labs("Which framework does this question want?",
             ["The stem looks like", "Use"],
             [["One client is physiologically unstable", "ABC"],
              ["All clients stable, needs compete", "Maslow"],
              ["Who can I give this task to?", "Delegation rules"],
              ["Client has just been told bad news", "Therapeutic communication"],
              ["Something in the room could cause harm", "Safety / infection control"]]),
    ),
)

note(
    "33af9997-2289-4802-be98-9110668ea0db",
    "Select-all-that-apply strategy",
    "Why SATA feels brutal, and the method that fixes it",
    ["Management of Care"],
    ["strategy", "sata", "high-yield"],
    doc(
        p("Select-all-that-apply items are scored on ", b("partial credit"), " in the "
          "current test plan — you earn marks for each correct option you select and lose "
          "them for wrong selections. That changes the tactics completely."),
        h(2, "The method"),
        ol(["Cover the options.", " Read the stem and answer it in your own head first."],
           ["Treat each option as a separate true/false question.", " Not \"is this the "
            "best answer\" — \"is this statement true about this client, in this "
            "situation?\""],
           ["Say why out loud for each.", " If you cannot give a reason, it is a guess, "
            "and guesses cost marks under partial credit."],
           ["Do not count.", " There is no rule that says three are correct. It can be "
            "one, it can be all of them."]),
        callout("critical",
                "The single most expensive habit in SATA is selecting an option because it "
                "is true in general, without checking it is true for THIS client. "
                "\"Encourage fluids\" is true for most clients and dangerous in heart "
                "failure and renal failure."),
        h(2, "The two words that decide most options"),
        p("Scan every option for an ", b("absolute"), " — always, never, all, only, every. "
          "Nursing is full of exceptions, so absolutes are usually false. Then scan for "
          "the ", b("client-specific"), " detail in the stem — age, diagnosis, day "
          "post-op, lab value — and re-test each option against it."),
        h(2, "Worked example"),
        p(b("A client is admitted with acute pancreatitis. Which nursing actions are "
            "appropriate? Select all that apply.")),
        labs("Option-by-option",
             ["Option", "True/false", "Why"],
             [["Maintain NPO status", "TRUE", "Rests the pancreas — the core intervention"],
              ["Position on the left side, flat", "FALSE",
               "Sitting up and leaning forward relieves pain"],
              ["Monitor serum amylase and lipase", "TRUE", "Diagnostic and trend markers"],
              ["Administer a high-fat diet when eating resumes", "FALSE",
               "Low fat — fat triggers pancreatic stimulation"],
              ["Assess for Cullen and Turner signs", "TRUE",
               "Flank/periumbilical bruising signals haemorrhagic progression"]]),
        callout("tip",
                "Under partial credit, three confident selections beat five hopeful ones. "
                "Leave an option unselected if you cannot justify it."),
    ),
)

# ============================================================ WEEK 2 — management of care

note(
    "55000000-0000-4000-8000-000000000002",
    "Delegation: who can do what",
    "RN, LPN/LVN and UAP scope — the exam's favourite management question",
    ["Management of Care"],
    ["delegation", "scope", "high-yield"],
    doc(
        p("Management of Care is the largest single category on the test plan, and "
          "delegation is the biggest slice of it. The exam wants one thing: can you "
          "protect the tasks that require nursing judgement?"),
        h(2, "The rule that answers most items"),
        callout("memory",
                "The RN keeps ASSESSMENT, TEACHING, EVALUATION, JUDGEMENT and anything "
                "involving an UNSTABLE client. Everything delegated must be routine, "
                "predictable, and on a stable client."),
        labs("Scope at a glance",
             ["Role", "Can do", "Never"],
             [["RN", "Assessment, care planning, teaching, evaluation, IV push, blood, "
               "unstable clients", "—"],
              ["LPN / LVN", "Stable clients, routine meds, wound care, tracheostomy care, "
               "reinforce teaching", "Initial assessment, care plan, IV push, blood, "
               "unstable clients"],
              ["UAP / NA", "ADLs, vitals on stable clients, positioning, feeding, "
               "ambulating, intake/output", "Anything requiring judgement, any teaching, "
               "any assessment, any medication"]]),
        h(2, "The five rights of delegation"),
        ol("Right task — routine, standardised, low-risk",
           "Right circumstance — the client is stable and the outcome predictable",
           "Right person — within that person's scope and demonstrated competence",
           "Right direction — clear, specific instruction, including what to report back",
           "Right supervision — you follow up; delegation never transfers accountability"),
        callout("critical",
                "Accountability does not delegate. If a UAP takes a blood pressure and "
                "does not report it, the RN who delegated is answerable."),
        h(2, "The traps"),
        h(3, "\"Reinforce\" versus \"teach\""),
        p("An LPN may ", b("reinforce"), " teaching the RN has already given. An LPN may "
          "not perform the ", b("initial"), " teaching. Watch for that single word — it "
          "flips the answer."),
        h(3, "Stable is doing the work in the stem"),
        p("A UAP can take vitals — on a stable client. On a client who is 2 hours "
          "post-op, or newly on a titrated drip, those vitals are assessment data and "
          "belong to the nurse."),
        h(2, "Worked example"),
        p(b("Which task is appropriate for the RN to delegate to the UAP?")),
        ul("Measuring vital signs on a client admitted 30 minutes ago with chest pain",
           "Assisting a stable client 3 days post-op to ambulate in the corridor",
           "Teaching a newly diagnosed diabetic to self-inject insulin",
           "Assessing a wound that the client reports is now draining"),
        p("Ambulating the stable post-op client. The chest-pain admission is unstable, "
          "teaching is never delegated, and assessment stays with the nurse."),
    ),
    new=True,
)

# ============================================================ WEEK 3 — safety

note(
    "55000000-0000-4000-8000-000000000003",
    "Standard, contact, droplet, airborne",
    "Isolation precautions, and the conditions that trigger each",
    ["Safety and Infection Control"],
    ["infection-control", "precautions", "high-yield"],
    doc(
        p("Precaution questions are free marks if you know which bucket a condition sits "
          "in, and lost marks if you guess from the disease name."),
        labs("The four levels",
             ["Level", "PPE", "Room", "Classic conditions"],
             [["Standard", "Gloves; add gown/mask if splash likely", "Any",
               "Every client, every time — blood and body fluids"],
              ["Contact", "Gloves + gown", "Private or cohort",
               "C. difficile, MRSA, VRE, RSV, scabies, impetigo"],
              ["Droplet", "Surgical mask within 1–2 metres", "Private or cohort",
               "Influenza, pertussis, mumps, rubella, meningococcal meningitis, "
               "group A strep"],
              ["Airborne", "N95 respirator (fit-tested)",
               "Negative pressure, door closed",
               "Tuberculosis, measles, varicella, disseminated zoster"]]),
        callout("memory",
                "Airborne is My Chicken Has TB — Measles, Chickenpox (varicella), "
                "Herpes zoster disseminated, TB."),
        h(2, "The traps"),
        h(3, "Alcohol gel does not kill C. difficile"),
        p("Spore-forming organisms need ", b("soap and water"), " with friction. If the "
          "stem says C. diff and an option says alcohol-based rub, that option is wrong."),
        h(3, "Varicella and disseminated zoster need airborne AND contact"),
        p("The lesions are infectious by contact and the virus is airborne. Localised "
          "zoster in an immunocompetent client covered by a dressing needs contact only."),
        h(3, "Neutropenic clients are protected, not isolated"),
        p("Protective precautions run the other way — the client is at risk from us. No "
          "fresh flowers, no raw fruit and vegetables, no visitors with any infection, "
          "and a private room with positive-pressure airflow where available."),
        callout("warning",
                "The order of removal matters and is tested: gloves, goggles, gown, mask "
                "— the most contaminated item first, and the mask last because you remove "
                "it outside the room."),
        h(2, "Room assignment questions"),
        p("When asked to place a new admission, look for the client who can safely share. "
          "Two clients with the ", b("same"), " organism may cohort. Never place an "
          "immunosuppressed client with anyone infectious, and never place a client with "
          "an airborne condition in a shared room at all."),
    ),
    new=True,
)

# ============================================================ WEEK 4 — pharmacology

note(
    "55000000-0000-4000-8000-000000000004",
    "Dosage calculation: the three formulas",
    "Everything the exam asks, using three patterns",
    ["Pharmacological and Parenteral Therapies"],
    ["calculation", "dosage", "high-yield"],
    doc(
        p("Calculation items are the only questions on the exam where you either get it "
          "right or you do not — no reasoning to argue about. They are also the easiest "
          "marks available, because there are only three patterns."),
        h(2, "1. Tablets and liquids"),
        callout("memory", "Desired over Have, times Quantity.  (D ÷ H) × Q"),
        p("Ordered 0.25 mg. Available 125 microgram tablets. Convert first — 0.25 mg = "
          "250 micrograms. (250 ÷ 125) × 1 tablet = ", b("2 tablets"), "."),
        h(2, "2. IV flow rate in mL/hour"),
        p("Total volume ÷ total hours. 1000 mL over 8 hours = ", b("125 mL/hour"), "."),
        h(2, "3. IV drip rate in drops/minute"),
        callout("memory", "(Volume × drop factor) ÷ time in minutes"),
        p("1000 mL over 8 hours with a 15 gtt/mL set: (1000 × 15) ÷ 480 = ",
          b("31 gtt/min"), " (round to whole drops — you cannot give a third of a drop)."),
        h(2, "Weight-based doses"),
        p("Convert pounds to kilograms first — divide by 2.2. Then multiply by the dose "
          "per kilogram, then compare with the safe range if one is given."),
        p("A child weighs 44 lb. Order is 15 mg/kg/day in 3 divided doses. 44 ÷ 2.2 = "
          "20 kg. 20 × 15 = 300 mg/day. 300 ÷ 3 = ", b("100 mg per dose"), "."),
        callout("critical",
                "If the calculated dose falls outside the safe range, the answer is to "
                "HOLD the drug and contact the prescriber — never to give the nearest "
                "safe amount on your own."),
        h(2, "The four habits that lose marks"),
        ul("Not converting units before calculating — mg and microgram, kg and lb, mL and L",
           "Rounding partway through instead of at the end",
           "Ignoring the answer format the question asks for — whole number, one decimal, "
           "nearest whole drop",
           "Typing the unit into the box when only the number is wanted"),
        callout("tip",
                "Write the units next to every number as you work. Nearly every wrong "
                "answer in this topic is a unit that was never converted."),
    ),
    new=True,
)

note(
    "67f1c58f-a69d-4b4b-9304-393129a820c4",
    "Heparin vs Warfarin",
    "Two anticoagulants, two labs, two antidotes",
    ["Pharmacological and Parenteral Therapies", "Reduction of Risk Potential"],
    ["anticoagulant", "lab", "high-yield"],
    doc(
        p("The exam pairs these two constantly, because confusing their monitoring test "
          "or their antidote is a genuine patient-safety error."),
        labs("Side by side",
             ["", "Heparin", "Warfarin"],
             [["Route", "IV or subcutaneous", "Oral"],
              ["Onset", "Immediate (IV)", "3–5 days"],
              ["Monitor", "aPTT", "PT / INR"],
              ["Therapeutic range", "aPTT 1.5–2.5 × control", "INR 2–3 (2.5–3.5 for "
               "mechanical valves)"],
              ["Antidote", "Protamine sulfate", "Vitamin K (phytonadione)"],
              ["Crosses placenta", "No — anticoagulant of choice in pregnancy", "Yes — "
               "teratogenic"]]),
        callout("memory",
                "Heparin has a PTT. Warfarin has a PT. The letters line up: hepa-P-T-T, "
                "warfarin-P-T."),
        h(2, "Why they overlap in practice"),
        p("Warfarin takes days to reach therapeutic effect, so a client is commonly "
          "started on both, with heparin stopped once the INR is therapeutic. A question "
          "showing both prescribed at once is not an error to report."),
        h(2, "The must-knows"),
        drug("Heparin", "Anticoagulant — antithrombin activator", [
            ("Monitor", "aPTT, platelet count, signs of bleeding"),
            ("Critical adverse effect", "Heparin-induced thrombocytopenia (HIT) — a fall "
             "in platelets of 50% or more; stop the heparin immediately"),
            ("Antidote", "Protamine sulfate"),
            ("Nursing", "Never massage the subcutaneous site; rotate sites; do not "
             "aspirate"),
        ]),
        drug("Warfarin", "Anticoagulant — vitamin K antagonist", [
            ("Monitor", "PT / INR"),
            ("Teaching", "Keep vitamin K intake CONSISTENT — not zero. Sudden increases "
             "in green leafy vegetables lower the INR"),
            ("Antidote", "Vitamin K; fresh frozen plasma if bleeding is active"),
            ("Interactions", "Antibiotics, amiodarone, NSAIDs and alcohol all raise "
             "bleeding risk"),
        ]),
        callout("critical",
                "An INR above 5 with any bleeding is an emergency. Hold the dose and "
                "contact the prescriber — do not simply document and reassess."),
    ),
)

note(
    "e6e59935-4747-4669-9e8f-82bbaea90845",
    "Beta blockers — class overview",
    "The -olol drugs: what they do, and who must not have them",
    ["Pharmacological and Parenteral Therapies"],
    ["beta-blocker", "hypertension", "cardiac"],
    doc(
        p("Every drug ending in ", b("-olol"), " is a beta blocker. They slow the heart, "
          "reduce contractility and lower blood pressure — which is exactly why they are "
          "dangerous in the wrong client."),
        drug("Metoprolol / atenolol / propranolol / carvedilol", "Beta-adrenergic blocker", [
            ("Indications", "Hypertension, angina, post-MI, heart failure (carvedilol, "
             "metoprolol succinate), atrial fibrillation rate control, migraine "
             "prophylaxis"),
            ("Key effects", "↓ heart rate, ↓ blood pressure, ↓ myocardial oxygen demand"),
            ("Side effects", "Bradycardia, hypotension, fatigue, dizziness, impotence, "
             "masked hypoglycaemia"),
            ("Nursing considerations", "Hold and reassess if apical pulse is below 60 or "
             "systolic BP below 90 — take the APICAL pulse for a full minute"),
        ]),
        h(2, "The three exam traps"),
        h(3, "1. Masked hypoglycaemia in diabetes"),
        callout("critical",
                "Beta blockers blunt tachycardia, tremor and palpitations — the early "
                "warning signs of a hypo. A diabetic client on a beta blocker may go "
                "straight to confusion. Teach them to check glucose rather than wait to "
                "feel it. Sweating is preserved."),
        h(3, "2. Non-selective agents and the airway"),
        p("Propranolol blocks beta-2 as well as beta-1, causing bronchoconstriction. In "
          "asthma or COPD a non-selective beta blocker is contraindicated; a "
          "cardioselective one (metoprolol, atenolol) is used with caution."),
        h(3, "3. Never stop abruptly"),
        p("Abrupt withdrawal causes rebound tachycardia, hypertension, and can precipitate "
          "angina or infarction. This is a teaching-point answer on almost every beta "
          "blocker question."),
        callout("tip",
                "Teach the client to rise slowly — orthostatic hypotension is the most "
                "common reason these clients fall."),
    ),
)

note(
    "65dafcf5-b54d-4cab-927d-2e8f7d929590",
    "Furosemide (Lasix)",
    "The loop diuretic, and the potassium problem",
    ["Pharmacological and Parenteral Therapies", "Physiological Adaptation"],
    ["diuretic", "fluid", "high-yield"],
    doc(
        drug("Furosemide (Lasix)", "Loop diuretic", [
            ("Indications", "Heart failure, pulmonary oedema, oedema of renal or hepatic "
             "origin, hypertension, hypercalcaemia"),
            ("Action", "Blocks reabsorption in the ascending loop of Henle — powerful, "
             "rapid, and wastes potassium"),
            ("Side effects", "Hypokalaemia, hyponatraemia, hypotension, dehydration, "
             "ototoxicity, hyperglycaemia, hyperuricaemia"),
            ("Nursing considerations", "Daily weight is the most reliable measure of fluid "
             "loss; monitor potassium; give in the morning; push IV slowly"),
        ]),
        callout("critical",
                "Hypokalaemia plus digoxin equals digoxin toxicity. If a client is on both "
                "furosemide and digoxin, potassium is the answer to most questions about "
                "them."),
        h(2, "What to monitor, in order of exam frequency"),
        labs("Monitoring priorities",
             ["Parameter", "Watch for", "Action"],
             [["Serum potassium", "Below 3.5 mEq/L", "Hold, report, expect supplementation"],
              ["Daily weight", "1 kg = roughly 1 litre of fluid", "Same scale, same time, "
               "same clothing"],
              ["Blood pressure", "Orthostatic drop", "Rise slowly; hold if systolic below "
               "90 per protocol"],
              ["Hearing", "Tinnitus, hearing loss", "Ototoxicity — worse with rapid IV "
               "push and with aminoglycosides"]]),
        h(2, "Teaching points"),
        ul("Take it in the morning, so the diuresis does not interrupt sleep",
           "Eat potassium-rich foods — bananas, oranges, potatoes, spinach, avocado",
           "Report muscle weakness, cramps or an irregular heartbeat",
           "Change position slowly",
           "Weigh daily and report a gain of more than 1 kg in a day, or 2 kg in a week"),
        callout("warning",
                "Furosemide is a sulfonamide derivative. A documented sulfa allergy is "
                "worth reporting before the first dose."),
    ),
)

note(
    "110db939-3d55-4a1c-9252-d3af952a975b",
    "Insulin types and timing",
    "Onset, peak, duration — and when a hypo will actually happen",
    ["Pharmacological and Parenteral Therapies"],
    ["insulin", "diabetes", "high-yield"],
    doc(
        p("The exam rarely asks what an insulin is. It asks ", b("when"), " the client is "
          "most likely to become hypoglycaemic — which is the peak."),
        labs("Insulin at a glance",
             ["Type", "Example", "Onset", "Peak", "Duration"],
             [["Rapid-acting", "Lispro, aspart, glulisine", "10–30 min", "30 min – 3 h",
               "3–5 h"],
              ["Short-acting", "Regular", "30–60 min", "2–4 h", "5–8 h"],
              ["Intermediate", "NPH", "1–2 h", "4–12 h", "12–18 h"],
              ["Long-acting", "Glargine, detemir", "1–2 h", "No pronounced peak", "24 h"]]),
        callout("critical",
                "Rapid-acting insulin must be given with food ON THE TRAY, not merely "
                "ordered. Giving lispro and then finding the client is NPO for a procedure "
                "is a genuine harm event and a favourite exam scenario."),
        h(2, "The rules that get tested"),
        h(3, "Mixing"),
        p("Draw ", b("clear before cloudy"), " — regular insulin before NPH. Inject air "
          "into the NPH vial first, then air into the regular, then draw the regular. "
          "Contaminating the regular vial with NPH changes its action."),
        callout("memory", "Clear before cloudy. RN — Regular before NPH."),
        h(3, "What can be given IV"),
        p("Only ", b("regular"), " insulin is given intravenously. Any question showing an "
          "insulin drip is showing regular insulin."),
        h(3, "What cannot be mixed"),
        p("Glargine and detemir are never mixed with anything, and never diluted."),
        h(2, "Hypoglycaemia"),
        p("Below 70 mg/dL. Conscious and able to swallow: 15 grams of fast carbohydrate, "
          "recheck in 15 minutes, repeat if still low, then a protein-containing snack. "
          "Unconscious: IV dextrose 50%, or glucagon IM if no access."),
        callout("memory", "The rule of 15 — 15 grams, wait 15 minutes, recheck."),
        h(2, "Sick-day rules"),
        ul("Never stop insulin because the client is not eating — illness raises glucose",
           "Check glucose every 3–4 hours",
           "Check urine or blood ketones",
           "Drink fluids to prevent dehydration",
           "Contact the provider for vomiting lasting more than 4 hours"),
    ),
)

# ============================================================ WEEK 5 — labs / risk

note(
    "6cd93a48-19d2-4f6c-9b82-275a6898996b",
    "Quick reference: lab values",
    "The values worth memorising, and what each one changes",
    ["Reduction of Risk Potential", "Physiological Adaptation"],
    ["lab", "reference", "cheat-sheet"],
    doc(
        p("You will not be given a reference range. These are the values the exam expects "
          "you to recognise on sight — and, more importantly, to act on."),
        h(2, "Electrolytes"),
        labs("Electrolytes",
             ["Test", "Normal", "If high", "If low"],
             [["Sodium", "135–145 mEq/L", "Thirst, dry mucosa, restlessness, seizures",
               "Confusion, headache, seizures — correct SLOWLY"],
              ["Potassium", "3.5–5.0 mEq/L",
               "Peaked T waves, muscle weakness, cardiac arrest",
               "Flat T waves, U waves, weakness, digoxin toxicity"],
              ["Calcium", "9.0–10.5 mg/dL", "Bone pain, stones, lethargy, constipation",
               "Tetany, Chvostek and Trousseau signs, laryngospasm"],
              ["Magnesium", "1.3–2.1 mEq/L", "Loss of deep tendon reflexes, respiratory "
               "depression", "Tremor, tetany, torsades de pointes"]]),
        callout("critical",
                "Potassium is never given IV push. Ever. It is always diluted and infused "
                "on a pump — IV push potassium is fatal."),
        h(2, "Haematology and coagulation"),
        labs("Blood",
             ["Test", "Normal", "Notes"],
             [["Haemoglobin", "12–18 g/dL", "Below 7 typically triggers transfusion"],
              ["Haematocrit", "37–52%", "Roughly three times the haemoglobin"],
              ["WBC", "5,000–10,000/mm³", "Below 1,000 neutrophils = neutropenic "
               "precautions"],
              ["Platelets", "150,000–400,000/mm³", "Below 50,000 = bleeding precautions; "
               "below 20,000 = spontaneous bleeding risk"],
              ["INR", "0.8–1.1 (2–3 on warfarin)", "Above 5 with bleeding is an emergency"]]),
        h(2, "Renal, glucose, cardiac"),
        labs("Other high-yield values",
             ["Test", "Normal", "Notes"],
             [["BUN", "10–20 mg/dL", "Rises with dehydration as well as renal failure"],
              ["Creatinine", "0.6–1.2 mg/dL", "The more specific kidney marker"],
              ["Fasting glucose", "70–110 mg/dL", "Below 70 is hypoglycaemia"],
              ["HbA1c", "Below 6% (target under 7% in diabetes)", "Three-month average"],
              ["Digoxin", "0.5–2.0 ng/mL", "Toxicity: nausea, visual halos, bradycardia"],
              ["Lithium", "0.6–1.2 mEq/L", "Above 1.5 is toxic — a narrow window"]]),
        callout("tip",
                "Learn the drug levels — digoxin and lithium — before you learn anything "
                "else on this page. They are narrow, they are tested, and the answer is "
                "always to hold the drug and report."),
    ),
)

note(
    "1c71d58f-ca5c-48de-877b-e04d4ec9b763",
    "ABG interpretation",
    "A method that works in under a minute",
    ["Reduction of Risk Potential", "Physiological Adaptation"],
    ["abg", "high-yield"],
    doc(
        labs("Normal values",
             ["Value", "Normal range"],
             [["pH", "7.35–7.45"],
              ["PaCO₂", "35–45 mmHg"],
              ["HCO₃⁻", "22–26 mEq/L"],
              ["PaO₂", "80–100 mmHg"]]),
        h(2, "The method"),
        ol(["Look at the pH.", " Below 7.35 acidosis, above 7.45 alkalosis."],
           ["Look at the CO₂.", " If it moves in the OPPOSITE direction to the pH, the "
            "problem is respiratory."],
           ["Look at the bicarbonate.", " If it moves in the SAME direction as the pH, the "
            "problem is metabolic."],
           ["Check compensation.", " If the other value has also shifted, the body is "
            "compensating. pH back in range = fully compensated."]),
        callout("memory",
                "ROME — Respiratory Opposite, Metabolic Equal. CO₂ opposite to pH is "
                "respiratory; bicarbonate equal in direction to pH is metabolic."),
        h(2, "Worked examples"),
        labs("Read these four",
             ["pH", "CO₂", "HCO₃", "Interpretation"],
             [["7.28", "52", "24", "Respiratory acidosis, uncompensated"],
              ["7.50", "30", "23", "Respiratory alkalosis, uncompensated"],
              ["7.30", "38", "17", "Metabolic acidosis, uncompensated"],
              ["7.36", "50", "29", "Respiratory acidosis, fully compensated"]]),
        h(2, "What causes what"),
        labs("Causes",
             ["Disorder", "Common causes"],
             [["Respiratory acidosis", "Hypoventilation — COPD, oversedation, opioid "
               "overdose, chest trauma, atelectasis"],
              ["Respiratory alkalosis", "Hyperventilation — anxiety, pain, fever, "
               "high altitude, early sepsis"],
              ["Metabolic acidosis", "Diabetic ketoacidosis, renal failure, severe "
               "diarrhoea, shock, salicylate overdose"],
              ["Metabolic alkalosis", "Vomiting, gastric suction, excess antacids, "
               "diuretics"]]),
        callout("warning",
                "Prolonged vomiting or continuous nasogastric suction loses hydrogen ions "
                "and chloride — metabolic alkalosis. Severe diarrhoea loses bicarbonate — "
                "metabolic acidosis. The exam tests this pair directly."),
    ),
)

# ============================================================ WEEK 6 — physiological adaptation

note(
    "f5549c74-ac42-4e50-87b8-f520222a6f2e",
    "Common cardiac rhythms",
    "The six strips the exam expects you to name and act on",
    ["Physiological Adaptation", "Reduction of Risk Potential"],
    ["cardiac", "rhythm", "high-yield"],
    doc(
        p("You are not being asked to be a cardiologist. You are being asked: is this "
          "rhythm perfusing, and what do I do first?"),
        labs("The six",
             ["Rhythm", "Recognise by", "First action"],
             [["Normal sinus", "Rate 60–100, P before every QRS, regular", "None"],
              ["Sinus bradycardia", "Rate below 60, otherwise normal",
               "Assess symptoms; atropine if symptomatic"],
              ["Sinus tachycardia", "Rate above 100, otherwise normal",
               "Treat the CAUSE — fever, pain, hypovolaemia, anxiety"],
              ["Atrial fibrillation", "Irregularly irregular, no discernible P waves",
               "Rate control and anticoagulation — stroke risk"],
              ["Ventricular tachycardia", "Wide, bizarre QRS, rapid",
               "Check a PULSE. Pulse: antiarrhythmic. No pulse: defibrillate"],
              ["Ventricular fibrillation", "Chaotic, no identifiable complexes",
               "CPR and DEFIBRILLATE immediately"]]),
        callout("critical",
                "The one decision that matters in ventricular tachycardia is whether there "
                "is a pulse. Pulseless VT is defibrillated exactly like VF. A question "
                "that gives you VT and does not mention a pulse is asking you to check "
                "for one."),
        h(2, "Asystole is not shocked"),
        p("A flat line is not a shockable rhythm. CPR and epinephrine. Confirm asystole in "
          "more than one lead — a disconnected lead looks identical."),
        h(2, "The order in a witnessed arrest"),
        ol("Check responsiveness and call for help",
           "Start compressions — C before A and B",
           "Attach the defibrillator or AED",
           "Shock if the rhythm is VF or pulseless VT",
           "Resume compressions immediately after the shock"),
        callout("tip",
                "Every rhythm question is really \"is the client perfusing?\" Pulse, blood "
                "pressure, level of consciousness. A rhythm on a monitor with no client "
                "assessment is the wrong answer waiting to happen."),
    ),
)

note(
    "781b24a9-552c-4440-ae1e-7086d6a06fc7",
    "Normal Sinus Rhythm (NSR)",
    "The baseline every other strip is measured against",
    ["Physiological Adaptation"],
    ["nsr", "cardiac"],
    doc(
        p("You cannot recognise an abnormal rhythm until normal is automatic."),
        labs("The five criteria",
             ["Feature", "Normal sinus rhythm"],
             [["Rate", "60–100 beats per minute"],
              ["Rhythm", "Regular — R-R intervals equal"],
              ["P wave", "One upright P before every QRS, all the same shape"],
              ["PR interval", "0.12–0.20 seconds (3–5 small squares)"],
              ["QRS", "Under 0.12 seconds (under 3 small squares)"]]),
        callout("memory",
                "Every P has a QRS, every QRS has a P, and the spacing never changes. "
                "Break any one of those and you have a named arrhythmia."),
        h(2, "What each variation is called"),
        ul("Same criteria, rate under 60 — sinus bradycardia",
           "Same criteria, rate over 100 — sinus tachycardia",
           "Rate varies with breathing, otherwise normal — sinus arrhythmia, normal in "
           "children and young adults",
           "PR interval over 0.20 seconds, constant — first-degree AV block"),
        callout("tip",
                "Count rate fast: number of QRS complexes in a 6-second strip × 10."),
    ),
)

note(
    "745be3c4-1000-4a4e-bc61-932b8303628b",
    "Atrial Fibrillation (AF)",
    "Irregularly irregular — and why the real danger is stroke",
    ["Physiological Adaptation", "Reduction of Risk Potential"],
    ["cardiac", "af", "high-yield"],
    doc(
        p("Atrial fibrillation is disorganised atrial activity. The atria quiver instead "
          "of contracting, so blood pools — and pooled blood clots."),
        h(2, "Recognise it"),
        ul("Irregularly irregular rhythm — no pattern at all to the R-R intervals",
           "No identifiable P waves; a wavy, chaotic baseline",
           "QRS usually normal in width",
           "Apical rate often faster than the radial — a pulse deficit"),
        callout("critical",
                "The client loses the atrial kick — up to 30% of cardiac output. That is "
                "why a client in new AF can drop their blood pressure suddenly."),
        h(2, "The three treatment goals"),
        ol(["Rate control", " — beta blockers, diltiazem, digoxin"],
           ["Rhythm control", " — amiodarone, or cardioversion"],
           ["Anticoagulation", " — warfarin or a direct oral anticoagulant; this is the "
            "one that prevents the stroke"]),
        callout("warning",
                "Elective cardioversion of AF lasting more than 48 hours requires "
                "anticoagulation FIRST, or 3 weeks of it, because converting to sinus "
                "rhythm can launch an existing clot. This is a heavily tested point."),
        h(2, "What to teach"),
        ul("Take the pulse daily and report a rate over 100 or under 60",
           "Report sudden weakness on one side, facial droop or slurred speech immediately "
           "— these are stroke symptoms",
           "Keep INR appointments if on warfarin",
           "Limit caffeine and alcohol — both trigger episodes"),
    ),
)

note(
    "ed1308d0-0ffe-4ca5-ae4b-54c312e77a39",
    "Asthma vs COPD",
    "Two obstructive diseases the exam deliberately confuses",
    ["Physiological Adaptation"],
    ["respiratory", "chronic"],
    doc(
        labs("The distinction",
             ["", "Asthma", "COPD"],
             [["Nature", "Reversible bronchospasm", "Largely irreversible airflow "
               "limitation"],
              ["Typical age", "Often childhood onset", "Usually over 40, smoking history"],
              ["Pattern", "Episodic — well between attacks", "Progressive, daily"],
              ["Classic sign", "Expiratory wheeze, chest tightness",
               "Barrel chest, pursed-lip breathing, clubbing"],
              ["Oxygen target", "Normal saturation", "88–92% — deliberately lower"]]),
        callout("critical",
                "High-flow oxygen in COPD can suppress the hypoxic drive and cause "
                "respiratory depression. Titrate to 88–92%. This does NOT mean withholding "
                "oxygen from a hypoxic client — it means not over-oxygenating."),
        h(2, "The asthma trap"),
        callout("warning",
                "A SILENT CHEST in asthma is not improvement — it is a chest too tight to "
                "move air. It is an emergency. A wheeze that disappears while the client "
                "looks worse means deterioration."),
        h(2, "Inhaler order"),
        p("Bronchodilator first, then the steroid, waiting 1–5 minutes between them. The "
          "bronchodilator opens the airway so the steroid reaches further in."),
        ul("Rinse the mouth after any inhaled corticosteroid — prevents oral candidiasis",
           "Salbutamol/albuterol is the RESCUE inhaler — carried at all times",
           "Increasing rescue-inhaler use is a sign of worsening control, and a reason to "
           "review, not to keep going"),
        h(2, "Positioning"),
        p("High Fowler's or tripod — sitting up, leaning forward, arms braced. Pursed-lip "
          "breathing prolongs expiration and keeps small airways open in COPD."),
    ),
)

note(
    "0de5f48a-25ba-462d-8f8a-cad8f8534a89",
    "Hypoglycemia vs hyperglycemia",
    "Fast and cold, or slow and hot",
    ["Physiological Adaptation", "Pharmacological and Parenteral Therapies"],
    ["diabetes", "emergency", "high-yield"],
    doc(
        labs("Telling them apart",
             ["", "Hypoglycaemia", "Hyperglycaemia"],
             [["Onset", "Sudden — minutes", "Gradual — hours to days"],
              ["Skin", "Cold, clammy, sweating", "Warm, dry, flushed"],
              ["Mental state", "Shaky, irritable, confused, may look drunk",
               "Lethargic, drowsy, progressing to coma"],
              ["Breathing", "Normal", "Kussmaul — deep and rapid (in DKA)"],
              ["Other", "Hunger, tremor, tachycardia, headache",
               "Thirst, polyuria, fruity breath, dehydration"],
              ["Glucose", "Below 70 mg/dL", "Above 250 mg/dL (DKA), often far higher in "
               "HHS"]]),
        callout("memory",
                "Cold and clammy, need some candy. Hot and dry, sugar high."),
        h(2, "Treating hypoglycaemia"),
        p("Conscious and able to swallow: 15 grams of fast carbohydrate — 120 mL fruit "
          "juice, 3 glucose tablets, 1 tablespoon of honey. Wait 15 minutes, recheck, "
          "repeat if still below 70. Then give a snack with protein."),
        p("Unconscious or unable to swallow: nothing by mouth. IV dextrose 50%, or "
          "glucagon IM if there is no IV access."),
        callout("critical",
                "Never put food or fluid in the mouth of a client who is not fully awake. "
                "Aspiration turns a treatable hypo into pneumonia."),
        h(2, "DKA versus HHS"),
        labs("The two hyperglycaemic emergencies",
             ["", "DKA", "HHS"],
             [["Usually", "Type 1", "Type 2"],
              ["Glucose", "Above 250 mg/dL", "Often above 600 mg/dL"],
              ["Ketones", "Present", "Absent or minimal"],
              ["pH", "Acidotic, below 7.35", "Normal"],
              ["Hallmark", "Kussmaul breathing, fruity breath",
               "Profound dehydration, neurological changes"]]),
        p("Both are treated with fluids first, then insulin, then potassium replacement — "
          "because insulin drives potassium into cells and can cause a dangerous fall."),
    ),
)

note(
    "c9563362-f831-4a17-ae67-68313010ad35",
    "Thyroid disorders snapshot",
    "Everything speeds up, or everything slows down",
    ["Physiological Adaptation"],
    ["thyroid", "endocrine"],
    doc(
        p("Thyroid questions are easy marks once you accept the single organising idea: "
          "the thyroid sets the body's metabolic speed."),
        labs("Hyper versus hypo",
             ["", "Hyperthyroidism (Graves)", "Hypothyroidism (Hashimoto)"],
             [["Weight", "Loss despite eating more", "Gain despite eating less"],
              ["Temperature", "Heat intolerance, sweating", "Cold intolerance"],
              ["Heart", "Tachycardia, palpitations, AF", "Bradycardia"],
              ["Bowel", "Diarrhoea", "Constipation"],
              ["Mood", "Anxious, restless, insomnia", "Depressed, lethargic, slow speech"],
              ["Distinctive", "Exophthalmos, goitre", "Dry skin, coarse hair, "
               "puffy face"]]),
        h(2, "The two crises"),
        callout("critical",
                "THYROID STORM — fever above 38.5°C, tachycardia, agitation, delirium. "
                "Often triggered by infection or by surgery on an unprepared client. "
                "Cooling, beta blockers, antithyroid drugs. Life-threatening."),
        callout("critical",
                "MYXOEDEMA COMA — hypothermia, hypotension, hypoventilation, unresponsive. "
                "Warm the client passively, support the airway, IV thyroid hormone."),
        h(2, "Levothyroxine teaching"),
        ul("Take in the MORNING on an empty stomach, 30–60 minutes before food",
           "It is lifelong — do not stop when feeling well",
           "Report chest pain, palpitations or a resting pulse above 100 — the dose may be "
           "too high",
           "Separate from calcium and iron by 4 hours — they block absorption"),
        h(2, "After a thyroidectomy"),
        p("Keep a tracheostomy set at the bedside. Watch for airway obstruction from "
          "swelling, for haemorrhage (check BEHIND the neck — blood pools there), and for "
          "hypocalcaemic tetany if the parathyroids were disturbed — test for Chvostek and "
          "Trousseau signs."),
    ),
)

# ============================================================ WEEK 7 — maternal / paeds

note(
    "fe256643-9d75-4c17-b8f6-59ab4948666b",
    "Stages of labor",
    "What changes, and what the nurse does in each",
    ["Health Promotion and Maintenance"],
    ["labor", "ob", "high-yield"],
    doc(
        labs("The four stages",
             ["Stage", "Definition", "Nursing priority"],
             [["First — latent", "0–5 cm, contractions mild, 5–30 min apart",
               "Encourage walking, light food, orient to unit"],
              ["First — active", "6–10 cm, contractions 2–5 min apart, strong",
               "Monitor fetal heart rate, pain relief, position changes"],
              ["Second", "Full dilation to birth", "Coach pushing, monitor FHR with every "
               "contraction"],
              ["Third", "Birth of baby to delivery of placenta",
               "Watch for the gush of blood, cord lengthening, uterus rising"],
              ["Fourth", "First 1–4 hours after delivery",
               "Fundus, lochia, bladder, vital signs every 15 minutes"]]),
        h(2, "Fetal heart rate — the decelerations"),
        callout("memory",
                "VEAL CHOP. Variable→Cord compression. Early→Head compression. "
                "Accelerations→OK. Late→Placental insufficiency."),
        labs("What to do",
             ["Pattern", "Cause", "Action"],
             [["Early deceleration", "Head compression", "None — benign"],
              ["Variable deceleration", "Cord compression",
               "Reposition, then amnioinfusion if ordered"],
              ["Late deceleration", "Uteroplacental insufficiency",
               "Left side, oxygen, stop oxytocin, IV fluids, call provider"],
              ["Acceleration", "Fetal movement", "Reassuring"]]),
        callout("critical",
                "Late decelerations are the ominous one. Turn the client to the LEFT side "
                "first — it takes the uterus off the vena cava and restores placental "
                "perfusion immediately."),
        h(2, "Cord prolapse"),
        p("If the cord is visible or palpable: call for help, and with a gloved hand push "
          "the presenting part OFF the cord. Place the client in knee-chest or "
          "Trendelenburg. Do not push the cord back in. Do not leave the client."),
    ),
)

note(
    "2f7ca1e3-9262-48ee-b37d-aa42b00e641c",
    "Postpartum hemorrhage",
    "The leading cause of maternal death — and the first thing you do",
    ["Health Promotion and Maintenance", "Physiological Adaptation"],
    ["ob", "emergency", "high-yield"],
    doc(
        p("Defined as blood loss over 500 mL after a vaginal birth, or over 1000 mL after "
          "a caesarean. The most common cause, by a wide margin, is ", b("uterine atony"),
          " — a uterus that will not contract."),
        callout("critical",
                "FIRST ACTION for a boggy uterus is to MASSAGE THE FUNDUS. Not call the "
                "provider, not start an IV, not give a drug. Massage first — a contracted "
                "uterus clamps its own bleeding vessels."),
        h(2, "The four Ts"),
        labs("Causes",
             ["Cause", "Recognise by", "Management"],
             [["Tone — uterine atony", "Boggy, soft, high fundus",
               "Massage; oxytocin; empty the bladder"],
              ["Trauma", "Firm fundus but steady bright-red bleeding",
               "Inspect for laceration or haematoma"],
              ["Tissue", "Retained placental fragments", "Removal; ultrasound"],
              ["Thrombin", "Coagulopathy, oozing from sites", "Correct clotting factors"]]),
        callout("tip",
                "A FIRM fundus with continued bleeding is the discriminator — that is not "
                "atony, so stop massaging and start looking for a tear."),
        h(2, "Assessment"),
        ul("Fundus — firm or boggy, at/above/below the umbilicus, midline or deviated",
           "A fundus deviated to the right usually means a FULL BLADDER — have the client "
           "void, then reassess",
           "Lochia — count and weigh pads; 1 gram equals 1 mL",
           "Vital signs — tachycardia comes before hypotension in a young woman; do not "
           "wait for the blood pressure to fall"),
        h(2, "Drugs"),
        ul(["Oxytocin", " — first line"],
           ["Methylergonovine", " — contraindicated in HYPERTENSION"],
           ["Carboprost", " — contraindicated in ASTHMA"],
           ["Misoprostol", " — rectal or sublingual"]),
        callout("warning",
                "Those two contraindications are tested almost every time these drugs "
                "appear. Methylergonovine raises blood pressure; carboprost causes "
                "bronchospasm."),
    ),
)

note(
    "b995611a-d64d-4f9b-9990-bc833482317b",
    "Newborn APGAR scoring",
    "Five signs, scored twice",
    ["Health Promotion and Maintenance"],
    ["peds", "newborn", "assessment"],
    doc(
        p("Scored at ", b("1 minute"), " and ", b("5 minutes"), " after birth. Each of the "
          "five signs scores 0, 1 or 2, for a maximum of 10."),
        labs("The five signs",
             ["Sign", "0", "1", "2"],
             [["Appearance (colour)", "Blue or pale", "Body pink, extremities blue",
               "Completely pink"],
              ["Pulse", "Absent", "Below 100", "Above 100"],
              ["Grimace (reflex)", "No response", "Grimace", "Cry, cough, sneeze"],
              ["Activity (tone)", "Limp", "Some flexion", "Active motion"],
              ["Respiration", "Absent", "Slow, irregular, weak cry", "Good, strong cry"]]),
        callout("memory", "APGAR — Appearance, Pulse, Grimace, Activity, Respiration."),
        h(2, "Interpreting the score"),
        ul(["7–10", " — good condition, routine care"],
           ["4–6", " — moderately depressed, needs stimulation and oxygen"],
           ["0–3", " — severely depressed, resuscitate immediately"]),
        callout("warning",
                "Acrocyanosis — blue hands and feet with a pink body — is NORMAL in the "
                "first 24 hours and scores 1, not 0. Central cyanosis of the trunk or lips "
                "is never normal."),
        h(2, "What APGAR is not"),
        p("It does not predict long-term outcome and it is not used to decide whether to "
          "start resuscitation. Resuscitation begins on assessment, not on waiting for a "
          "score at one minute."),
    ),
)

note(
    "e004d0eb-ce1d-42d0-b906-b9f254dba04b",
    "Pediatric vital signs by age",
    "Normal ranges, and the sign that matters most in children",
    ["Health Promotion and Maintenance"],
    ["peds", "assessment"],
    doc(
        p("The younger the child, the faster the heart and the faster the breathing. "
          "Blood pressure rises with age."),
        labs("Normal ranges",
             ["Age", "Heart rate", "Respiratory rate", "Systolic BP"],
             [["Newborn", "100–160", "30–60", "60–90"],
              ["Infant (1–12 months)", "100–150", "25–40", "70–100"],
              ["Toddler (1–3 y)", "90–140", "20–30", "80–110"],
              ["Preschool (3–5 y)", "80–120", "20–25", "85–115"],
              ["School age (6–12 y)", "70–110", "18–25", "90–120"],
              ["Adolescent", "60–100", "12–20", "100–130"]]),
        callout("critical",
                "In a child, a falling blood pressure is a LATE sign of shock. Children "
                "compensate with tachycardia for a long time and then decompensate "
                "suddenly. Tachycardia plus poor perfusion is your warning — do not wait "
                "for hypotension."),
        h(2, "Other paediatric red flags"),
        ul("Bradycardia in a child is usually caused by HYPOXIA — open the airway and "
           "oxygenate before anything else",
           "Grunting, nasal flaring, retractions and head bobbing all indicate respiratory "
           "distress",
           "A quiet, floppy child who has stopped fighting you is deteriorating, not "
           "settling"),
        h(2, "Assessment order"),
        p("Least invasive first. Respirations and heart rate before touching, then "
          "temperature and blood pressure last. Count respirations for a full minute in "
          "infants — they are normally irregular."),
    ),
)

note(
    "791ae0df-93c2-4cd4-a101-8678529011e6",
    "Vaccination schedule essentials",
    "What is due when, and who must not have a live vaccine",
    ["Health Promotion and Maintenance", "Safety and Infection Control"],
    ["peds", "immunization"],
    doc(
        labs("Routine childhood schedule",
             ["Age", "Vaccines due"],
             [["Birth", "Hepatitis B (first dose)"],
              ["2 months", "DTaP, IPV, Hib, PCV, rotavirus, hepatitis B"],
              ["4 months", "DTaP, IPV, Hib, PCV, rotavirus"],
              ["6 months", "DTaP, Hib, PCV, rotavirus, hepatitis B, annual influenza"],
              ["12–15 months", "MMR, varicella, Hib, PCV, hepatitis A"],
              ["4–6 years", "DTaP, IPV, MMR, varicella"],
              ["11–12 years", "Tdap, HPV, meningococcal"]]),
        h(2, "Live vaccines — the ones with rules"),
        p("MMR, varicella, rotavirus, and the intranasal influenza vaccine are live."),
        callout("critical",
                "Live vaccines are contraindicated in pregnancy, in immunosuppression, and "
                "in clients on high-dose steroids or chemotherapy. This is the most "
                "commonly tested point in the topic."),
        h(2, "What is NOT a contraindication"),
        ul("A mild illness with or without a low-grade fever",
           "Current antibiotic therapy",
           "Prematurity — vaccinate by chronological age",
           "Breastfeeding",
           "A family history of adverse reactions"),
        callout("warning",
                "A true anaphylactic reaction to a previous dose or to a vaccine component "
                "IS a contraindication. Egg allergy is no longer a barrier to influenza "
                "vaccination in most guidance — soreness and low fever are expected "
                "effects, not allergy."),
        h(2, "Teaching parents"),
        ul("Expect soreness, redness and a low-grade fever for 24–48 hours",
           "Give paracetamol/acetaminophen for comfort — not aspirin, ever, in children",
           "Apply a cool compress to the injection site",
           "Return immediately for difficulty breathing, swelling of the face, or a "
           "high fever"),
    ),
)

# ============================================================ WEEK 8 — psychosocial + readiness

note(
    "a46651cf-a07c-4cd3-aaae-e2b2b46936c4",
    "Therapeutic communication techniques",
    "How to spot the right answer when every option sounds kind",
    ["Psychosocial Integrity"],
    ["communication", "mental-health", "high-yield"],
    doc(
        p("Communication questions are the ones candidates most often get wrong while "
          "feeling confident, because several options sound caring. The exam is not "
          "testing kindness. It is testing whether you keep the client talking."),
        h(2, "Techniques that are usually right"),
        labs("Use these",
             ["Technique", "Sounds like"],
             [["Open-ended question", "\"Tell me more about that.\""],
              ["Reflecting", "\"You sound frightened.\""],
              ["Restating", "\"You are saying the pain got worse overnight?\""],
              ["Silence", "Waiting, without filling the gap"],
              ["Offering self", "\"I will sit with you for a while.\""],
              ["Seeking clarification", "\"I am not sure I follow — can you explain?\""],
              ["Making an observation", "\"I notice you have not eaten today.\""]]),
        h(2, "Responses that are almost always wrong"),
        labs("Avoid these",
             ["Blocker", "Sounds like", "Why it is wrong"],
             [["False reassurance", "\"Don't worry, it will be fine.\"",
               "Closes the conversation and may be untrue"],
              ["Giving advice", "\"If I were you, I would…\"",
               "Removes the client's autonomy"],
              ["Asking why", "\"Why did you do that?\"", "Demands justification, feels "
               "like blame"],
              ["Changing the subject", "\"Let's talk about your discharge.\"",
               "Abandons the client's concern"],
              ["Defending", "\"The nurses here are very good.\"",
               "Sides with staff against the client"],
              ["Closed question", "\"Are you feeling sad?\"", "Invites yes or no and "
               "stops there"]]),
        callout("memory",
                "The right answer usually lets the client speak next. If the option ends "
                "the conversation, it is probably wrong."),
        h(2, "The tie-breaker"),
        p("When two options both look therapeutic, choose the one that stays with the "
          "client's ", b("feeling"), " rather than the facts. \"You seem angry about the "
          "delay\" beats \"The doctor was held up in theatre\", even though the second is "
          "true and helpful."),
        callout("warning",
                "Never agree to keep a secret, and never promise confidentiality you "
                "cannot deliver — particularly around self-harm."),
    ),
)

note(
    "e2c39634-3596-4c34-bcc9-1359a48bc863",
    "Suicide risk assessment",
    "Ask directly, then decide the level of observation",
    ["Psychosocial Integrity", "Safety and Infection Control"],
    ["mental-health", "safety", "high-yield"],
    doc(
        callout("critical",
                "Asking a client directly whether they are thinking of killing themselves "
                "does NOT plant the idea. It is the single most important assessment "
                "action, and on the exam it is almost always the correct first step."),
        h(2, "What raises risk"),
        ul(["A specific plan", " — the more detailed and the more available the means, "
            "the higher the risk"],
           ["A previous attempt", " — the strongest single predictor"],
           "Giving away possessions, putting affairs in order, saying goodbye",
           "Sudden calm after a period of severe depression — often means the decision "
           "is made",
           "Male sex, older age, living alone, recent loss, substance use, chronic pain"),
        callout("warning",
                "The most dangerous window is when a severely depressed client BEGINS to "
                "improve — energy returns before mood does, and they now have the capacity "
                "to act. Observation should increase, not relax."),
        h(2, "Assessment sequence"),
        ol("Ask about thoughts — \"Are you thinking of harming yourself?\"",
           "Ask about a plan — \"Have you thought about how?\"",
           "Ask about means — \"Do you have access to that?\"",
           "Ask about intent and timing",
           "Establish a level of observation and remove the means"),
        h(2, "Nursing actions"),
        ul("Place the client where they can be observed — near the nurses' station, "
           "not at the end of a corridor",
           "One-to-one continuous observation for active intent, including in the bathroom",
           "Remove belts, cords, shoelaces, glass, razors, and check belongings",
           "Do NOT leave the client alone, including to fetch help — call out instead",
           "Document the client's own words verbatim"),
        callout("tip",
                "A no-suicide contract is not a safety intervention and does not replace "
                "observation. If it appears as an option alongside direct assessment or "
                "removing means, it is the wrong answer."),
    ),
)

note(
    "55000000-0000-4000-8000-000000000005",
    "Your last two weeks",
    "A readiness plan for the fortnight before test day",
    ["Management of Care"],
    ["exam-strategy", "test-day", "high-yield"],
    doc(
        p("The last fortnight is not for learning new content. It is for consolidating "
          "what you have, fixing your timing, and removing every avoidable surprise on "
          "the day."),
        h(2, "Fourteen days out"),
        ul("Sit one full-length timed mock under real conditions — no phone, no pauses",
           "Review every wrong answer and write the REASON, not the fact",
           "Rank your weakest three categories and give them your mornings"),
        h(2, "Seven days out"),
        ul("Switch from new content to review of your own error log",
           "Do 75 questions a day, mixed, timed",
           "Confirm your test centre, your route and your travel time",
           "Move your sleep to match your exam start time"),
        h(2, "The day before"),
        callout("tip",
                "Stop studying by early afternoon. There is no evidence that late cramming "
                "helps, and strong evidence that lost sleep hurts. Pack, eat, rest."),
        h(2, "What to bring"),
        ul("Your Authorization to Test — the name on it must match your ID EXACTLY",
           "One acceptable, current, signed photo ID — passport for international "
           "candidates",
           "Nothing else. No phone, no watch, no notes — everything goes in a locker"),
        callout("critical",
                "A mismatch between the name on your ID and the name on your Authorization "
                "to Test will end your appointment at the door, and the fee is not "
                "refunded. Check it the week before, not on the morning."),
        h(2, "On the day"),
        ul("Arrive 30 minutes early — arriving late usually means forfeiting the "
           "appointment",
           "Expect fingerprinting, a photograph and a palm scan; expect to be scanned "
           "again after every break",
           "Take the optional breaks even if you feel fine — the clock keeps running, but "
           "your concentration will not",
           "Expect questions you have never seen. Some are unscored trial items. Answer "
           "and move on"),
        callout("memory",
                "You cannot skip and you cannot go back. Give every question your best "
                "reasoning once, then leave it behind — carrying question 12 into question "
                "40 costs you both."),
        h(2, "Afterwards"),
        p("Results timing varies by jurisdiction; some boards offer an unofficial result "
          "after 48 hours. Do not read anything into the number of questions you were "
          "given — see the note on how the exam decides."),
    ),
    new=True,
)


# ---------------------------------------------------------------- emit

def sql_str(s):
    return "'" + s.replace("'", "''") + "'" if s is not None else "NULL"

def sql_arr(items):
    if not items:
        return "'{}'"
    return "ARRAY[" + ", ".join(sql_str(i) for i in items) + "]::text[]"

def main():
    out = []
    out.append("-- db/seed/pitch/02-library-notes.sql")
    out.append("-- GENERATED by db/seed/pitch/build_notes.py — edit the generator, not this file.")
    out.append("--")
    out.append("-- Real bodies for the tutor library notes the pitch programme links to.")
    out.append("-- Existing notes shipped with placeholder bodies (\"Sample body content")
    out.append("-- for X. Real content lands once the rich block editor ships\") — this")
    out.append("-- replaces them, and adds the five notes the curriculum needed.")
    out.append("--")
    out.append(f"-- Tutor: {TUTOR_ID} (mybackpacc+mynclextutor@gmail.com)")
    out.append(f"-- Notes: {len(NOTES)} ({sum(1 for n in NOTES if n['new'])} new, "
               f"{sum(1 for n in NOTES if not n['new'])} rewritten)")
    out.append("")
    out.append("BEGIN;")
    out.append("")

    for n in NOTES:
        body = json.dumps(n["body"], ensure_ascii=False)
        body_lit = "$body$" + body + "$body$::jsonb"
        out.append(f"-- {n['title']}")
        if n["new"]:
            out.append(
                "INSERT INTO nclex_tutor_library_notes\n"
                "  (note_id, tutor_id, title, subtitle, body, tags, pillars,\n"
                "   is_published, visibility_mode)\n"
                f"VALUES (\n"
                f"  {sql_str(n['note_id'])}, {sql_str(TUTOR_ID)},\n"
                f"  {sql_str(n['title'])},\n"
                f"  {sql_str(n['subtitle'])},\n"
                f"  {body_lit},\n"
                f"  {sql_arr(n['tags'])},\n"
                f"  {sql_arr(n['pillars'])},\n"
                f"  TRUE, 'TUTOR_WIDE'\n"
                ")\n"
                "ON CONFLICT (note_id) DO UPDATE SET\n"
                "  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,\n"
                "  body = EXCLUDED.body, tags = EXCLUDED.tags,\n"
                "  pillars = EXCLUDED.pillars, is_published = TRUE,\n"
                "  version_id = gen_random_uuid(), updated_at = NOW();"
            )
        else:
            out.append(
                "UPDATE nclex_tutor_library_notes SET\n"
                f"  title = {sql_str(n['title'])},\n"
                f"  subtitle = {sql_str(n['subtitle'])},\n"
                f"  body = {body_lit},\n"
                f"  tags = {sql_arr(n['tags'])},\n"
                f"  pillars = {sql_arr(n['pillars'])},\n"
                "  is_published = TRUE,\n"
                "  version_id = gen_random_uuid(),\n"
                "  updated_at = NOW()\n"
                f"WHERE note_id = {sql_str(n['note_id'])}\n"
                f"  AND tutor_id = {sql_str(TUTOR_ID)};"
            )
        out.append("")

    out.append("COMMIT;")
    out.append("")

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "02-library-notes.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"wrote {path} — {len(NOTES)} notes")

if __name__ == "__main__":
    main()
