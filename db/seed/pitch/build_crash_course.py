#!/usr/bin/env python3
"""
Generates db/seed/pitch/03-crash-course.sql — the self-paced
"NCLEX Prioritization Crash Course": library notes, tutor questions,
quizzes, and the programme that ties them together.

Source: Mark Klimek's Lecture 12 (Prioritization, Delegation and Staff
Management), supplied by Sam, cross-checked against the NCSBN/NCLEX-RN
test-plan framing of Management of Care. The four rules, the
stable/unstable word list, the organ tie-breaker, the LPN/UAP boundaries
and the four staff-management responses are all his structure; the
worked scenarios and every quiz item are written fresh.

Why a generator: note bodies are Tiptap documents stored as JSONB with
custom block types, and the questions carry per-option feedback JSON.
Hand-writing that inside SQL literals is unreadable. Same approach as
build_notes.py, whose helpers this file mirrors.

Run:  python3 db/seed/pitch/build_crash_course.py
"""

import json
import os

TUTOR_ID = "4ed777d7-e4f7-403b-88f4-63ce5432d65e"
PROGRAMME_ID = "60000000-0000-4000-8000-000000000001"

# ---------------------------------------------------------------- helpers

def t(s, *marks):
    node = {"type": "text", "text": s}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node

def p(*inline):
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

def table(title, columns, rows):
    """The lab_values block is a generic titled reference grid."""
    return {"type": "lab_values", "attrs": {
        "title": title,
        "columns": [{"label": c} for c in columns],
        "rows": [list(r) for r in rows],
    }}

def doc(*blocks):
    return {"type": "doc", "content": list(blocks)}

def b(s):
    return t(s, "bold")

def hl(s):
    return t(s, "highlight")


# ================================================================ NOTES

NOTES = []

def note(note_id, title, subtitle, pillars, tags, body):
    NOTES.append({"note_id": note_id, "title": title, "subtitle": subtitle,
                  "pillars": pillars, "tags": tags, "body": body})


# ---------------------------------------------------------------- note 1

note(
    "65000000-0000-4000-8000-000000000001",
    "What a prioritization question is actually asking",
    "Read the question before you read the patients",
    ["Management of Care"],
    ["prioritization", "exam-strategy", "high-yield"],
    doc(
        p("Most marks lost on prioritization are not lost on the patients. "
          "They are lost in the first line of the question, because the "
          "candidate decided what was being asked before they read it."),

        h(2, "Sickest or healthiest?"),
        p("Every prioritization item wants one of two things: the patient "
          "who needs you most, or the patient who needs you least. The words "
          "change; the fork does not."),
        table(
            "Which end of the list is the answer?",
            ["The question says", "You are looking for"],
            [
                ["Who do you see first / assess first / attend to first",
                 "The HIGHEST priority patient"],
                ["Who is most at risk / whose condition is most urgent",
                 "The HIGHEST priority patient"],
                ["Who do you discharge to make room / who can wait",
                 "The LOWEST priority patient"],
                ["Which patient can be assigned to the LPN / the float nurse",
                 "The LOWEST priority — the most stable patient"],
                ["Who do you delegate to the UAP",
                 "The LOWEST priority — stable, predictable, no assessment"],
            ],
        ),
        callout("warning",
                "A disaster has struck and you are clearing beds. That question "
                "is asking for your ", b("healthiest"), " patient. Candidates who "
                "have drilled 'sickest first' answer it backwards at speed."),

        h(2, "The four parts of an answer choice"),
        p("Answer choices in this section are built the same way every time. "
          "Learn the parts and you can strip a choice down in about two seconds."),
        p(b("A 10-year-old male with hypospadias who is vomiting bile-stained emesis.")),
        ol(
            [b("Age"), " — 10-year-old"],
            [b("Gender"), " — male"],
            [b("Diagnosis"), " — hypospadias"],
            [b("Modifying phrase"), " — vomiting bile-stained emesis"],
        ),
        callout("memory",
                "Two of those four are noise. Age and gender do not decide "
                "priority in an adult medical-surgical question — they matter in "
                "paediatrics and obstetrics, and almost nowhere else."),

        h(2, "The modifying phrase outranks the diagnosis"),
        p("This is the single highest-yield sentence in this course. When a "
          "choice carries a modifying phrase, that phrase — not the diagnosis "
          "— decides the priority."),
        p("Two patients, no modifying phrases: one has angina pectoris, one "
          "has had a myocardial infarction. The MI is the priority, because "
          "with nothing else to go on you judge by the condition."),
        p("Now add the phrases:"),
        ul(
            ["A patient with ", b("angina"), " and an ", b("unstable blood pressure")],
            ["A patient with ", b("MI"), " and ", b("stable vital signs")],
        ),
        p("The angina patient is now the priority. The lesser diagnosis with "
          "the worse modifier beats the greater diagnosis that has settled."),
        callout("tip",
                "Cover the diagnosis with your finger and read only the "
                "modifying phrases. If one of them describes something changing, "
                "unexpected, or unstable, you have very likely found your answer."),

        h(2, "Where this sits against ABC and Maslow"),
        p("ABC and Maslow are frameworks for choosing between needs. The four "
          "rules in the next module are for choosing between patients. They "
          "are not competitors — a question usually needs both, in that order: "
          "find the patient, then decide what to do for them."),
        callout("note",
                "If two patients survive every rule in this course and you still "
                "cannot separate them, fall back to ABC — airway, then breathing, "
                "then circulation — and only then to Maslow."),
    ),
)

# ---------------------------------------------------------------- note 2

note(
    "65000000-0000-4000-8000-000000000002",
    "The four prioritization rules",
    "Acute, fresh post-op, unstable — and the tie-breaker",
    ["Management of Care"],
    ["prioritization", "high-yield", "framework"],
    doc(
        p("Four rules, applied in order. Most questions are settled by the "
          "first three; the fourth exists for the ones that are not."),

        h(2, "Rule 1 — acute beats chronic"),
        p("An acutely ill patient outranks a chronically ill one. Chronic "
          "disease is a condition the body has already adapted to; acute "
          "illness is the body failing to."),
        p("Given COPD, heart failure and appendicitis, the appendicitis is "
          "your patient. The other two are chronic — however unwell they "
          "sound, they are the state their body has been living in."),

        h(2, "Rule 2 — fresh post-op beats medical and other surgical"),
        p("Fresh means ", b("under 12 hours"), ". Within that window the "
          "patient is still coming out of anaesthesia, still at risk of "
          "haemorrhage, and still the least predictable person on the ward."),
        p("A patient two hours after a cholecystectomy outranks the COPD "
          "patient, the acute appendicitis, the radical neck dissection from "
          "yesterday, the bilateral above-knee amputation from yesterday, and "
          "the craniotomy from yesterday. The size of the other operation is "
          "not the point — the clock is."),
        callout("critical",
                "Twelve hours is the line. At 11 hours post-op the patient is "
                "fresh and unstable; at 13 they are a surgical patient like any "
                "other. Exam items are written around that boundary deliberately."),

        h(2, "Rule 3 — unstable beats stable"),
        p("The largest of the four, and the one with the most vocabulary "
          "attached to it. It has its own note — see ", b("Stable or unstable: "
          "the word list"), " — because recognising instability from a phrase "
          "is most of the work."),
        p("In short: anything acute, changing, unexpected, newly admitted, "
          "newly diagnosed or freshly operated on points to unstable. Anything "
          "chronic, unchanged, expected, or heading for discharge points to "
          "stable."),

        h(2, "Rule 4 — the tie-breaker: how vital is the organ?"),
        p("When the first three rules leave you with two patients who look "
          "equally sick, rank by the organ involved. The more vital the organ, "
          "the higher the priority."),
        table(
            "Organ priority, most vital first",
            ["Rank", "Organ"],
            [["1", "Brain"], ["2", "Lung"], ["3", "Heart"],
             ["4", "Liver"], ["5", "Kidney"], ["6", "Pancreas"]],
        ),
        callout("warning",
                "Rank the organ named in the ", b("modifying phrase"),
                ", not the organ in the diagnosis. This is where the rule is "
                "most often applied backwards."),

        h(2, "Worked example"),
        p("Three patients. Apply rules 1 to 3 first, then the tie-breaker."),
        ul(
            ["A 23-year-old with ", b("heart failure"), " (chronic — low), "
             "potassium 6.6 (high), no ECG changes (unchanged — low). "
             "Organ in the modifier: ", b("heart"), "."],
            ["Chronic renal failure (chronic — low), creatinine 24.7 "
             "(expected for the diagnosis — low), ", b("pink frothy sputum"),
             " (unexpected — high). Organ in the modifier: ", b("lung"), "."],
            ["Acute hepatitis (acute — high), jaundice and raised ammonia "
             "(both expected — low), ", b("cannot be roused"),
             " (unexpected — high). Organ in the modifier: ", b("brain"), "."],
        ),
        p("All three have something unexpected, so rule 3 does not separate "
          "them. The tie-breaker does: brain outranks lung outranks heart. "
          "The hepatitis patient who cannot be roused is your answer."),
        callout("memory",
                "Brain, Lung, Heart, Liver, Kidney, Pancreas. The order is the "
                "answer to more tie-breaks than any other single fact in this course."),
    ),
)

# ---------------------------------------------------------------- note 3

note(
    "65000000-0000-4000-8000-000000000003",
    "Stable or unstable: the word list",
    "The vocabulary that decides rule 3",
    ["Management of Care"],
    ["prioritization", "stability", "high-yield"],
    doc(
        p("Rule 3 says unstable beats stable. The exam almost never uses "
          "either word — it describes the patient and expects you to classify "
          "them. This is that vocabulary."),

        table(
            "What the words are telling you",
            ["Points to STABLE", "Points to UNSTABLE"],
            [
                ["Chronic illness", "Acute illness"],
                ["Post-op more than 12 hours", "Post-op less than 12 hours"],
                ["Local or regional anaesthesia",
                 "General anaesthesia, first 12 hours"],
                ["Admitted longer than 24 hours",
                 "Admitted less than 24 hours, newly admitted"],
                ["Ready for discharge, to be discharged",
                 "Newly diagnosed, not ready for discharge"],
                ["Unchanged assessment", "Changed or changing assessment"],
                ["The expected signs of their diagnosis",
                 "Unexpected signs for their diagnosis"],
                ["Lab values mildly off — creatinine, BUN, bicarbonate, "
                 "haemoglobin 8–11, raised haematocrit, raised BNP, raised sodium",
                 "Lab values dangerously off — INR in the 4s, potassium in the "
                 "6s, pH in the 6s, CO₂ in the 50s, low O₂ saturation, high WBC, "
                 "low ANC, low CD4, low platelets"],
            ],
        ),

        callout("tip",
                "Expected versus unexpected does more work than any other row in "
                "that table. A crushing chest pain in angina is expected and "
                "therefore stable. The same pain in a patient admitted for a "
                "fractured wrist is unexpected, and they are now your priority."),

        h(2, "Worked example"),
        p("Which patient is the higher priority?"),
        ul(
            ["A 16-year-old with meningococcal meningitis, temperature 103.8 °F, "
             "unchanged since admission three days ago."],
            ["A 67-year-old with irritable bowel syndrome who spiked a "
             "temperature of 103.4 °F this afternoon."],
        ),
        p("The 67-year-old. Line by line:"),
        table(
            "Scoring the two patients",
            ["", "16-year-old", "67-year-old"],
            [
                ["Diagnosis", "Meningitis — acute, HIGH", "IBS — chronic, low"],
                ["Temperature", "Expected for meningitis, low",
                 "Unexpected for IBS, HIGH"],
                ["Trend", "Unchanged for 3 days, low", "Spiked, changing, HIGH"],
                ["Timing", "Admitted 3 days ago, low", "This afternoon, HIGH"],
            ],
        ),
        p("The lower temperature belongs to the sicker patient, because "
          "three of four signals point at instability. The frightening "
          "diagnosis belongs to the patient whose body is doing exactly what "
          "that diagnosis does."),

        h(2, "Four things that are always unstable"),
        p("These override 'expected'. If the patient has one of these, they "
          "are unstable no matter how well it fits their diagnosis."),
        ol(
            [b("Haemorrhage"), " — not the same as bleeding"],
            [b("Fever above 105 °F"), " — seizure risk"],
            [b("Hypoglycaemia"), " — brain injury risk"],
            [b("Pulseless or breathless"), " — ventricular fibrillation, asystole"],
        ),
        callout("critical",
                "The exception that catches people: at the scene of an "
                "unwitnessed accident, a pulseless and breathless casualty is "
                "the LOWEST priority. In the field, with no witness to the "
                "arrest, they are presumed dead."),

        h(2, "Mass casualty: the black tag"),
        p("In a mass-casualty incident, three findings mean a black tag — "
          "expectant, treated last:"),
        ol("Pulseless", "Breathless",
           "Fixed and dilated pupils, even if they are still breathing"),
        callout("memory",
                "Tag them black and ship them last. Triage inverts your instincts: "
                "resources go to those who can be saved, not to those who need "
                "the most."),
    ),
)

# ---------------------------------------------------------------- note 4

note(
    "65000000-0000-4000-8000-000000000004",
    "What you can hand to an LPN, a UAP, and a family member",
    "The three delegation boundaries, in the order the exam tests them",
    ["Management of Care"],
    ["delegation", "scope-of-practice", "high-yield"],
    doc(
        p("Delegation questions are free marks, because the boundaries are "
          "fixed and short. Learn what each role cannot do, and the answer "
          "falls out."),

        h(2, "The LPN / LVN — nine things they cannot do"),
        ol(
            "Start an IV",
            "Hang or mix IV medications",
            "Give IV push medications",
            "Administer blood, or handle central lines — including flushes and dressing changes",
            "Create the care plan (they can implement one)",
            "Perform or develop teaching (they can reinforce teaching already given)",
            "Care for an unstable patient",
            "Perform the first of anything",
            "Assess on admission, discharge, transfer, or first after a change",
        ),
        callout("note",
                "An LPN may maintain an IV that is already running and document "
                "the flow. Maintaining is not starting."),

        h(2, "\"The first of anything\""),
        p("This is rule 8, and it is worth its own section because it "
          "generates so many items. The registered nurse does it once; after "
          "that the LPN may repeat it."),
        ul(
            "First tube feeding — RN. Every one after that — LPN.",
            "First post-op dressing change — RN. Subsequent changes — LPN.",
            "First feeding of a stroke patient — RN. Later feeds — LPN.",
            "First time a post-op patient is ambulated or got out of bed — RN.",
            "First set of post-op vital signs — RN.",
        ),
        callout("warning",
                "So: should the LPN change the first post-operative dressing on "
                "the day of surgery? No. Two rules forbid it — it is the first of "
                "something, and the patient is fresh post-op and therefore unstable."),

        h(2, "The UAP — four things they cannot do"),
        table(
            "Unlicensed assistive personnel",
            ["Cannot", "Except"],
            [
                ["Chart about the patient",
                 "They may chart what they did — 'side rail up, bed lowered'. "
                 "Never 'patient less anxious' or 'tolerated ambulation well'."],
                ["Give medications",
                 "Topical, over-the-counter and barrier preparations only. "
                 "A&D ointment yes; nitroglycerin, Neosporin and hydrocortisone "
                 "cream no — none of those is OTC."],
                ["Assess", "Vital signs and blood-glucose checks only."],
                ["Perform treatments", "Enemas only."],
            ],
        ),
        p("A UAP may carry out activities of daily living — but never the "
          "first time one is done for that patient."),
        callout("tip",
                "The verbs give it away. Assess, teach, evaluate, plan and "
                "administer belong to the RN. Assist, remind, collect, record "
                "and transport can go to the UAP."),

        h(2, "Family and visitors"),
        p("Safety is never delegated to a family member or visitor who has "
          "not been taught."),
        ul(
            ["\"Leave Dad's restraints off — I'll call you before I go.\" ",
             b("No."), " Safety cannot be handed to an untrained person."],
            ["\"Leave the crib rail down, I'll put it up when I've finished "
             "bathing the baby.\" ", b("No"), " — and the answer is not a "
             "lecture. Stay in the room until the rail is up."],
            ["\"Can I give my three-year-old his insulin?\" ", b("Yes"),
             " — once you have taught them and documented exactly what you taught."],
        ),
        callout("critical",
                "The pattern: an untrained family member cannot hold a safety "
                "responsibility, but a TAUGHT family member can. Teaching plus "
                "documentation is what converts a wrong answer into a right one."),
    ),
)

# ---------------------------------------------------------------- note 5

note(
    "65000000-0000-4000-8000-000000000005",
    "When a colleague does something wrong",
    "Four possible responses, and the two questions that pick between them",
    ["Management of Care"],
    ["staff-management", "delegation", "high-yield"],
    doc(
        p("This is neither prioritization nor delegation. It is what you do "
          "when a member of staff has done something they should not have. "
          "The exam offers the same four responses almost every time."),

        ol(
            "Tell the supervisor",
            "Confront them and take over the task immediately",
            "Talk to them about it later",
            "Ignore it",
        ),

        callout("critical",
                "Ignore it is never correct. Every incident is an opportunity to "
                "correct behaviour — if the choice is 'take no action', it is wrong."),

        h(2, "Two questions choose between the other three"),
        ol(
            [b("Is it illegal?"), " If yes — tell the supervisor."],
            [b("Is anyone in immediate physical or psychological harm?"),
             " If yes — confront and take over the task now."],
        ),
        p("If neither applies and the behaviour is merely unprofessional, "
          "speak to that person later, in private."),
        callout("warning",
                "If an act is both illegal and actively harming the patient, do "
                "both — take over the task first, then report it. The patient "
                "comes before the paperwork."),

        h(2, "Worked examples"),
        table(
            "What would you do?",
            ["Situation", "Response", "Why"],
            [
                ["You suspect an RN is diverting narcotics",
                 "Tell the supervisor", "Illegal"],
                ["An RN leaves the ward with bulging pockets",
                 "Tell the supervisor", "Illegal"],
                ["An aide gives perineal care without gloves",
                 "Confront and take over", "Immediate harm, not illegal"],
                ["A surgeon contaminates her gloves",
                 "Confront and take over", "Immediate harm, not illegal"],
                ["A colleague says 'exasperation' instead of 'exacerbation' "
                 "in every handover",
                 "Talk to them later", "Unprofessional, nobody is at risk"],
            ],
        ),

        h(2, "Two patients, one door"),
        p("You find two patients having sex, or a patient masturbating in "
          "their own room. Close the door and give them privacy. Adults are "
          "entitled to it, and there is no safety issue to answer."),

        h(2, "The worst-consequences game"),
        p("For 'which is the priority' items about needs rather than "
          "patients, ask what happens if you do not do each one. The worst "
          "outcome is your answer."),
        p("A suicidal patient has been admitted. Which is the priority?"),
        table(
            "If you skipped it, what happens?",
            ["Action omitted", "Consequence"],
            [
                ["Do not give the tranquilliser", "Agitated"],
                ["Do not orient them to the unit", "Lost"],
                ["Do not place them on suicide precautions", "DEAD"],
                ["Do not introduce them to staff", "Knows nobody"],
            ],
        ),
        p("Suicide precautions. The other three have consequences; only one "
          "of them is fatal."),
        callout("memory",
                "Do not ask which action is most important. Ask which omission "
                "does the most damage. The answer arrives faster and it is right "
                "more often."),
    ),
)


# ================================================================ QUESTIONS
#
# item_id bands start at 00101 so they cannot collide with the existing
# hand-made tutor questions (highest is NCLEX_TUT_MCQ_00013).
#
# marks mirror what lib/scoring/computeMarksFromKey derives: 1 for a
# single-answer item, one mark per correct option for SATA / SELECT_N.

QUESTIONS = []
_COUNTERS = {"MCQ": 100, "SATA": 100, "SN": 100}
_PREFIX = {"MCQ": "MCQ", "SATA": "SATA", "SN": "SN"}
_TYPE = {"MCQ": "MCQ", "SATA": "SATA", "SN": "SELECT_N"}

def _mint(kind):
    _COUNTERS[kind] += 1
    return f"NCLEX_TUT_{_PREFIX[kind]}_{_COUNTERS[kind]:05d}"

def mcq(stem, options, answer, rationale, feedback, difficulty="Medium",
        topic="Prioritization", subtopic=None, tags=()):
    """options: list of (id, text). answer: option id."""
    item = {
        "item_id": _mint("MCQ"), "question_type": "MCQ", "stem": stem,
        "content": {"options": [{"id": i, "text": x} for i, x in options]},
        "correct": {"answer": answer, "feedback": feedback},
        "marks": 1, "rationale": rationale, "difficulty": difficulty,
        "topic": topic, "subtopic": subtopic, "tags": list(tags),
    }
    QUESTIONS.append(item)
    return item["item_id"]

def sata(stem, options, answers, rationale, feedback, difficulty="Medium",
         topic="Prioritization", subtopic=None, tags=()):
    item = {
        "item_id": _mint("SATA"), "question_type": "SATA", "stem": stem,
        "content": {"options": [{"id": i, "text": x} for i, x in options]},
        "correct": {"answers": list(answers), "feedback": feedback},
        "marks": len(answers), "rationale": rationale, "difficulty": difficulty,
        "topic": topic, "subtopic": subtopic, "tags": list(tags),
    }
    QUESTIONS.append(item)
    return item["item_id"]

def select_n(stem, options, answers, rationale, feedback, difficulty="Medium",
             topic="Prioritization", subtopic=None, tags=()):
    item = {
        "item_id": _mint("SN"), "question_type": "SELECT_N", "stem": stem,
        "content": {"options": [{"id": i, "text": x} for i, x in options],
                    "select_count": len(answers)},
        "correct": {"answers": list(answers), "feedback": feedback},
        "marks": len(answers), "rationale": rationale, "difficulty": difficulty,
        "topic": topic, "subtopic": subtopic, "tags": list(tags),
    }
    QUESTIONS.append(item)
    return item["item_id"]


# --------------------------------------------- Module 1 — reading the question

M1 = []

M1.append(mcq(
    "A tornado has struck the town and the charge nurse is asked to free up "
    "medical-surgical beds for incoming casualties. Which client should the "
    "nurse identify as the most appropriate to discharge?",
    [("A", "A client admitted 4 hours ago with new-onset atrial fibrillation"),
     ("B", "A client 6 hours after an open cholecystectomy"),
     ("C", "A client with long-standing COPD whose oxygen saturation has been "
           "92% on room air since admission three days ago"),
     ("D", "A client with pneumonia who spiked a temperature of 39.4 °C this morning")],
    "C",
    "The question asks who can LEAVE, so it is looking for the lowest-priority "
    "— the most stable — client. Chronic COPD with an unchanged saturation over "
    "three days is stable on every count: chronic diagnosis, unchanged "
    "assessment, admitted longer than 24 hours. The other three are all acute, "
    "fresh post-op, or newly changed.",
    {"A": "Incorrect — new-onset within 4 hours is acute and changing.",
     "B": "Incorrect — fresh post-op, under 12 hours. The least dischargeable "
          "client on the unit.",
     "C": "Correct — chronic, unchanged, and settled for three days.",
     "D": "Incorrect — a newly spiked fever is a changed assessment."},
    difficulty="Medium", subtopic="Reading the question",
    tags=("prioritization", "discharge", "triage")))

M1.append(mcq(
    "A nurse receives the end-of-shift handover for four clients. Which client "
    "should the nurse assess first?",
    [("A", "A 58-year-old female with cirrhosis who has jaundice and ascites"),
     ("B", "A 44-year-old male with a fractured tibia who reports his toes feel numb"),
     ("C", "A 71-year-old female with osteoarthritis requesting her routine analgesia"),
     ("D", "A 30-year-old male with asthma whose peak flow is unchanged from admission")],
    "B",
    "'Assess first' asks for the highest priority. Numbness distal to a "
    "fracture is unexpected and suggests compartment syndrome or neurovascular "
    "compromise — a new, changing finding in a limb that can be lost. Jaundice "
    "and ascites are expected in cirrhosis; unchanged peak flow is stable; "
    "routine analgesia is not urgent.",
    {"A": "Incorrect — both findings are expected in cirrhosis.",
     "B": "Correct — an unexpected neurovascular change after a fracture.",
     "C": "Incorrect — comfort matters, but nothing here is deteriorating.",
     "D": "Incorrect — unchanged is the definition of stable."},
    difficulty="Medium", subtopic="Reading the question",
    tags=("prioritization", "assessment")))

M1.append(mcq(
    "Which client should the nurse see first?",
    [("A", "A client with angina pectoris reporting crushing substernal chest pain"),
     ("B", "A client two days after a subtotal thyroidectomy who asks the nurse "
           "'why are they watching elephants in here?'"),
     ("C", "A client with type 2 diabetes whose morning glucose was 9.1 mmol/L"),
     ("D", "A client with a chronic venous ulcer due for a dressing change")],
    "B",
    "New confusion two days after a thyroidectomy is unexpected and may signal "
    "thyroid storm. Crushing substernal pain is the textbook presentation of "
    "angina — unpleasant, but expected for that diagnosis. The exam repeatedly "
    "pairs a dramatic-but-expected symptom against a quiet-but-unexpected one.",
    {"A": "Incorrect — crushing substernal pain is what angina does. Expected.",
     "B": "Correct — new confusion post-thyroidectomy suggests thyroid storm.",
     "C": "Incorrect — a mildly raised glucose is expected in type 2 diabetes.",
     "D": "Incorrect — a chronic wound with routine care scheduled."},
    difficulty="Hard", subtopic="Expected vs unexpected",
    tags=("prioritization", "endocrine")))

M1.append(sata(
    "A nurse is analysing the answer choices in a prioritization item. Which "
    "elements of a choice should the nurse recognise as relevant to deciding "
    "priority in an adult medical-surgical question? Select all that apply.",
    [("A", "The modifying phrase describing the client's current condition"),
     ("B", "The client's age"),
     ("C", "The client's gender"),
     ("D", "The medical diagnosis"),
     ("E", "Whether the described finding is expected for that diagnosis")],
    ["A", "D", "E"],
    "In an adult medical-surgical item the modifying phrase carries the most "
    "weight, the diagnosis matters when no modifier is present, and whether a "
    "finding is expected decides stability. Age and gender are relevant in "
    "paediatric and obstetric questions, not in general adult prioritization.",
    {"A": "Correct — the modifying phrase outranks everything else.",
     "B": "Incorrect — age decides priority in paediatrics, not here.",
     "C": "Incorrect — gender is almost never the deciding factor.",
     "D": "Correct — the diagnosis decides when no modifying phrase is given.",
     "E": "Correct — expected findings point to stability."},
    difficulty="Medium", subtopic="Anatomy of an answer choice",
    tags=("prioritization", "exam-strategy")))

M1.append(mcq(
    "Two clients are admitted to a cardiac unit. Neither record contains any "
    "further detail. Which client has the higher priority?",
    [("A", "The client with angina pectoris"),
     ("B", "The client with a myocardial infarction"),
     ("C", "Neither — priority cannot be determined without vital signs"),
     ("D", "Both are equal priority until assessed")],
    "B",
    "With no modifying phrase attached to either client, judge by the "
    "condition itself. Infarction means muscle is dying; angina means muscle "
    "is ischaemic but still viable. Where the exam gives you nothing else, it "
    "wants you to rank the diagnoses.",
    {"A": "Incorrect — angina is the lesser of the two conditions here.",
     "B": "Correct — with no modifiers, the more severe diagnosis wins.",
     "C": "Incorrect — the item is answerable as written.",
     "D": "Incorrect — MI and angina are not equivalent."},
    difficulty="Easy", subtopic="Diagnosis vs modifier",
    tags=("prioritization", "cardiac")))

M1.append(mcq(
    "Which client should the charge nurse assign to a newly floated nurse who "
    "does not know the unit?",
    [("A", "A client 3 hours after a total hip replacement"),
     ("B", "A client with heart failure awaiting discharge later today"),
     ("C", "A client admitted an hour ago with acute pancreatitis"),
     ("D", "A client with a new tracheostomy created this morning")],
    "B",
    "Assigning to an inexperienced or unfamiliar nurse is a 'who is the "
    "LOWEST priority' question in disguise — you want the most stable client. "
    "Heart failure awaiting discharge is chronic, unchanged and leaving. The "
    "other three are fresh post-op or newly admitted.",
    {"A": "Incorrect — fresh post-op, under 12 hours.",
     "B": "Correct — chronic and stable enough to be going home.",
     "C": "Incorrect — admitted under an hour ago; acute.",
     "D": "Incorrect — a new airway is the least stable client here."},
    difficulty="Medium", subtopic="Reading the question",
    tags=("prioritization", "assignment")))


# --------------------------------------------- Module 2 — the four rules

M2 = []

M2.append(mcq(
    "A nurse is assigned four clients. Applying the rule that acute conditions "
    "outrank chronic ones, which client should the nurse see first?",
    [("A", "A client with COPD"),
     ("B", "A client with chronic heart failure"),
     ("C", "A client with acute appendicitis"),
     ("D", "A client with osteoarthritis")],
    "C",
    "Appendicitis is the only acute condition listed. COPD, chronic heart "
    "failure and osteoarthritis are all chronic — states the body has already "
    "adapted to.",
    {"A": "Incorrect — chronic.",
     "B": "Incorrect — chronic.",
     "C": "Correct — the only acute process here, and one that can perforate.",
     "D": "Incorrect — chronic."},
    difficulty="Easy", subtopic="Rule 1 — acute beats chronic",
    tags=("prioritization", "four-rules")))

M2.append(mcq(
    "Which client should the nurse assess first?",
    [("A", "A client 2 hours after a cholecystectomy"),
     ("B", "A client who had a radical neck dissection yesterday"),
     ("C", "A client who had a bilateral above-knee amputation yesterday"),
     ("D", "A client who had a right frontal craniotomy yesterday")],
    "A",
    "Fresh post-op means under 12 hours, and it outranks other surgical "
    "clients regardless of how major their operation was. All three "
    "alternatives are more than 12 hours out and therefore comparatively "
    "stable; the 2-hour client is still emerging from anaesthesia and at "
    "highest risk of haemorrhage.",
    {"A": "Correct — 2 hours post-op. Fresh beats big.",
     "B": "Incorrect — yesterday. Major, but past the 12-hour window.",
     "C": "Incorrect — yesterday, however dramatic the surgery.",
     "D": "Incorrect — yesterday. The brain does not override the clock here."},
    difficulty="Medium", subtopic="Rule 2 — fresh post-op",
    tags=("prioritization", "four-rules", "post-op")))

M2.append(mcq(
    "A nurse must choose between two clients who are equally unstable. One has "
    "pink frothy sputum; the other has a potassium of 6.6 mmol/L. Using the "
    "tie-breaker rule, which client is the priority and why?",
    [("A", "The client with frothy sputum, because the lung outranks the heart"),
     ("B", "The client with the raised potassium, because the heart outranks the lung"),
     ("C", "The client with frothy sputum, because respiratory problems are always first"),
     ("D", "The client with the raised potassium, because electrolytes are life-threatening")],
    "A",
    "The tie-breaker ranks by how vital the organ named in the MODIFYING "
    "PHRASE is: brain, lung, heart, liver, kidney, pancreas. Frothy sputum is "
    "a lung finding; a potassium of 6.6 is a cardiac risk. Lung outranks heart.",
    {"A": "Correct — lung sits above heart in the organ hierarchy.",
     "B": "Incorrect — the order is brain, lung, heart. Heart is third.",
     "C": "Incorrect — right client, wrong reason. It is the hierarchy, not a "
          "blanket rule about breathing.",
     "D": "Incorrect — a raised potassium is dangerous, but the lung ranks higher."},
    difficulty="Hard", subtopic="Rule 4 — organ tie-breaker",
    tags=("prioritization", "four-rules", "tie-breaker")))

M2.append(select_n(
    "Place the organs in order of priority when applying the tie-breaker rule. "
    "Select the two organs that rank HIGHEST.",
    [("A", "Brain"), ("B", "Kidney"), ("C", "Lung"),
     ("D", "Pancreas"), ("E", "Liver"), ("F", "Heart")],
    ["A", "C"],
    "The order is brain, lung, heart, liver, kidney, pancreas. The two "
    "highest-ranking are brain and lung.",
    {"A": "Correct — the brain ranks first.",
     "B": "Incorrect — kidney is fifth.",
     "C": "Correct — the lung ranks second.",
     "D": "Incorrect — pancreas is last.",
     "E": "Incorrect — liver is fourth.",
     "F": "Incorrect — heart is third, just below the lung."},
    difficulty="Medium", subtopic="Rule 4 — organ tie-breaker",
    tags=("prioritization", "four-rules")))

M2.append(mcq(
    "Three clients each have an unexpected finding. Which should the nurse "
    "see first?",
    [("A", "A client with chronic heart failure, potassium 6.6 mmol/L, no ECG changes"),
     ("B", "A client with chronic renal failure, creatinine 24.7 mg/dL, with pink frothy sputum"),
     ("C", "A client with acute hepatitis, jaundice and raised ammonia, who cannot be roused"),
     ("D", "A client with type 1 diabetes whose glucose is 11.2 mmol/L before breakfast")],
    "C",
    "Rules 1 to 3 do not separate the first three — each has something "
    "unexpected. The tie-breaker does. The modifying phrases name the heart "
    "(potassium), the lung (frothy sputum) and the brain (cannot be roused). "
    "Brain wins. Option D's glucose is expected in type 1 diabetes.",
    {"A": "Incorrect — heart is third in the hierarchy.",
     "B": "Incorrect — lung is second. Close, but the brain outranks it.",
     "C": "Correct — an unrousable client is a brain finding, and brain ranks first.",
     "D": "Incorrect — a pre-breakfast glucose of 11.2 is expected here."},
    difficulty="Hard", subtopic="Rule 4 — organ tie-breaker",
    tags=("prioritization", "four-rules")))

M2.append(sata(
    "Which findings would move a client into the higher-priority group under "
    "the four prioritization rules? Select all that apply.",
    [("A", "The client had a general anaesthetic 6 hours ago"),
     ("B", "The client has had rheumatoid arthritis for twelve years"),
     ("C", "The client's assessment has changed since the last round"),
     ("D", "The client was admitted 40 minutes ago"),
     ("E", "The client is being discharged this afternoon"),
     ("F", "The client has an INR of 4.2")],
    ["A", "C", "D", "F"],
    "General anaesthesia within 12 hours, a changing assessment, admission "
    "under 24 hours and a dangerously deranged lab value all point to "
    "instability. A twelve-year history is chronic, and a client leaving today "
    "is by definition stable enough to go.",
    {"A": "Correct — within the 12-hour post-anaesthetic window.",
     "B": "Incorrect — chronic and long-established.",
     "C": "Correct — changing assessments are the core signal of instability.",
     "D": "Correct — newly admitted, under 24 hours.",
     "E": "Incorrect — ready for discharge is a stability marker.",
     "F": "Correct — an INR in the 4s is a dangerous derangement."},
    difficulty="Medium", subtopic="Rules 1–3 combined",
    tags=("prioritization", "four-rules", "stability")))

M2.append(mcq(
    "A client is 11 hours post-operative following a general anaesthetic. How "
    "should the nurse classify this client?",
    [("A", "Stable, because the surgery was completed and the client is awake"),
     ("B", "Unstable, because the client is within 12 hours of a general anaesthetic"),
     ("C", "Stable, because the anaesthetic has worn off by 8 hours"),
     ("D", "Unstable only if the vital signs are abnormal")],
    "B",
    "Twelve hours is the boundary. At 11 hours the client is still classed as "
    "fresh post-op and unstable regardless of how well they look — the risk of "
    "haemorrhage and anaesthetic complications has not yet passed.",
    {"A": "Incorrect — being awake does not end the 12-hour window.",
     "B": "Correct — 11 hours is inside the window.",
     "C": "Incorrect — the rule is 12 hours, not 8.",
     "D": "Incorrect — the classification does not wait for abnormal vitals."},
    difficulty="Easy", subtopic="Rule 2 — fresh post-op",
    tags=("prioritization", "post-op")))


# --------------------------------------------- Module 3 — stable vs unstable

M3 = []

M3.append(mcq(
    "Which client should the nurse assess first?",
    [("A", "A 16-year-old with meningococcal meningitis whose temperature has "
           "been 39.9 °C since admission three days ago"),
     ("B", "A 67-year-old with irritable bowel syndrome who spiked a "
           "temperature of 39.7 °C this afternoon"),
     ("C", "A 24-year-old with a migraine requesting a darkened room"),
     ("D", "A 50-year-old with hypothyroidism awaiting a repeat TSH")],
    "B",
    "The lower temperature belongs to the sicker client. Fever is expected in "
    "meningitis and has been unchanged for three days; fever is entirely "
    "unexpected in irritable bowel syndrome, it has just spiked, and it is a "
    "change. Three signals of instability beat one frightening diagnosis.",
    {"A": "Incorrect — expected, unchanged, and admitted over 24 hours ago.",
     "B": "Correct — unexpected for the diagnosis, newly spiked, changing.",
     "C": "Incorrect — expected for migraine.",
     "D": "Incorrect — chronic and waiting on a routine result."},
    difficulty="Hard", subtopic="Expected vs unexpected",
    tags=("prioritization", "stability")))

M3.append(sata(
    "Which findings always classify a client as unstable, even when they are "
    "expected for that client's diagnosis? Select all that apply.",
    [("A", "Haemorrhage"),
     ("B", "A temperature above 40.6 °C (105 °F)"),
     ("C", "Hypoglycaemia"),
     ("D", "Pulseless or breathless"),
     ("E", "Bleeding from a surgical drain"),
     ("F", "A haemoglobin of 9.4 g/dL")],
    ["A", "B", "C", "D"],
    "Four findings override 'expected': haemorrhage, fever above 105 °F, "
    "hypoglycaemia and being pulseless or breathless. Note that haemorrhage is "
    "not the same as bleeding — drain output is expected after surgery — and a "
    "haemoglobin of 9.4 is a mild derangement, not a critical one.",
    {"A": "Correct — always unstable.",
     "B": "Correct — seizure risk.",
     "C": "Correct — risk of brain injury.",
     "D": "Correct — always unstable in the clinical setting.",
     "E": "Incorrect — bleeding is not haemorrhage; drain output is expected.",
     "F": "Incorrect — haemoglobin 8 to 11 is a mild abnormality."},
    difficulty="Medium", subtopic="Always unstable",
    tags=("prioritization", "stability")))

M3.append(mcq(
    "A nurse arrives at the scene of an unwitnessed road accident. Four "
    "casualties are present. Which should the nurse attend to LAST?",
    [("A", "A casualty with an open femoral fracture and heavy bleeding"),
     ("B", "A casualty who is pulseless and not breathing"),
     ("C", "A casualty with laboured breathing and chest bruising"),
     ("D", "A casualty who is confused and repeating questions")],
    "B",
    "This is the field exception. In hospital, pulseless and breathless is "
    "always the highest priority. At the scene of an UNWITNESSED accident, "
    "a pulseless, breathless casualty is presumed dead and becomes the lowest "
    "priority — resources go to those who can still be saved.",
    {"A": "Incorrect — heavy bleeding is salvageable and urgent.",
     "B": "Correct — unwitnessed arrest in the field. Presumed dead.",
     "C": "Incorrect — a breathing problem that can be treated.",
     "D": "Incorrect — confusion suggests a head injury worth attending."},
    difficulty="Hard", subtopic="Field triage",
    tags=("prioritization", "triage", "emergency")))

M3.append(sata(
    "During a mass-casualty incident, which findings would result in a client "
    "being tagged BLACK? Select all that apply.",
    [("A", "Pulseless"),
     ("B", "Breathless"),
     ("C", "Fixed and dilated pupils, though still breathing"),
     ("D", "An open fracture of both legs"),
     ("E", "A respiratory rate of 34 with an open chest wound")],
    ["A", "B", "C"],
    "Black tags mark the expectant — treated last. Pulseless, breathless, and "
    "fixed and dilated pupils each earn one, and the third applies even when "
    "the casualty is still breathing. Bilateral fractures and a chest wound "
    "are survivable with treatment and would be tagged for care.",
    {"A": "Correct.",
     "B": "Correct.",
     "C": "Correct — this one catches people, because they are still breathing.",
     "D": "Incorrect — serious, but survivable.",
     "E": "Incorrect — urgent and treatable; this is a red tag."},
    difficulty="Medium", subtopic="Mass casualty triage",
    tags=("prioritization", "triage", "disaster")))

M3.append(mcq(
    "A client with angina pectoris reports chest pain that is not relieved by "
    "rest. How should the nurse classify this client?",
    [("A", "Stable, because chest pain is expected in angina"),
     ("B", "Unstable, because pain unrelieved by rest is not the expected pattern"),
     ("C", "Stable, because the client has a known cardiac diagnosis"),
     ("D", "Unstable, because all cardiac clients are unstable")],
    "B",
    "Angina pain that stops with rest is expected and therefore stable. Pain "
    "that does not stop with rest has broken the expected pattern — this is "
    "unstable angina and may be an evolving infarction.",
    {"A": "Incorrect — the pain is expected; failing to settle is not.",
     "B": "Correct — the pattern has changed.",
     "C": "Incorrect — a known diagnosis does not make a new pattern safe.",
     "D": "Incorrect — a cardiac diagnosis alone does not confer instability."},
    difficulty="Medium", subtopic="Expected vs unexpected",
    tags=("prioritization", "cardiac", "stability")))

M3.append(sata(
    "Which laboratory results should the nurse interpret as markers of an "
    "UNSTABLE client? Select all that apply.",
    [("A", "Potassium 6.4 mmol/L"),
     ("B", "Haemoglobin 9.8 g/dL"),
     ("C", "Arterial pH 6.9"),
     ("D", "Blood urea nitrogen mildly raised"),
     ("E", "Platelet count 22 × 10⁹/L"),
     ("F", "Raised haematocrit")],
    ["A", "C", "E"],
    "Dangerous derangements point to instability: potassium in the 6s, a pH in "
    "the 6s, and a critically low platelet count. Mildly abnormal values — "
    "haemoglobin between 8 and 11, a raised BUN, a raised haematocrit — sit in "
    "the stable group.",
    {"A": "Correct — potassium in the 6s risks fatal arrhythmia.",
     "B": "Incorrect — haemoglobin 8 to 11 is a mild abnormality.",
     "C": "Correct — a pH in the 6s is incompatible with stability.",
     "D": "Incorrect — a mildly raised BUN is a stable-range abnormality.",
     "E": "Correct — a critically low platelet count risks spontaneous bleeding.",
     "F": "Incorrect — a raised haematocrit is a mild abnormality."},
    difficulty="Medium", subtopic="Lab values and stability",
    tags=("prioritization", "labs", "stability")))

M3.append(mcq(
    "Which client should the nurse see first?",
    [("A", "A client admitted 2 days ago with cellulitis whose redness is unchanged"),
     ("B", "A client with type 1 diabetes whose blood glucose is 2.6 mmol/L"),
     ("C", "A client with a chronic pressure ulcer due for review"),
     ("D", "A client with COPD who is short of breath on exertion, as usual")],
    "B",
    "Hypoglycaemia is one of the four findings that always confers "
    "instability, because it can cause brain injury within minutes. Everything "
    "else here is chronic, unchanged, or expected for the diagnosis.",
    {"A": "Incorrect — unchanged over two days.",
     "B": "Correct — hypoglycaemia is always unstable.",
     "C": "Incorrect — chronic and scheduled.",
     "D": "Incorrect — 'as usual' is the giveaway. Expected."},
    difficulty="Easy", subtopic="Always unstable",
    tags=("prioritization", "endocrine", "stability")))

M3.append(mcq(
    "A nurse is prioritising four clients. Which is the MOST stable?",
    [("A", "A client newly diagnosed with lupus this morning"),
     ("B", "A client whose assessment findings have changed since the last round"),
     ("C", "A client with rheumatoid arthritis whose joint pain is at its usual level"),
     ("D", "A client who returned from theatre 5 hours ago")],
    "C",
    "Chronic, unchanged and expected — three stability markers at once. A new "
    "diagnosis, a changing assessment and a fresh post-operative client all "
    "sit in the unstable group.",
    {"A": "Incorrect — newly diagnosed is an instability marker.",
     "B": "Incorrect — changing assessment is the core instability signal.",
     "C": "Correct — chronic, unchanged, expected.",
     "D": "Incorrect — under 12 hours post-op."},
    difficulty="Easy", subtopic="Stable vs unstable",
    tags=("prioritization", "stability")))


# --------------------------------------------- Module 4 — delegation

M4 = []

M4.append(sata(
    "Which tasks may a registered nurse delegate to a licensed practical nurse "
    "(LPN/LVN)? Select all that apply.",
    [("A", "Starting a peripheral IV on a newly admitted client"),
     ("B", "Monitoring an already-running IV infusion and documenting the flow rate"),
     ("C", "Reinforcing teaching the RN has already delivered about a low-sodium diet"),
     ("D", "Changing a post-operative dressing that the RN changed for the first time yesterday"),
     ("E", "Administering a unit of packed red cells"),
     ("F", "Completing the admission assessment on a new arrival")],
    ["B", "C", "D"],
    "An LPN may maintain an existing IV, reinforce teaching already given, and "
    "repeat a task the RN has performed once. They may not start IVs, "
    "administer blood, or carry out an admission assessment.",
    {"A": "Incorrect — LPNs cannot start an IV.",
     "B": "Correct — maintaining is permitted; starting is not.",
     "C": "Correct — reinforcing is permitted; teaching is not.",
     "D": "Correct — the RN did the first, so the LPN may do the rest.",
     "E": "Incorrect — blood administration is outside LPN scope.",
     "F": "Incorrect — admission assessment belongs to the RN."},
    difficulty="Medium", topic="Delegation", subtopic="LPN scope",
    tags=("delegation", "scope-of-practice")))

M4.append(mcq(
    "A client returned from theatre this morning. Who should perform the first "
    "post-operative dressing change?",
    [("A", "The LPN, because dressing changes are within their scope"),
     ("B", "The registered nurse, because it is the first dressing change and "
           "the client is fresh post-op"),
     ("C", "The unlicensed assistive personnel, under supervision"),
     ("D", "Either the RN or the LPN, depending on the workload")],
    "B",
    "Two separate rules make this the RN's task. An LPN cannot perform the "
    "first of anything, and an LPN cannot care for an unstable client — a "
    "client operated on this morning is inside the 12-hour window.",
    {"A": "Incorrect — dressing changes are, but not the FIRST one.",
     "B": "Correct — first of anything, and an unstable client.",
     "C": "Incorrect — well outside UAP scope.",
     "D": "Incorrect — workload never expands a scope of practice."},
    difficulty="Medium", topic="Delegation", subtopic="First of anything",
    tags=("delegation", "post-op")))

M4.append(mcq(
    "An unlicensed assistive personnel (UAP) asks which entry they may make in "
    "a client's record. Which response by the nurse is correct?",
    [("A", "'You may document that the client tolerated ambulation well.'"),
     ("B", "'You may document that the side rail is up and the bed is lowered.'"),
     ("C", "'You may document that the client appears less anxious today.'"),
     ("D", "'You may document your assessment of the client's wound.'")],
    "B",
    "A UAP may chart what they did — a task performed, a safety measure put in "
    "place. They may not chart anything that interprets the client's "
    "condition, because interpretation is assessment.",
    {"A": "Incorrect — 'tolerated well' is an evaluation of response.",
     "B": "Correct — a factual record of what the UAP did.",
     "C": "Incorrect — 'less anxious' is a judgement about the client.",
     "D": "Incorrect — UAPs do not assess or document assessments."},
    difficulty="Easy", topic="Delegation", subtopic="UAP scope",
    tags=("delegation", "documentation")))

M4.append(sata(
    "Which medications may a UAP apply to a client, within the usual scope of "
    "the role? Select all that apply.",
    [("A", "A&D barrier ointment to intact perineal skin"),
     ("B", "Nitroglycerin ointment to the chest wall"),
     ("C", "An over-the-counter moisturising cream"),
     ("D", "Hydrocortisone 1% cream to a rash"),
     ("E", "Neosporin ointment to a superficial graze")],
    ["A", "C"],
    "A UAP may apply topical, over-the-counter and barrier preparations only. "
    "Nitroglycerin, Neosporin and hydrocortisone cream are all prescription or "
    "medicated products, whatever their route.",
    {"A": "Correct — a barrier preparation.",
     "B": "Incorrect — nitroglycerin is a potent cardiac drug.",
     "C": "Correct — over the counter and not medicated.",
     "D": "Incorrect — a medicated steroid preparation.",
     "E": "Incorrect — an antibiotic preparation, not OTC in this context."},
    difficulty="Hard", topic="Delegation", subtopic="UAP scope",
    tags=("delegation", "medication")))

M4.append(mcq(
    "A nurse reports hearing new crackles in a client's chest. Who should "
    "assess the client?",
    [("A", "The LPN, because auscultation is within their scope"),
     ("B", "The registered nurse, because this is a new change in the client's condition"),
     ("C", "The UAP, who can take a set of vital signs first"),
     ("D", "The respiratory therapist, without nursing assessment")],
    "B",
    "An LPN may not perform the first assessment after a change in condition. "
    "New crackles are exactly that change, so the RN assesses.",
    {"A": "Incorrect — the restriction is not about the skill but about the "
          "first assessment after a change.",
     "B": "Correct — a new finding requires the RN.",
     "C": "Incorrect — vital signs do not substitute for an assessment.",
     "D": "Incorrect — the nurse does not hand off her own assessment."},
    difficulty="Medium", topic="Delegation", subtopic="LPN scope",
    tags=("delegation", "assessment")))

M4.append(mcq(
    "A client's son says, 'Please leave Dad's restraints off — I'll call you "
    "before I leave the ward.' What is the nurse's best response?",
    [("A", "'That's fine, as long as you let me know before you go.'"),
     ("B", "'I can't hand over responsibility for your father's safety, but "
           "let's talk about whether he still needs them.'"),
     ("C", "'Only if you sign a form taking responsibility.'"),
     ("D", "'Restraints must stay on at all times once prescribed.'")],
    "B",
    "Safety cannot be delegated to an untrained family member, however "
    "well-meaning. The correct response declines the delegation without "
    "dismissing the son — and restraint use should always be under review.",
    {"A": "Incorrect — this delegates a safety responsibility.",
     "B": "Correct — declines the handover and opens the clinical question.",
     "C": "Incorrect — a signature does not transfer a nursing responsibility.",
     "D": "Incorrect — restraints are reviewed and removed at the earliest "
          "safe opportunity."},
    difficulty="Medium", topic="Delegation", subtopic="Family and visitors",
    tags=("delegation", "safety", "restraints")))

M4.append(mcq(
    "The mother of a 3-year-old newly diagnosed with type 1 diabetes asks "
    "whether she may give her child's insulin injections at home. What is the "
    "nurse's best response?",
    [("A", "'No — insulin must be given by a licensed professional.'"),
     ("B", "'Yes — once I have taught you the technique and documented that teaching.'"),
     ("C", "'Yes — parents may always administer their own child's medications.'"),
     ("D", "'Only if a district nurse supervises every dose.'")],
    "B",
    "A taught family member can hold a responsibility an untaught one cannot. "
    "Teaching plus documentation of what was taught is what makes the "
    "delegation safe and defensible.",
    {"A": "Incorrect — parents routinely give insulin at home.",
     "B": "Correct — teach, then document what you taught.",
     "C": "Incorrect — 'always' skips the teaching requirement.",
     "D": "Incorrect — supervision of every dose is neither required nor practical."},
    difficulty="Medium", topic="Delegation", subtopic="Family and visitors",
    tags=("delegation", "teaching", "paediatrics")))

M4.append(sata(
    "Which tasks may the registered nurse delegate to a UAP? Select all that apply.",
    [("A", "Taking a set of vital signs on a stable client"),
     ("B", "Performing a blood-glucose check on a client with diabetes"),
     ("C", "Administering a soap-suds enema"),
     ("D", "Assisting a client to shower who has showered with help before"),
     ("E", "Evaluating whether pain medication has been effective"),
     ("F", "Feeding a stroke client for the first time since admission")],
    ["A", "B", "C", "D"],
    "Vital signs, blood-glucose checks and enemas are the named exceptions to "
    "the UAP restrictions on assessment and treatment, and an established ADL "
    "may be delegated. Evaluating a response is RN work, and no UAP performs "
    "the first feeding of a client with a swallowing risk.",
    {"A": "Correct — vital signs are the assessment exception.",
     "B": "Correct — blood-glucose checks are permitted.",
     "C": "Correct — enemas are the treatment exception.",
     "D": "Correct — an ADL the client has done with help before.",
     "E": "Incorrect — evaluation belongs to the RN.",
     "F": "Incorrect — never the first of anything, and aspiration risk."},
    difficulty="Hard", topic="Delegation", subtopic="UAP scope",
    tags=("delegation", "scope-of-practice")))


# --------------------------------------------- Module 5 — staff management

M5 = []

M5.append(mcq(
    "A nurse suspects that a colleague has been diverting narcotics from the "
    "ward stock. What should the nurse do?",
    [("A", "Confront the colleague privately and ask for an explanation"),
     ("B", "Report the concern to the supervisor"),
     ("C", "Wait and gather more evidence before acting"),
     ("D", "Document the concern in the client's record")],
    "B",
    "Diversion is illegal. Illegal acts go to the supervisor — the nurse does "
    "not investigate, confront, or wait for certainty.",
    {"A": "Incorrect — confrontation is for immediate harm, not illegality.",
     "B": "Correct — illegal act, so report it up.",
     "C": "Incorrect — waiting allows the diversion to continue.",
     "D": "Incorrect — a staffing concern never goes in a client's record."},
    difficulty="Easy", topic="Staff management", subtopic="Illegal acts",
    tags=("staff-management", "legal-ethical")))

M5.append(mcq(
    "A nurse observes an aide providing perineal care to a client without "
    "wearing gloves. What is the nurse's best action?",
    [("A", "Report the aide to the unit supervisor at the end of the shift"),
     ("B", "Intervene immediately and take over the task"),
     ("C", "Mention it to the aide at the next team meeting"),
     ("D", "Take no action, as the aide has completed this task many times")],
    "B",
    "Nothing illegal has happened, but someone is at immediate risk of harm — "
    "both the client and the aide. Immediate harm means confront and take over "
    "the task now, not later.",
    {"A": "Incorrect — the harm is happening now; the end of the shift is too late.",
     "B": "Correct — immediate physical harm means intervene now.",
     "C": "Incorrect — 'talk later' is for behaviour that harms nobody.",
     "D": "Incorrect — inaction is never the answer."},
    difficulty="Medium", topic="Staff management", subtopic="Immediate harm",
    tags=("staff-management", "infection-control")))

M5.append(mcq(
    "During every handover, a colleague mispronounces 'exacerbation' as "
    "'exasperation'. What should the nurse do?",
    [("A", "Correct the colleague in front of the team so everyone learns"),
     ("B", "Report the colleague to the supervisor"),
     ("C", "Speak to the colleague privately at a later time"),
     ("D", "Ignore it, as it does not affect client care")],
    "C",
    "Nothing illegal, nobody in harm's way — this is simply unprofessional. "
    "That combination means a private conversation later. Note that 'ignore "
    "it' remains wrong even when the behaviour is trivial.",
    {"A": "Incorrect — public correction is humiliating and unnecessary.",
     "B": "Incorrect — this does not warrant escalation.",
     "C": "Correct — inappropriate but harmless, so address it privately later.",
     "D": "Incorrect — ignoring inappropriate behaviour is never the answer."},
    difficulty="Easy", topic="Staff management", subtopic="Unprofessional behaviour",
    tags=("staff-management",)))

M5.append(mcq(
    "A nurse observes a colleague administering a medication by a route that "
    "is not prescribed, and the client is beginning to react. What should the "
    "nurse do FIRST?",
    [("A", "Report the incident to the supervisor"),
     ("B", "Complete an incident report"),
     ("C", "Take over the client's care immediately, then report the incident"),
     ("D", "Ask the colleague to explain their reasoning")],
    "C",
    "When an act is both wrong and actively harming the client, do both — but "
    "in the right order. Take over the task and attend to the client first, "
    "then report. The client comes before the paperwork.",
    {"A": "Incorrect — reporting first leaves the client reacting.",
     "B": "Incorrect — documentation follows the clinical response.",
     "C": "Correct — protect the client, then escalate.",
     "D": "Incorrect — this is not the moment for a discussion."},
    difficulty="Hard", topic="Staff management", subtopic="Immediate harm",
    tags=("staff-management", "medication-safety")))

M5.append(mcq(
    "A client has been admitted following a suicide attempt. Which nursing "
    "action is the highest priority?",
    [("A", "Administering the prescribed anxiolytic"),
     ("B", "Orienting the client to the unit"),
     ("C", "Initiating suicide precautions"),
     ("D", "Introducing the client to the staff on duty")],
    "C",
    "Ask what happens if each action is omitted. No anxiolytic — agitated. No "
    "orientation — lost. No introductions — knows nobody. No suicide "
    "precautions — dead. The omission with the worst consequence is the "
    "priority.",
    {"A": "Incorrect — omission causes agitation, not death.",
     "B": "Incorrect — omission causes disorientation.",
     "C": "Correct — the only omission here that is fatal.",
     "D": "Incorrect — omission causes unfamiliarity."},
    difficulty="Medium", topic="Staff management",
    subtopic="Worst-consequences reasoning",
    tags=("prioritization", "psychosocial", "safety")))

M5.append(mcq(
    "A nurse walks into a room and finds two adult clients engaged in "
    "consensual sexual activity. What is the nurse's best action?",
    [("A", "Separate the clients and report them to the supervisor"),
     ("B", "Close the door and give them privacy"),
     ("C", "Remain in the room to ensure nobody is harmed"),
     ("D", "Document the incident in both clients' records")],
    "B",
    "Consenting adults are entitled to privacy and there is no safety concern "
    "to answer. The same applies to a client masturbating in their own room.",
    {"A": "Incorrect — there is nothing to report.",
     "B": "Correct — close the door and leave them to it.",
     "C": "Incorrect — remaining is the intrusion, not the safeguard.",
     "D": "Incorrect — no clinical event has occurred."},
    difficulty="Medium", topic="Staff management", subtopic="Client rights",
    tags=("staff-management", "psychosocial", "client-rights")))


# --------------------------------------------- Final mock — fresh mixed items
#
# Deliberately NOT a replay of the module drills. A final assessment made
# only of questions the student has already answered measures recall of
# this course, not of the framework.

MOCK = []

MOCK.append(mcq(
    "A nurse on a surgical unit receives handover for four clients. Which "
    "client should the nurse assess first?",
    [("A", "A client 18 hours after a hemicolectomy whose wound drain has "
           "drained 40 mL of serosanguineous fluid"),
     ("B", "A client 3 hours after a thyroidectomy who reports increasing "
           "difficulty swallowing"),
     ("C", "A client with chronic pancreatitis reporting epigastric pain"),
     ("D", "A client awaiting discharge after an uncomplicated appendicectomy")],
    "B",
    "Fresh post-op at 3 hours, and the modifying phrase describes a new "
    "airway threat — increasing difficulty swallowing after thyroid surgery "
    "suggests a developing haematoma. Drain output at 18 hours is expected, "
    "chronic pancreatitis pain is expected, and a client awaiting discharge "
    "is stable.",
    {"A": "Incorrect — expected drainage, and past the 12-hour window.",
     "B": "Correct — fresh post-op with an unexpected, airway-threatening change.",
     "C": "Incorrect — expected for the diagnosis, and chronic.",
     "D": "Incorrect — the most stable client on the list."},
    difficulty="Hard", subtopic="Mixed", tags=("prioritization", "post-op")))

MOCK.append(sata(
    "A charge nurse is planning assignments. Which tasks require a registered "
    "nurse and cannot be delegated? Select all that apply.",
    [("A", "Developing the plan of care for a newly admitted client"),
     ("B", "Recording the oral intake of a stable client"),
     ("C", "Teaching a client to self-administer a new inhaler"),
     ("D", "Evaluating whether a client's pain has responded to analgesia"),
     ("E", "Transporting a stable client to the radiology department"),
     ("F", "Performing the admission assessment")],
    ["A", "C", "D", "F"],
    "Plan, teach, evaluate and assess are the four RN verbs. Recording intake "
    "and transporting a stable client are routine tasks a UAP may carry out.",
    {"A": "Correct — care planning is RN work.",
     "B": "Incorrect — recording intake may be delegated.",
     "C": "Correct — teaching cannot be delegated, only reinforced.",
     "D": "Correct — evaluation is RN work.",
     "E": "Incorrect — transporting a stable client may be delegated.",
     "F": "Correct — admission assessment is RN work."},
    difficulty="Medium", topic="Delegation", subtopic="Mixed",
    tags=("delegation", "scope-of-practice")))

MOCK.append(mcq(
    "An emergency department is receiving casualties from a building "
    "collapse. Which casualty should be tagged for treatment LAST?",
    [("A", "A casualty with an open femur fracture, alert, pulse 118"),
     ("B", "A casualty who is breathing at 8 breaths per minute with fixed "
           "and dilated pupils"),
     ("C", "A casualty with partial-thickness burns to both forearms"),
     ("D", "A casualty with an obvious wrist fracture, walking and talking")],
    "B",
    "Fixed and dilated pupils earn a black tag even when the casualty is "
    "still breathing. In a mass-casualty incident, resources go to those who "
    "can be saved. The walking wounded are treated last among the LIVING, but "
    "the expectant casualty is treated after them.",
    {"A": "Incorrect — urgent and salvageable.",
     "B": "Correct — fixed and dilated pupils means expectant, black tag.",
     "C": "Incorrect — treatable, and not immediately life-threatening.",
     "D": "Incorrect — minor injury, but still ahead of an expectant casualty."},
    difficulty="Hard", subtopic="Mixed", tags=("triage", "disaster")))

MOCK.append(mcq(
    "Which client is the LOWEST priority for the nurse to assess?",
    [("A", "A client with sickle cell disease reporting the joint pain typical "
           "of their usual crises, admitted two days ago"),
     ("B", "A client with a new onset of slurred speech"),
     ("C", "A client whose urine output has fallen to 15 mL/hour"),
     ("D", "A client whose oxygen saturation has dropped from 96% to 88%")],
    "A",
    "The sickle cell client's pain is expected for their diagnosis, unchanged, "
    "and they were admitted more than 24 hours ago — three stability markers. "
    "The other three all describe a change from baseline.",
    {"A": "Correct — expected, unchanged, and settled.",
     "B": "Incorrect — new slurred speech is a brain finding and highly urgent.",
     "C": "Incorrect — falling urine output is a change.",
     "D": "Incorrect — a dropping saturation is a change."},
    difficulty="Medium", subtopic="Mixed", tags=("prioritization", "stability")))

MOCK.append(mcq(
    "A nurse observes a student nurse about to disconnect a client's oxygen "
    "to take them for a walk. The client has an oxygen saturation of 89% on "
    "2 L/min. What should the nurse do?",
    [("A", "Report the student to the clinical instructor after the shift"),
     ("B", "Intervene immediately and take over the client's care"),
     ("C", "Allow the walk and monitor the client closely"),
     ("D", "Document the student's behaviour in the client's record")],
    "B",
    "Nothing illegal is happening, but the client is about to come to "
    "immediate physical harm. Immediate harm means confront and take over now, "
    "not report later.",
    {"A": "Incorrect — the harm would happen before the shift ends.",
     "B": "Correct — immediate harm, so intervene now.",
     "C": "Incorrect — a saturation of 89% off oxygen is not safe to trial.",
     "D": "Incorrect — staff conduct never goes in a client's record."},
    difficulty="Medium", topic="Staff management", subtopic="Mixed",
    tags=("staff-management", "safety")))

MOCK.append(sata(
    "Which clients should the nurse classify as UNSTABLE? Select all that apply.",
    [("A", "A client 4 hours after a general anaesthetic"),
     ("B", "A client with a haemoglobin of 10.2 g/dL and no active bleeding"),
     ("C", "A client whose blood glucose is 2.8 mmol/L"),
     ("D", "A client with COPD whose breathlessness is unchanged from admission"),
     ("E", "A client admitted 90 minutes ago with chest pain"),
     ("F", "A client with a chronic leg ulcer being discharged this afternoon")],
    ["A", "C", "E"],
    "Within 12 hours of general anaesthesia, hypoglycaemia, and admission "
    "under 24 hours with an acute complaint all indicate instability. A "
    "haemoglobin of 10.2 is a mild abnormality, unchanged breathlessness in "
    "COPD is expected, and a client going home today is stable.",
    {"A": "Correct — inside the 12-hour anaesthetic window.",
     "B": "Incorrect — haemoglobin 8 to 11 is a mild derangement.",
     "C": "Correct — hypoglycaemia is always unstable.",
     "D": "Incorrect — unchanged and expected.",
     "E": "Correct — newly admitted with an acute complaint.",
     "F": "Incorrect — ready for discharge."},
    difficulty="Medium", subtopic="Mixed", tags=("prioritization", "stability")))

MOCK.append(mcq(
    "A registered nurse is assigning clients to an LPN. Which client is the "
    "most appropriate assignment?",
    [("A", "A client admitted an hour ago requiring an admission assessment"),
     ("B", "A client requiring their first dose of IV antibiotics"),
     ("C", "A client with stable heart failure requiring a routine dressing "
           "change the RN performed yesterday"),
     ("D", "A client requiring teaching before discharge tomorrow")],
    "C",
    "The LPN may repeat a task the RN has already performed once, on a stable "
    "client. Admission assessment, IV medication and teaching are all outside "
    "LPN scope.",
    {"A": "Incorrect — admission assessments belong to the RN.",
     "B": "Incorrect — LPNs cannot hang or push IV medications.",
     "C": "Correct — stable client, and not the first of anything.",
     "D": "Incorrect — LPNs reinforce teaching, they do not deliver it."},
    difficulty="Medium", topic="Delegation", subtopic="Mixed",
    tags=("delegation", "assignment")))

MOCK.append(mcq(
    "Four clients are waiting. Applying the organ tie-breaker, which client "
    "should the nurse see first?",
    [("A", "A client with hepatitis whose modifying phrase describes new confusion"),
     ("B", "A client with heart failure whose modifying phrase describes a new murmur"),
     ("C", "A client with nephrotic syndrome whose modifying phrase describes new oedema"),
     ("D", "A client with pancreatitis whose modifying phrase describes new nausea")],
    "A",
    "All four have an unexpected change, so the tie-breaker decides. The "
    "organs named in the modifying phrases are brain (confusion), heart "
    "(murmur), kidney (oedema) and pancreas (nausea). Brain ranks first.",
    {"A": "Correct — confusion is a brain finding, and brain ranks first.",
     "B": "Incorrect — heart ranks third.",
     "C": "Incorrect — kidney ranks fifth.",
     "D": "Incorrect — pancreas ranks last."},
    difficulty="Hard", subtopic="Mixed", tags=("prioritization", "tie-breaker")))


# ================================================================ QUIZZES

QUIZZES = []

def quiz(quiz_id, title, description, kind, mode, items,
         duration_seconds=None, pass_score=None, tags=()):
    QUIZZES.append({
        "quiz_id": quiz_id, "title": title, "description": description,
        "quiz_kind": kind, "mode": mode, "items": items,
        "duration_seconds": duration_seconds, "pass_score": pass_score,
        "tags": list(tags),
    })

quiz("66000000-0000-4000-8000-000000000001",
     "Module 1 drill — what the question is asking",
     "Six items on reading the stem, stripping an answer choice, and spotting "
     "which end of the priority list you are being asked for.",
     "PRACTICE", "UNTIMED_LEARNING", M1,
     tags=("prioritization", "crash-course"))

quiz("66000000-0000-4000-8000-000000000002",
     "Module 2 drill — the four rules",
     "Seven items on acute over chronic, the 12-hour post-operative window, "
     "and the organ tie-breaker.",
     "PRACTICE", "UNTIMED_LEARNING", M2,
     tags=("prioritization", "crash-course"))

quiz("66000000-0000-4000-8000-000000000003",
     "Module 3 drill — stable or unstable",
     "Eight items on the vocabulary of instability, the four findings that "
     "always override 'expected', and triage.",
     "PRACTICE", "UNTIMED_LEARNING", M3,
     tags=("prioritization", "stability", "crash-course"))

quiz("66000000-0000-4000-8000-000000000004",
     "Module 4 drill — delegation",
     "Eight items on LPN scope, UAP scope, the first-of-anything rule, and "
     "what a family member may and may not be asked to hold.",
     "PRACTICE", "UNTIMED_LEARNING", M4,
     tags=("delegation", "crash-course"))

quiz("66000000-0000-4000-8000-000000000005",
     "Module 5 drill — staff management",
     "Six items on the four possible responses to a colleague's mistake, and "
     "the worst-consequences test.",
     "PRACTICE", "UNTIMED_LEARNING", M5,
     tags=("staff-management", "crash-course"))

quiz("66000000-0000-4000-8000-000000000006",
     "Final mock — prioritization and delegation",
     "Eight fresh items you have not seen in the module drills, sat under "
     "exam conditions: timed, sequential, no going back. 20 minutes.",
     "MOCK", "TIMED_SEQUENTIAL", MOCK,
     duration_seconds=1200, pass_score=0.7,
     tags=("prioritization", "delegation", "mock", "crash-course"))


# ================================================================ PROGRAMME
#
# Self-paced: no cohorts, no live sessions, no checklist rows. The student
# reads the template curriculum directly, in their own time.
#
# Deterministic UUIDs:
#   60…  programme   61…  units   62…  blocks   63…  activities
#   64…  attachments 65…  notes   66…  quizzes  68…  payment strategy

# Existing library notes this course reuses. A note can sit in more than
# one programme — that is the point of the shared library.
NOTE_ABC        = "e3eb4c15-3aec-46cd-b0d5-992651f4fe39"  # ABC priority hierarchy
NOTE_MASLOW     = "59c113e5-0fcd-4d04-ad1a-1d91d222a203"  # Maslow's hierarchy on NCLEX
NOTE_DELEGATION = "55000000-0000-4000-8000-000000000002"  # Delegation: who can do what

UNITS = [
    (1, "What the question is actually asking",
     "Before any rules: work out whether the item wants your sickest client "
     "or your healthiest one, and learn to strip an answer choice to the part "
     "that decides it."),
    (2, "The four rules",
     "Acute over chronic, fresh post-op over everything else, unstable over "
     "stable — and the organ tie-breaker for when those three leave you stuck."),
    (3, "Stable or unstable",
     "The vocabulary the exam uses instead of the words themselves, the four "
     "findings that always override 'expected', and how triage inverts your "
     "instincts."),
    (4, "Delegation",
     "What an LPN cannot do, what a UAP cannot do, and the one thing that "
     "turns a family member from a wrong answer into a right one."),
    (5, "Staff management, and putting it together",
     "The four responses to a colleague's mistake, the worst-consequences "
     "test, and a timed mock across everything."),
]

BLOCKS = [
    (1, "Learn", "Read this first. Each module is one sitting — twenty to "
                 "thirty minutes of reading, then the drill."),
    (2, "Drill", "Answer these straight after the reading, while the "
                 "framework is still in your head. Rationales appear as you "
                 "go, so read every one."),
]

# (unit, block, ordinal, type, title, description, note, payload_extra)
# payload_extra: for LIBRARY_NOTE / SHELF the pointer lives in ATTACH below.
ACTIVITIES = [
    # ---- Module 1
    (1, 1, 1, "TEXT", "How to use this crash course",
     "What the five modules cover, how long it takes, and the one habit that "
     "makes the difference.",
     "Two minutes. Read it before anything else.",
     {"body":
      "This is a short course with one job: to make prioritization and "
      "delegation questions stop being a guess.\n\n"
      "There are five modules. Each one is a single sitting — read the notes, "
      "then do the drill straight afterwards while the framework is still in "
      "your head. Do not read all five and then drill all five; the point is "
      "to use each rule while it is fresh.\n\n"
      "The drills run in learning mode, which means the rationale appears as "
      "soon as you answer. Read it every time, including on the questions you "
      "got right — half the value is in confirming you got it right for the "
      "right reason.\n\n"
      "The final mock is different. It is timed, sequential, and you cannot "
      "go back. Eight questions you have not seen before, twenty minutes. Sit "
      "it in one uninterrupted block and treat the score as information, not "
      "a verdict.\n\n"
      "One habit, if you take nothing else from this course: read the "
      "question before you read the answer choices, and decide whether it "
      "wants your sickest client or your healthiest one. More marks are lost "
      "there than anywhere else in this section.",
      "estimated_minutes": 3}),
    (1, 1, 2, "LIBRARY_NOTE", "What a prioritization question is actually asking",
     "The sickest-or-healthiest fork, the four parts of an answer choice, and "
     "why the modifying phrase beats the diagnosis.",
     "The core note of the whole course. Do not skim it.", {}),
    (1, 1, 3, "LIBRARY_NOTE", "ABC priority hierarchy",
     "Airway, breathing, circulation — the fallback when two clients cannot "
     "be separated any other way.", None, {}),
    (1, 1, 4, "LIBRARY_NOTE", "Maslow's hierarchy on NCLEX",
     "Where Maslow genuinely applies, and the far more common case where ABC "
     "overrides it.", None, {}),
    (1, 2, 1, "PRACTICE_QUIZ", "Module 1 drill — what the question is asking",
     "Six items. Untimed, with rationales as you go.",
     "Do this straight after the reading.",
     {"quiz_id": "66000000-0000-4000-8000-000000000001"}),

    # ---- Module 2
    (2, 1, 1, "LIBRARY_NOTE", "The four prioritization rules",
     "Acute beats chronic, fresh post-op beats everything, unstable beats "
     "stable, and the organ tie-breaker.",
     "Learn the organ order cold — brain, lung, heart, liver, kidney, pancreas.", {}),
    (2, 2, 1, "PRACTICE_QUIZ", "Module 2 drill — the four rules",
     "Seven items across all four rules.", None,
     {"quiz_id": "66000000-0000-4000-8000-000000000002"}),

    # ---- Module 3
    (3, 1, 1, "LIBRARY_NOTE", "Stable or unstable: the word list",
     "The vocabulary that decides rule 3, the four always-unstable findings, "
     "and mass-casualty triage.",
     "The word list is the part to memorise. Everything else follows from it.", {}),
    (3, 2, 1, "PRACTICE_QUIZ", "Module 3 drill — stable or unstable",
     "Eight items on stability, lab values and triage.", None,
     {"quiz_id": "66000000-0000-4000-8000-000000000003"}),

    # ---- Module 4
    (4, 1, 1, "LIBRARY_NOTE", "Delegation: who can do what",
     "Scope boundaries for RN, LPN/LVN and UAP, and the five rights of "
     "delegation.", None, {}),
    (4, 1, 2, "LIBRARY_NOTE",
     "What you can hand to an LPN, a UAP, and a family member",
     "The nine LPN restrictions, the four UAP restrictions, the "
     "first-of-anything rule, and where families fit.",
     "Read this one after the general delegation note — it goes deeper.", {}),
    (4, 2, 1, "PRACTICE_QUIZ", "Module 4 drill — delegation",
     "Eight items on scope, the first-of-anything rule, and families.", None,
     {"quiz_id": "66000000-0000-4000-8000-000000000004"}),

    # ---- Module 5
    (5, 1, 1, "LIBRARY_NOTE", "When a colleague does something wrong",
     "Four possible responses, the two questions that pick between them, and "
     "the worst-consequences test.",
     "'Ignore it' is never the answer. That alone removes one option every time.", {}),
    (5, 2, 1, "PRACTICE_QUIZ", "Module 5 drill — staff management",
     "Six items on responding to a colleague's mistake.", None,
     {"quiz_id": "66000000-0000-4000-8000-000000000005"}),
    (5, 2, 2, "MOCK", "Final mock — prioritization and delegation",
     "Eight fresh items under exam conditions: timed, sequential, no going "
     "back. Twenty minutes.",
     "Sit this in one uninterrupted block. Nothing here appeared in the drills.",
     {"quiz_id": "66000000-0000-4000-8000-000000000006"}),
    (5, 2, 3, "TEXT", "Where to go next",
     "What to do with your mock score, and how this framework carries into "
     "the rest of your revision.",
     None,
     {"body":
      "However the mock went, the framework is now yours to use. A few "
      "things worth knowing before you move on.\n\n"
      "IF YOU SCORED WELL. Good — but do not assume prioritization is "
      "finished. The rules are easy to apply when you know a question is "
      "about prioritization. The difficulty on the real exam is that nothing "
      "announces itself. Keep applying the sickest-or-healthiest check to "
      "every item that lists more than one client, wherever it appears.\n\n"
      "IF YOU DID NOT. Look at which module the wrong answers came from "
      "rather than at the total. Missing the stability items means going back "
      "to the word list in module 3. Missing the delegation items means the "
      "scope boundaries in module 4, which are pure memorisation and "
      "therefore fixable in an evening. Missing the module 1 items is the "
      "most important signal of all — it means you are still deciding what "
      "the question asked after you have read the choices.\n\n"
      "WHAT THIS DOES NOT COVER. This is a crash course on one section. It "
      "does not teach you pharmacology, lab values, or maternity — and "
      "prioritization questions draw on all of those, because you cannot rank "
      "two clients whose conditions you do not recognise. The framework tells "
      "you what to do with clinical knowledge; it does not replace it.\n\n"
      "REDO THE DRILLS. They are untimed and unlimited. Coming back to them "
      "in a week, cold, is worth more than reading the notes a second time.",
      "estimated_minutes": 4}),
]

# (unit, block, ordinal) -> note_id  (all loose notes; no shelves here)
ATTACH = {
    (1, 1, 2): "65000000-0000-4000-8000-000000000001",
    (1, 1, 3): NOTE_ABC,
    (1, 1, 4): NOTE_MASLOW,
    (2, 1, 1): "65000000-0000-4000-8000-000000000002",
    (3, 1, 1): "65000000-0000-4000-8000-000000000003",
    (4, 1, 1): NOTE_DELEGATION,
    (4, 1, 2): "65000000-0000-4000-8000-000000000004",
    (5, 1, 1): "65000000-0000-4000-8000-000000000005",
}

PROGRAMME_DESCRIPTION = (
    "There will be at least fifteen prioritization and delegation questions "
    "on your exam, and most candidates guess at every one of them. They are "
    "the most guessable questions on the paper and the most learnable — the "
    "rules are short, they are fixed, and they do not require you to know "
    "more medicine than you already do.\n\n"
    "This is a short, self-paced course covering exactly that section. Five "
    "modules, each one a single sitting: read the notes, then drill them "
    "while the framework is still in your head. There is a timed mock at the "
    "end made of questions you have not seen.\n\n"
    "What you will come away with: how to tell whether an item wants your "
    "sickest client or your healthiest one; how to strip an answer choice "
    "down to the part that decides it; the four ranking rules and the organ "
    "tie-breaker for when they run out; the vocabulary that separates a "
    "stable client from an unstable one; what an LPN, a UAP and a family "
    "member may each be given; and what to do when a colleague does "
    "something they should not have.\n\n"
    "Who this is for: anyone sitting NCLEX-RN who loses marks on "
    "\"which client would you see first\". You can take it at any point in "
    "your preparation — early, so you drill the rest of your revision with "
    "the framework already in place, or late, as a targeted repair. It "
    "assumes you have basic clinical knowledge; it teaches you what to do "
    "with it.\n\n"
    "Self-paced, so there are no live sessions and no fixed dates. Ninety "
    "days of access from the day you enrol."
)


# ================================================================ EMITTER

def sql_str(s):
    return "'" + s.replace("'", "''") + "'" if s is not None else "NULL"

def sql_arr(items):
    if not items:
        return "'{}'"
    return "ARRAY[" + ", ".join(sql_str(i) for i in items) + "]::text[]"

def jsonb(obj):
    return "$j$" + json.dumps(obj, ensure_ascii=False) + "$j$::jsonb"

def uid(prefix, *parts):
    """prefix + 12 hex digits built from 4-digit zero-padded parts."""
    tail = "".join(f"{n:04d}" for n in parts)
    assert len(tail) == 12, tail
    return f"{prefix}-0000-4000-8000-{tail}"


def main():
    o = []
    A = o.append

    A("-- db/seed/pitch/03-crash-course.sql")
    A("-- GENERATED by db/seed/pitch/build_crash_course.py — edit the generator,")
    A("-- not this file.")
    A("--")
    A('-- The self-paced "NCLEX Prioritization Crash Course": 5 modules, '
      f"{len(NOTES)} new library")
    A(f"-- notes (plus 3 reused from the shared library), {len(QUESTIONS)} tutor "
      f"questions and")
    A(f"-- {len(QUIZZES)} quizzes.")
    A("--")
    A("-- Source: Mark Klimek's Lecture 12 (Prioritization, Delegation and Staff")
    A("-- Management). His framework; the scenarios and every quiz item are new.")
    A("--")
    A(f"-- Tutor: {TUTOR_ID} (mybackpacc+mynclextutor@gmail.com)")
    A("--")
    A("-- Self-paced, so there are NO cohorts, no live sessions and no checklist")
    A("-- rows — the student reads the template curriculum directly.")
    A("--")
    A("-- Idempotent: every INSERT carries ON CONFLICT DO UPDATE / DO NOTHING.")
    A("")
    A("BEGIN;")
    A("")

    # ---------------------------------------------------------- 1. notes
    A("-- " + "=" * 68)
    A("-- 1. Library notes — the five new ones")
    A("-- " + "=" * 68)
    A("")
    rows = []
    for n in NOTES:
        rows.append(
            f"  -- {n['title']}\n"
            f"  ({sql_str(n['note_id'])}, {sql_str(TUTOR_ID)},\n"
            f"   {sql_str(n['title'])},\n"
            f"   {sql_str(n['subtitle'])},\n"
            f"   {jsonb(n['body'])},\n"
            f"   {sql_arr(n['tags'])}, {sql_arr(n['pillars'])}, TRUE, 'TUTOR_WIDE')")
    A("INSERT INTO nclex_tutor_library_notes\n"
      "  (note_id, tutor_id, title, subtitle, body, tags, pillars,\n"
      "   is_published, visibility_mode)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (note_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,\n"
      "  body = EXCLUDED.body, tags = EXCLUDED.tags,\n"
      "  pillars = EXCLUDED.pillars, is_published = TRUE,\n"
      "  version_id = gen_random_uuid(), updated_at = NOW();")
    A("")

    # ------------------------------------------------------ 2. questions
    A("-- " + "=" * 68)
    A(f"-- 2. Tutor questions — {len(QUESTIONS)} items")
    A("-- " + "=" * 68)
    A("-- marks mirror lib/scoring/computeMarksFromKey: 1 for a single-answer")
    A("-- item, one mark per correct option for SATA / SELECT_N.")
    A("")
    # Emitted in batches so each statement stays a readable size.
    BATCH = 6
    for start in range(0, len(QUESTIONS), BATCH):
        batch = QUESTIONS[start:start + BATCH]
        rows = []
        for q in batch:
            rows.append(
                f"  ({sql_str(q['item_id'])}, {sql_str(TUTOR_ID)}, {sql_str(q['question_type'])},\n"
                f"   {sql_str(q['stem'])},\n"
                f"   {sql_str(q['rationale'])},\n"
                f"   {jsonb(q['content'])},\n"
                f"   {jsonb(q['correct'])},\n"
                f"   {sql_str(q['topic'])}, {sql_str(q['subtopic'])}, {sql_str(q['difficulty'])},\n"
                f"   {sql_arr(q['tags'])}, {q['marks']})")
        A(f"-- items {batch[0]['item_id']} .. {batch[-1]['item_id']}")
        A("INSERT INTO nclex_tutor_questions\n"
          "  (item_id, tutor_id, question_type, stem, rationale, content, correct,\n"
          "   topic, subtopic, difficulty, tags, marks)\n"
          "VALUES\n" + ",\n".join(rows) + "\n"
          "ON CONFLICT (item_id) DO UPDATE SET\n"
          "  question_type = EXCLUDED.question_type, stem = EXCLUDED.stem,\n"
          "  rationale = EXCLUDED.rationale, content = EXCLUDED.content,\n"
          "  correct = EXCLUDED.correct, topic = EXCLUDED.topic,\n"
          "  subtopic = EXCLUDED.subtopic, difficulty = EXCLUDED.difficulty,\n"
          "  tags = EXCLUDED.tags, marks = EXCLUDED.marks,\n"
          "  is_published = TRUE, updated_at = NOW();")
        A("")
    A("UPDATE nclex_tutor_questions SET\n"
      "  client_needs_category = 'Management of Care',\n"
      "  nursing_subject = 'Fundamentals',\n"
      "  is_published = TRUE, is_builder_visible = TRUE\n"
      "WHERE item_id IN (\n  "
      + ",\n  ".join(sql_str(q["item_id"]) for q in QUESTIONS) + "\n);")
    A("")

    # -------------------------------------------------------- 3. quizzes
    A("-- " + "=" * 68)
    A(f"-- 3. Quizzes — {len(QUIZZES)} ({sum(1 for q in QUIZZES if q['quiz_kind'] == 'PRACTICE')} practice drills, "
      f"{sum(1 for q in QUIZZES if q['quiz_kind'] == 'MOCK')} mock)")
    A("-- " + "=" * 68)
    A("")
    for z in QUIZZES:
        dur = z["duration_seconds"] if z["duration_seconds"] is not None else "NULL"
        ps = z["pass_score"] if z["pass_score"] is not None else "NULL"
        A(f"-- {z['title']} ({len(z['items'])} items)")
        A("INSERT INTO nclex_tutor_quizzes\n"
          "  (quiz_id, tutor_id, title, description, quiz_kind, mode,\n"
          "   duration_seconds, pass_score, max_attempts, status, tags)\n"
          "VALUES (\n"
          f"  {sql_str(z['quiz_id'])}, {sql_str(TUTOR_ID)},\n"
          f"  {sql_str(z['title'])},\n"
          f"  {sql_str(z['description'])},\n"
          f"  {sql_str(z['quiz_kind'])}, {sql_str(z['mode'])},\n"
          f"  {dur}, {ps}, NULL, 'PUBLISHED',\n"
          f"  {sql_arr(z['tags'])}\n"
          ")\n"
          "ON CONFLICT (quiz_id) DO UPDATE SET\n"
          "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
          "  quiz_kind = EXCLUDED.quiz_kind, mode = EXCLUDED.mode,\n"
          "  duration_seconds = EXCLUDED.duration_seconds,\n"
          "  pass_score = EXCLUDED.pass_score, tags = EXCLUDED.tags,\n"
          "  status = 'PUBLISHED', updated_at = NOW();")
        rows = ",\n".join(
            f"  ({sql_str(z['quiz_id'])}, {i}, {sql_str(item)})"
            for i, item in enumerate(z["items"], start=1))
        A("INSERT INTO nclex_tutor_quiz_items (quiz_id, position, item_id)\nVALUES\n"
          + rows + "\n"
          "ON CONFLICT (quiz_id, item_id) DO UPDATE SET position = EXCLUDED.position;")
        A("")

    # ------------------------------------------------------ 4. programme
    A("-- " + "=" * 68)
    A("-- 4. Programme, modules, blocks")
    A("-- " + "=" * 68)
    A("-- The AFTER INSERT trigger nclex_programmes_seed_units_trg creates")
    A("-- length_units blank units with random ids on every programme INSERT;")
    A("-- they collide with deterministic ones on (programme_id, unit_index).")
    A("-- Drop the trigger's rows before inserting ours. On a re-run there is")
    A("-- nothing to drop — the INSERT hits ON CONFLICT and the trigger never fires.")
    A("")
    A("INSERT INTO nclex_programmes (\n"
      "  programme_id, tutor_id, title, tagline, description,\n"
      "  delivery_mode, unit_label, length_units,\n"
      "  price_currency, show_price_publicly, payment_collection_mode,\n"
      "  access_window_days, payment_gates_access, status, published_at\n"
      ") VALUES (\n"
      f"  {sql_str(PROGRAMME_ID)}, {sql_str(TUTOR_ID)},\n"
      "  'NCLEX Prioritization Crash Course',\n"
      "  'Five short modules on the section most candidates guess at — "
      "prioritization, delegation and staff management.',\n"
      f"  {sql_str(PROGRAMME_DESCRIPTION)},\n"
      f"  'SELF_PACED', 'MODULE', {len(UNITS)},\n"
      "  'GHS', TRUE, 'ON_PLATFORM',\n"
      "  90, TRUE, 'PUBLISHED', NOW()\n"
      ")\n"
      "ON CONFLICT (programme_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, tagline = EXCLUDED.tagline,\n"
      "  description = EXCLUDED.description,\n"
      "  delivery_mode = EXCLUDED.delivery_mode, unit_label = EXCLUDED.unit_label,\n"
      "  length_units = EXCLUDED.length_units,\n"
      "  access_window_days = EXCLUDED.access_window_days,\n"
      "  status = EXCLUDED.status, updated_at = NOW();")
    A("")
    A("INSERT INTO nclex_programme_payment_strategies (\n"
      "  strategy_id, programme_id, kind, label,\n"
      "  total_price_minor, initial_price_minor, is_active, sort_order\n"
      ") VALUES (\n"
      "  '68000000-0000-4000-8000-000000000001',\n"
      f"  {sql_str(PROGRAMME_ID)},\n"
      "  'UPFRONT_FULL', 'Pay in full',\n"
      "  30000, 30000, TRUE, 1\n"
      ")\n"
      "ON CONFLICT (strategy_id) DO UPDATE SET\n"
      "  label = EXCLUDED.label,\n"
      "  total_price_minor = EXCLUDED.total_price_minor,\n"
      "  initial_price_minor = EXCLUDED.initial_price_minor,\n"
      "  is_active = TRUE, updated_at = NOW();")
    A("")
    A("DELETE FROM nclex_programme_units\n"
      f"WHERE  programme_id = {sql_str(PROGRAMME_ID)}\n"
      "  AND  unit_id::text NOT LIKE '61000000-0000-4000-8000-%';")
    A("")

    rows = []
    for idx, title, desc in UNITS:
        rows.append(f"  ({sql_str(uid('61000000', 0, 0, idx))}, {sql_str(PROGRAMME_ID)}, {idx},\n"
                    f"   {sql_str(title)},\n"
                    f"   {sql_str(desc)}, TRUE)")
    A("INSERT INTO nclex_programme_units\n"
      "  (unit_id, programme_id, unit_index, title, description, is_published)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (unit_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
      "  is_published = TRUE, updated_at = NOW();")
    A("")

    rows = []
    for idx, _, _ in UNITS:
        for b_ord, b_title, b_desc in BLOCKS:
            rows.append(
                f"  ({sql_str(uid('62000000', idx, b_ord, 0))}, "
                f"{sql_str(uid('61000000', 0, 0, idx))}, NULL, {b_ord},\n"
                f"   {sql_str(b_title)}, {sql_str(b_desc)}, TRUE)")
    A("INSERT INTO nclex_programme_blocks\n"
      "  (block_id, unit_id, cohort_id, ordinal, title, description, is_published)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (block_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
      "  is_published = TRUE, updated_at = NOW();")
    A("")

    # ----------------------------------------------------- 5. activities
    A("-- " + "=" * 68)
    A(f"-- 5. Activities — {len(ACTIVITIES)} leaves")
    A("-- " + "=" * 68)
    A("-- LIBRARY_NOTE carries an EMPTY payload by design: the pointer lives in")
    A("-- the attachment row below (slice 11.11).")
    A("")
    rows = []
    for (u, blk, ordn, typ, title, desc, note_txt, payload) in ACTIVITIES:
        rows.append(
            f"  ({sql_str(uid('63000000', u, blk, ordn))},\n"
            f"   {sql_str(uid('61000000', 0, 0, u))},\n"
            f"   {sql_str(uid('62000000', u, blk, 0))}, NULL, {ordn},\n"
            f"   {sql_str(typ)}, {sql_str(title)},\n"
            f"   {sql_str(desc)},\n"
            f"   {sql_str(note_txt)},\n"
            f"   {jsonb(payload)}, TRUE)")
    A("INSERT INTO nclex_programme_activities\n"
      "  (activity_id, unit_id, block_id, cohort_id, ordinal,\n"
      "   type, title, description, note, payload, is_published)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (activity_id) DO UPDATE SET\n"
      "  ordinal = EXCLUDED.ordinal, type = EXCLUDED.type,\n"
      "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
      "  note = EXCLUDED.note, payload = EXCLUDED.payload,\n"
      "  is_published = TRUE, updated_at = NOW();")
    A("")

    # ---------------------------------------------------- 6. attachments
    A("-- " + "=" * 68)
    A(f"-- 6. Library-note attachments — {len(ATTACH)} pointer rows")
    A("-- " + "=" * 68)
    A("")
    rows = []
    for (u, blk, ordn), note_id in ATTACH.items():
        rows.append(
            f"  ({sql_str(uid('64000000', u, blk, ordn))},\n"
            f"   {sql_str(uid('63000000', u, blk, ordn))},\n"
            f"   {sql_str(note_id)}, NULL, {sql_str(PROGRAMME_ID)},\n"
            f"   {sql_str(uid('61000000', 0, 0, u))},\n"
            f"   {sql_str(uid('62000000', u, blk, 0))}, {ordn})")
    A("INSERT INTO nclex_tutor_library_note_attachments\n"
      "  (attachment_id, activity_id, note_id, shelf_id, programme_id,\n"
      "   unit_id, block_id, position)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (attachment_id) DO UPDATE SET\n"
      "  note_id = EXCLUDED.note_id, unit_id = EXCLUDED.unit_id,\n"
      "  block_id = EXCLUDED.block_id, position = EXCLUDED.position;")
    A("")

    # ------------------------------------------------ 7. quiz membership
    A("-- " + "=" * 68)
    A("-- 7. Programme-level quiz membership")
    A("-- " + "=" * 68)
    A("-- Normally written by the activity-save auto-mirror. Seeding the")
    A("-- activities directly bypasses that action, so the rows are written")
    A("-- here — without them the programme's Quizzes tab is empty and the")
    A("-- student read path keyed on quiz_id finds nothing.")
    A("")
    A("INSERT INTO nclex_programme_quizzes (programme_id, quiz_id)\n"
      "SELECT DISTINCT u.programme_id, (a.payload->>'quiz_id')::uuid\n"
      "FROM   nclex_programme_activities a\n"
      "JOIN   nclex_programme_units u ON u.unit_id = a.unit_id\n"
      f"WHERE  u.programme_id = {sql_str(PROGRAMME_ID)}\n"
      "  AND  a.payload->>'quiz_id' IS NOT NULL\n"
      "ON CONFLICT (programme_id, quiz_id) DO NOTHING;")
    A("")
    A("COMMIT;")
    A("")

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "03-crash-course.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(o))
    print(f"wrote {path}")
    print(f"  notes      {len(NOTES)}")
    print(f"  questions  {len(QUESTIONS)}")
    print(f"  quizzes    {len(QUIZZES)}  ({sum(len(z['items']) for z in QUIZZES)} quiz-item rows)")
    print(f"  units      {len(UNITS)}")
    print(f"  blocks     {len(UNITS) * len(BLOCKS)}")
    print(f"  activities {len(ACTIVITIES)}")
    print(f"  attachments{len(ATTACH):>3}")


if __name__ == "__main__":
    main()
