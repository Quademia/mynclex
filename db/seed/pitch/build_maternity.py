#!/usr/bin/env python3
"""
Generates db/seed/pitch/08-maternity.sql — one body of maternity and
neonatology content, packaged three ways, plus a free live-events
programme.

THE POINT OF THIS SEED is not the content, it is the PACKAGING. A tutor
being pitched needs to see that the platform is not "a thing for running
8-week cohorts": the same six notes and one mock become a cheap revision
pack, a standalone mock, or a premium interactive course, depending only
on what the programme wraps.

  A  Maternity Revision Notes    the six notes, nothing else
  B  Maternity Mock Exam         one timed mock, nothing else
  C  Maternity — Learn by Doing  the notes + the mock, with the embedded
                                 questions doing the teaching
  D  Free Weekly NCLEX Q&A       no content at all — a cohort, a weekly
                                 live session, and the recordings

D is the shape a tutor recognises immediately: they already run a free
weekly Zoom, and this hosts it, records it, registers who came, and puts
their paid programmes one click away.

Source: Mark Klimek Lectures 10 and 11 (Maternity and Neonatology, Fetal
Complications). His framework — Naegele's rule, the weight-gain
shortcut, the ranges-of-values trick, VEAL CHOP, the postpartum trio.
Every scenario and question is written fresh.

EMBEDDED QUESTIONS: only MCQ / SATA / TF / SELECT_N are embeddable
(lib/library/types.ts EMBED_QUESTION_TYPES) — the NGN types are built
around partial credit the embed answer model does not capture, so they
belong in quizzes. Caps are admin config: dev now allows 5 blocks per
note x 10 questions per block.

Run:  python3 db/seed/pitch/build_maternity.py
"""

import json
import os

TUTOR_ID = "4ed777d7-e4f7-403b-88f4-63ce5432d65e"

# ---------------------------------------------------------------- helpers

def t(s, *marks):
    n = {"type": "text", "text": s}
    if marks:
        n["marks"] = [{"type": m} for m in marks]
    return n

def p(*inline):
    c = [t(i) if isinstance(i, str) else i for i in inline]
    return {"type": "paragraph", "content": c} if c else {"type": "paragraph"}

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
    c = [t(i) if isinstance(i, str) else i for i in inline]
    return {"type": "callout", "attrs": {"tone": tone}, "content": c}

def table(title, columns, rows):
    return {"type": "lab_values", "attrs": {
        "title": title,
        "columns": [{"label": c} for c in columns],
        "rows": [list(r) for r in rows]}}

def embed(block_id, title, item_ids):
    """A practice checkpoint inside a note (slice 11.15)."""
    return {"type": "embedded_questions", "attrs": {
        "id": block_id, "title": title,
        "item_ids": list(item_ids), "source": "TUTOR"}}

def doc(*blocks):
    return {"type": "doc", "content": list(blocks)}

def b(s):
    return t(s, "bold")


# ================================================================ QUESTIONS

QUESTIONS = []
_N = {"MCQ": 200, "SATA": 200, "SN": 200, "TF": 200}
_PFX = {"MCQ": "MCQ", "SATA": "SATA", "SN": "SN", "TF": "TF"}
_TYPE = {"MCQ": "MCQ", "SATA": "SATA", "SN": "SELECT_N", "TF": "TF"}

def _mint(kind):
    _N[kind] += 1
    return f"NCLEX_TUT_{_PFX[kind]}_{_N[kind]:05d}"

def _add(kind, stem, options, answers, rationale, feedback,
         difficulty, topic, subtopic, tags, note_id, select_count=None):
    qt = _TYPE[kind]
    content = {"options": [{"id": i, "text": x} for i, x in options]}
    if select_count is not None:
        content["select_count"] = select_count
    if qt in ("SATA", "SELECT_N"):
        correct = {"answers": list(answers), "feedback": feedback}
        marks = len(answers)
    else:
        correct = {"answer": answers, "feedback": feedback}
        marks = 1
    item = {"item_id": _mint(kind), "question_type": qt, "stem": stem,
            "content": content, "correct": correct, "marks": marks,
            "rationale": rationale, "difficulty": difficulty, "topic": topic,
            "subtopic": subtopic, "tags": list(tags), "parent_note_id": note_id}
    QUESTIONS.append(item)
    return item["item_id"]

def mcq(stem, options, answer, rationale, feedback, difficulty="Medium",
        topic="Maternity", subtopic=None, tags=(), note_id=None):
    return _add("MCQ", stem, options, answer, rationale, feedback,
                difficulty, topic, subtopic, tags, note_id)

def tf(stem, answer, rationale, feedback, difficulty="Easy",
       topic="Maternity", subtopic=None, tags=(), note_id=None):
    return _add("TF", stem, [("A", "True"), ("B", "False")], answer,
                rationale, feedback, difficulty, topic, subtopic, tags, note_id)

def sata(stem, options, answers, rationale, feedback, difficulty="Medium",
         topic="Maternity", subtopic=None, tags=(), note_id=None):
    return _add("SATA", stem, options, answers, rationale, feedback,
                difficulty, topic, subtopic, tags, note_id)

def select_n(stem, options, answers, rationale, feedback, difficulty="Medium",
             topic="Maternity", subtopic=None, tags=(), note_id=None):
    return _add("SN", stem, options, answers, rationale, feedback,
                difficulty, topic, subtopic, tags, note_id,
                select_count=len(answers))


NOTES = []

def note(note_id, title, subtitle, tags, body):
    NOTES.append({"note_id": note_id, "title": title, "subtitle": subtitle,
                  "pillars": ["Health Promotion and Maintenance"],
                  "tags": tags, "body": body})


N1 = "75000000-0000-4000-8000-000000000001"
N2 = "75000000-0000-4000-8000-000000000002"
N3 = "75000000-0000-4000-8000-000000000003"
N4 = "75000000-0000-4000-8000-000000000004"
N5 = "75000000-0000-4000-8000-000000000005"
N6 = "75000000-0000-4000-8000-000000000006"


# ============================================================ NOTE 1 — dating

q1a = mcq("A client's last menstrual period began on 10 June. Using Naegele's rule, what is her estimated date of delivery?",
  [("A","17 March"),("B","3 March"),("C","17 September"),("D","10 March")], "A",
  "Naegele's rule: take the FIRST day of the last menstrual period, add 7 days, subtract 3 months. 10 June + 7 days = 17 June; 17 June minus 3 months = 17 March.",
  {"A":"Correct — add 7 days first, then subtract 3 months.",
   "B":"Incorrect — the 7 days were not added.",
   "C":"Incorrect — 3 months were added rather than subtracted.",
   "D":"Incorrect — the 7 days were not added."},
  difficulty="Easy", subtopic="Naegele's rule", tags=("maternity","dating"), note_id=N1)

q1b = mcq("A client is 28 weeks pregnant and has gained 22 lb. What is the nurse's best interpretation?",
  [("A","Within normal limits — no action needed"),
   ("B","About 3 lb above the expected gain — assess the client"),
   ("C","About 8 lb above the expected gain — a biophysical profile is indicated"),
   ("D","Below the expected gain — assess for undernutrition")], "B",
  "The shortcut is weeks of gestation minus 9: 28 - 9 = 19 lb expected. She is 3 lb over. A variance of 1-2 lb is normal, 3 lb warrants assessment, and 4 lb or more suggests real trouble and a biophysical profile.",
  {"A":"Incorrect — 3 lb over is outside the 1-2 lb normal band.",
   "B":"Correct — 22 against an expected 19. Assess.",
   "C":"Incorrect — that threshold is 4 lb or more.",
   "D":"Incorrect — she has gained more than expected, not less."},
  difficulty="Medium", subtopic="Weight gain", tags=("maternity","dating"), note_id=N1)

q1c = tf("Fundal height can be palpated abdominally before 12 weeks' gestation.", "B",
  "The fundus cannot be palpated abdominally until about week 12, when it sits midway between the symphysis pubis and the umbilicus. It reaches the umbilicus at 20-22 weeks.",
  {"A":"Incorrect — before 12 weeks the uterus is still behind the symphysis.",
   "B":"Correct — 12 weeks is the earliest it can be felt."},
  subtopic="Fundal height", tags=("maternity","dating"), note_id=N1)

q1d = mcq("A client attends her 12-week prenatal visit. When should the nurse schedule the next one?",
  [("A","In one week"),("B","In two weeks"),("C","In four weeks"),("D","In six weeks")], "C",
  "Monthly until 28 weeks, fortnightly from 28 to 36 weeks, then weekly from 36 weeks until delivery or week 42, whichever comes first. At 12 weeks she is still in the monthly phase.",
  {"A":"Incorrect — weekly visits start at 36 weeks.",
   "B":"Incorrect — fortnightly visits start at 28 weeks.",
   "C":"Correct — monthly until 28 weeks.",
   "D":"Incorrect — the interval never stretches to six weeks."},
  difficulty="Easy", subtopic="Prenatal schedule", tags=("maternity","dating"), note_id=N1)

note(N1, "Dating a pregnancy",
  "Naegele's rule, the weight-gain shortcut, fundal height and the visit schedule",
  ["maternity","dating","high-yield"],
  doc(
    p("Four small calculations that turn up constantly, and none of them is hard once you have the rule. This note is arithmetic, not physiology — learn the rules and the marks are free."),
    h(2,"Estimated date of delivery — Naegele's rule"),
    p("Take the ", b("first"), " day of the last menstrual period, add 7 days, subtract 3 months."),
    callout("memory","First day. Add seven. Back three months. The most common error is using the last day of the period, or subtracting before adding."),
    h(2,"Weight gain"),
    table("What she should have gained", ["Stage","Gain"],
      [["First trimester (12 weeks)","about 1 lb per month — 3 lb total"],
       ["Second and third trimesters","about 1 lb per week"],
       ["Whole pregnancy","28 lb, plus or minus 3 (so 25-31 lb)"]]),
    p("The long way works, but there is a shortcut that gets you there in one step: ", b("weeks of gestation minus 9"), " is roughly the expected gain in pounds."),
    table("What the variance means", ["Off the expected figure by","Do this"],
      [["1-2 lb","Nothing — within normal limits"],
       ["3 lb","Assess her"],
       ["4 lb or more","Trouble — biophysical profile on the fetus"]]),
    embed("emb-n1-a","Check yourself: dating and weight", [q1a, q1b]),
    h(2,"Fundal height"),
    ul("Not palpable at all until about 12 weeks — midway between symphysis pubis and umbilicus.",
       "At the umbilicus by 20-22 weeks."),
    p("Its value is that it tells you the trimester without a scan and without a history — useful in an unconscious client. A fundus much larger than the dates suggest can point to a molar pregnancy."),
    h(2,"The prenatal visit schedule"),
    ol("Monthly until 28 weeks","Every two weeks from 28 to 36 weeks",
       "Weekly from 36 weeks until delivery, or week 42 — whichever comes first"),
    callout("note","At 42 weeks the pregnancy is not allowed to continue: induction or caesarean."),
    embed("emb-n1-b","Check yourself: fundal height and visits", [q1c, q1d]),
  ))


# ============================================================ NOTE 2 — signs

q2a = sata("Which findings are POSITIVE signs of pregnancy? Select all that apply.",
  [("A","Fetal skeleton visible on x-ray"),("B","A positive urine hCG test"),
   ("C","Fetus visible on ultrasound"),("D","Fetal heart heard on Doppler"),
   ("E","The examiner palpates fetal movement"),("F","The mother reports feeling the baby move")],
  ["A","C","D","E"],
  "A positive sign is one only the fetus can produce and only an examiner can verify. hCG can be raised by other conditions including cancer, and movement felt by the MOTHER is subjective — it is the examiner palpating it that counts.",
  {"A":"Correct — only a fetus has a fetal skeleton.",
   "B":"Incorrect — hCG rises in other conditions too. Probable, not positive.",
   "C":"Correct.","D":"Correct.",
   "E":"Correct — examiner-palpated movement is objective.",
   "F":"Incorrect — the mother's report is subjective. Quickening is presumptive."},
  difficulty="Medium", subtopic="Signs of pregnancy", tags=("maternity","signs"), note_id=N2)

q2b = mcq("Which sign is the softening of the cervix?",
  [("A","Chadwick's sign"),("B","Goodell's sign"),("C","Hegar's sign"),("D","Braxton Hicks")], "B",
  "The three run in alphabetical order and travel upward through the anatomy: Chadwick (bluish discoloration of vulva, vagina and cervix), Goodell (cervix goes soft — Goodell, good and soft), Hegar (lower uterine segment softens).",
  {"A":"Incorrect — Chadwick's is the bluish colour change.",
   "B":"Correct — Goodell, good and soft.",
   "C":"Incorrect — Hegar's is softening of the lower uterine segment.",
   "D":"Incorrect — Braxton Hicks are practice contractions."},
  difficulty="Easy", subtopic="Signs of pregnancy", tags=("maternity","signs"), note_id=N2)

q2c = mcq("A nurse is asked at what gestation the fetal heart can FIRST be detected by Doppler. What is the best answer?",
  [("A","8 weeks"),("B","10 weeks"),("C","12 weeks"),("D","16 weeks")], "A",
  "The fetal heart is detectable between 8 and 12 weeks. 'First' asks for the EARLIEST end of the range, 'most likely' asks for the middle, and 'should be by' asks for the latest.",
  {"A":"Correct — 'first' means the earliest end of the range.",
   "B":"Incorrect — 10 weeks is the 'most likely' answer.",
   "C":"Incorrect — 12 weeks is the 'should be heard by' answer.",
   "D":"Incorrect — that is the quickening range."},
  difficulty="Hard", subtopic="Ranges of values", tags=("maternity","signs"), note_id=N2)

q2d = mcq("By what gestation should quickening have been felt?",
  [("A","16 weeks"),("B","18 weeks"),("C","20 weeks"),("D","24 weeks")], "C",
  "Quickening falls between 16 and 20 weeks. 'By' asks for the LATEST end of the range, so 20 weeks.",
  {"A":"Incorrect — 16 weeks answers 'when would she first'.",
   "B":"Incorrect — 18 weeks answers 'when would she most likely'.",
   "C":"Correct — 'by' takes the latest end.",
   "D":"Incorrect — outside the range."},
  difficulty="Medium", subtopic="Ranges of values", tags=("maternity","signs"), note_id=N2)

note(N2, "Positive, probable, presumptive",
  "The signs that prove a pregnancy — and the three-word trick for range questions",
  ["maternity","signs","high-yield"],
  doc(
    p("The exam cares about one distinction here: which findings PROVE a pregnancy, and which merely suggest one. Everything else is a distractor."),
    h(2,"Positive signs — only four"),
    ol("Fetal skeleton on x-ray","Fetus on ultrasound",
       "Fetal heart heard (Doppler)","The EXAMINER palpates fetal movement"),
    callout("critical","Note the fourth carefully. The examiner feeling movement is positive. The MOTHER feeling movement is not — that is quickening, and it is presumptive. The exam swaps these deliberately."),
    p("Everything else — a positive pregnancy test included — is probable or presumptive. hCG rises in other conditions, cancer among them."),
    h(2,"Chadwick, Goodell, Hegar"),
    table("In alphabetical order, travelling upward", ["Sign","What softens or changes","Where"],
      [["Chadwick","Bluish discoloration","Vulva, vagina, cervix"],
       ["Goodell","Softening","Cervix"],
       ["Hegar","Softening","Lower uterine segment"]]),
    callout("memory","C, G, H — alphabetical, and they climb the anatomy from outside in. Goodell, good and soft."),
    embed("emb-n2-a","Check yourself: which signs prove it", [q2a, q2b]),
    h(2,"The three-word trick for range questions"),
    p("Obstetric findings come as ranges, and the exam picks which end it wants using one word in the stem."),
    table("Same range, three different answers", ["The stem says","You want","Fetal heart (8-12 wk)","Quickening (16-20 wk)"],
      [["When would she FIRST...","the earliest","8 weeks","16 weeks"],
       ["When would she MOST LIKELY...","the middle","10 weeks","18 weeks"],
       ["When should she have... BY","the latest","12 weeks","20 weeks"]]),
    callout("tip","Find the word before you look at the options. First, most likely, by — earliest, middle, latest. It turns a memory question into a reading question."),
    embed("emb-n2-b","Check yourself: reading the range", [q2c, q2d]),
  ))


# ============================================================ NOTE 3 — labour

q3a = mcq("Which finding is the truest confirmation that a client is in true labour?",
  [("A","Contractions every five minutes"),("B","Progressive cervical dilation and effacement"),
   ("C","Rupture of membranes"),("D","Bloody show")], "B",
  "Labour is defined by what the CERVIX does. Contractions, ruptured membranes and bloody show all accompany labour but none of them confirms it — only progressive change in the cervix does.",
  {"A":"Incorrect — Braxton Hicks can be regular without changing the cervix.",
   "B":"Correct — cervical change is the definition.",
   "C":"Incorrect — membranes can rupture before labour begins.",
   "D":"Incorrect — it suggests cervical change but does not demonstrate it."},
  difficulty="Medium", subtopic="True labour", tags=("maternity","labour"), note_id=N3)

q3b = mcq("A client is 6 cm dilated with contractions every 3 minutes lasting 60 seconds. Which phase of the first stage is she in?",
  [("A","Latent"),("B","Active"),("C","Transition"),("D","Second stage")], "B",
  "First stage runs to full dilation and has three phases: latent (0-3 cm), active (4-7 cm), transition (8-10 cm). At 6 cm she is active.",
  {"A":"Incorrect — latent is 0-3 cm.",
   "B":"Correct — active is 4-7 cm.",
   "C":"Incorrect — transition begins at 8 cm.",
   "D":"Incorrect — second stage begins at full dilation."},
  difficulty="Easy", subtopic="Stages and phases", tags=("maternity","labour"), note_id=N3)

q3c = select_n("The nurse is timing contractions. Select the TWO statements that describe how frequency and duration are measured.",
  [("A","Frequency: from the start of one contraction to the start of the next"),
   ("B","Frequency: from the end of one contraction to the start of the next"),
   ("C","Duration: from the start of a contraction to the end of that same contraction"),
   ("D","Duration: from the peak of a contraction to its end"),
   ("E","Frequency: from the peak of one contraction to the peak of the next")],
  ["A","C"],
  "Frequency is beginning-to-beginning. Duration is beginning-to-end of the SAME contraction. Measuring frequency from the end of one to the start of the next gives you the resting interval, which is a different number.",
  {"A":"Correct — beginning to beginning.",
   "B":"Incorrect — that is the resting interval.",
   "C":"Correct — beginning to end of one contraction.",
   "D":"Incorrect — duration starts at the beginning, not the peak.",
   "E":"Incorrect — peak to peak is not how frequency is defined."},
  difficulty="Medium", subtopic="Timing contractions", tags=("maternity","labour"), note_id=N3)

q3d = mcq("During a vaginal examination the nurse feels a pulsating cord in the vagina. What is the nurse's FIRST action?",
  [("A","Call the provider"),
   ("B","Place the client in knee-chest position and hold the presenting part off the cord"),
   ("C","Attempt to reinsert the cord"),("D","Administer oxygen by mask")], "B",
  "Prolapsed cord is an obstetric emergency: the presenting part is compressing the cord and the fetus is losing its blood supply. Relieve the pressure FIRST — knee-chest or Trendelenburg, with a gloved hand holding the presenting part off the cord. Never attempt to replace the cord.",
  {"A":"Incorrect — necessary, but not before relieving the compression.",
   "B":"Correct — take the pressure off the cord immediately.",
   "C":"Incorrect — never reinsert a prolapsed cord.",
   "D":"Incorrect — oxygen helps, but it does not restore cord flow."},
  difficulty="Hard", subtopic="Complications", tags=("maternity","labour","emergency"), note_id=N3)

note(N3, "The stages and phases of labour",
  "What defines labour, how to time it, and the one emergency you act on before calling anyone",
  ["maternity","labour","high-yield"],
  doc(
    p("Labour questions are mostly about knowing where the client is in a fixed sequence — and about one emergency where the order of your actions is the whole question."),
    h(2,"What confirms labour"),
    p("Not the contractions. Not the ruptured membranes. ", b("Progressive cervical dilation and effacement"), " — labour is defined by what the cervix does. Everything else accompanies it."),
    h(2,"The four stages"),
    table("Where she is", ["Stage","From","To"],
      [["First","Onset of true labour","Full dilation (10 cm)"],
       ["Second","Full dilation","Delivery of the baby"],
       ["Third","Delivery of the baby","Delivery of the placenta"],
       ["Fourth","Delivery of the placenta","1-4 hours postpartum — recovery"]]),
    table("The three phases of the first stage", ["Phase","Dilation","What she is like"],
      [["Latent","0-3 cm","Talkative, sociable, excited"],
       ["Active","4-7 cm","Serious, inward, working"],
       ["Transition","8-10 cm","Irritable, nauseated, wants to give up"]]),
    callout("tip","Behaviour dates the phase as reliably as the centimetres. A client who has stopped making conversation and snaps at you is in transition until proved otherwise."),
    embed("emb-n3-a","Check yourself: where is she", [q3a, q3b]),
    h(2,"Timing contractions"),
    ul(["Frequency — ", b("beginning of one to the beginning of the next")],
       ["Duration — ", b("beginning to end of the same contraction")],
       "Intensity — how hard the fundus feels at the peak, or the pressure reading if monitored internally"),
    callout("warning","Measuring from the END of one contraction to the start of the next gives the RESTING interval, not the frequency. Different number, wrong answer."),
    h(2,"Prolapsed cord — act before you call"),
    p("The presenting part is compressing the cord and the fetus is losing its blood supply. This is the classic item where the correct answer is not 'notify the provider'."),
    ol(["Relieve the pressure ", b("immediately"), " — knee-chest or Trendelenburg, gloved hand holding the presenting part off the cord"],
       "Oxygen by mask","Call for help","Prepare for immediate delivery, usually caesarean"),
    callout("critical","Never attempt to push a prolapsed cord back in. And never leave the client to go and telephone — you keep your hand where it is and send someone else."),
    embed("emb-n3-b","Check yourself: timing and emergencies", [q3c, q3d]),
  ))


# ============================================================ NOTE 4 — monitoring

q4a = mcq("A fetal monitor shows decelerations that begin after the contraction starts and return to baseline after it ends. What do these indicate?",
  [("A","Head compression — benign"),("B","Cord compression"),
   ("C","Uteroplacental insufficiency"),("D","A normal variation")], "C",
  "VEAL CHOP. LATE decelerations mirror the contraction but lag behind it, and they mean Placental insufficiency — the fetus is not being perfused. Late decelerations are the ominous ones.",
  {"A":"Incorrect — head compression gives EARLY decelerations.",
   "B":"Incorrect — cord compression gives VARIABLE decelerations.",
   "C":"Correct — late decelerations mean uteroplacental insufficiency.",
   "D":"Incorrect — late decelerations are never a normal variation."},
  difficulty="Medium", subtopic="Fetal monitoring", tags=("maternity","monitoring"), note_id=N4)

q4b = sata("Late decelerations appear on the monitor. Which actions should the nurse take? Select all that apply.",
  [("A","Turn the client onto her left side"),("B","Increase the oxytocin infusion"),
   ("C","Give oxygen by mask"),("D","Increase the rate of the plain IV fluid"),
   ("E","Notify the provider"),("F","Ask the client to hold her breath and push")],
  ["A","C","D","E"],
  "Late decelerations mean the placenta is not perfusing. Everything you do aims at more blood to the placenta: reposition left, oxygen, more fluid, stop anything reducing perfusion, and escalate. Oxytocin makes contractions stronger and perfusion worse — it is stopped, never increased.",
  {"A":"Correct — left side takes the uterus off the vena cava.",
   "B":"Incorrect — oxytocin must be STOPPED. Increasing it worsens the problem.",
   "C":"Correct.","D":"Correct — volume supports placental perfusion.",
   "E":"Correct.","F":"Incorrect — pushing is not the response, and this is not second stage."},
  difficulty="Hard", subtopic="Fetal monitoring", tags=("maternity","monitoring"), note_id=N4)

q4c = tf("Early decelerations require immediate intervention.", "B",
  "Early decelerations come from head compression as the fetus descends. They mirror the contraction exactly and are benign — they need documenting, not treating.",
  {"A":"Incorrect — early decelerations are benign.",
   "B":"Correct — head compression, expected during descent."},
  subtopic="Fetal monitoring", tags=("maternity","monitoring"), note_id=N4)

note(N4, "Reading a fetal monitor strip",
  "VEAL CHOP, and what to do about each pattern",
  ["maternity","monitoring","high-yield"],
  doc(
    p("One mnemonic carries almost every fetal monitoring question on the exam. Learn it properly and this stops being a topic."),
    h(2,"VEAL CHOP"),
    table("The pattern and its cause", ["V E A L — what you see","C H O P — what causes it","Worry?"],
      [["Variable decelerations","Cord compression","Yes — reposition"],
       ["Early decelerations","Head compression","No — benign"],
       ["Accelerations","OK — a well fetus","No — reassuring"],
       ["Late decelerations","Placental insufficiency","Yes — the ominous one"]]),
    callout("memory","Read down the two columns together. V-C, E-H, A-O, L-P. The two you act on are Variable and Late; Early and Accelerations are left alone."),
    h(2,"Telling early from late"),
    ul(["", b("Early"), " — mirrors the contraction. Starts when it starts, ends when it ends. Head compression during descent."],
       ["", b("Late"), " — lags behind it. Starts after the contraction begins, recovers after it finishes. The placenta is failing to perfuse."]),
    callout("critical","The distinction is TIMING, not depth. A shallow late deceleration is far more worrying than a deep early one."),
    embed("emb-n4-a","Check yourself: naming the pattern", [q4a, q4c]),
    h(2,"What to do about late decelerations"),
    p("Every action aims at getting more blood to the placenta:"),
    ol("Turn her to the left side — takes the uterus off the vena cava",
       ["STOP the oxytocin if it is running — ", b("never increase it")],
       "Oxygen by mask","Increase the plain IV fluid","Notify the provider"),
    callout("warning","'Increase the oxytocin' appears as a distractor in almost every version of this question. Stronger contractions mean less placental perfusion — it is the exact opposite of what the fetus needs."),
    embed("emb-n4-b","Check yourself: acting on the strip", [q4b]),
  ))


# ============================================================ NOTE 5 — postpartum

q5a = mcq("Two hours after a vaginal delivery the nurse finds the fundus soft, above the umbilicus and displaced to the right. What should the nurse do FIRST?",
  [("A","Massage the fundus"),("B","Ask the client to empty her bladder"),
   ("C","Notify the provider"),("D","Start an oxytocin infusion")], "B",
  "A fundus that is high AND deviated to the right is the classic picture of a full bladder pushing the uterus up and over. The bladder is why it cannot contract down, so emptying it is the first action — massage alone will not fix a displaced fundus.",
  {"A":"Incorrect — massage is right for a boggy MIDLINE fundus; deviation points at the bladder.",
   "B":"Correct — a full bladder displaces the uterus and prevents contraction.",
   "C":"Incorrect — there is a nursing action to take first.",
   "D":"Incorrect — not before the reversible cause is dealt with."},
  difficulty="Hard", subtopic="Postpartum", tags=("maternity","postpartum"), note_id=N5)

q5b = mcq("Twenty-four hours after delivery, where should the nurse expect the fundus to be?",
  [("A","Two finger-breadths above the umbilicus"),("B","At the level of the umbilicus"),
   ("C","Two finger-breadths below the umbilicus"),("D","Not palpable")], "B",
  "The fundus sits at the umbilicus in the first 24 hours, then descends about one finger-breadth per day, becoming non-palpable by around day 10.",
  {"A":"Incorrect — above the umbilicus at 24 hours suggests a full bladder or atony.",
   "B":"Correct.","C":"Incorrect — that is about day 2.",
   "D":"Incorrect — that is around day 10."},
  difficulty="Medium", subtopic="Postpartum", tags=("maternity","postpartum"), note_id=N5)

q5c = sata("Which findings in the immediate postpartum period should the nurse treat as abnormal? Select all that apply.",
  [("A","Saturating a perineal pad in 15 minutes"),("B","Lochia rubra on day 1"),
   ("C","A boggy fundus that firms with massage"),("D","Temperature 38.6 °C on day 2"),
   ("E","A fundus deviated to the right"),("F","Afterpains while breastfeeding")],
  ["A","D","E"],
  "Saturating a pad within 15 minutes is haemorrhage. A temperature above 38 °C after the first 24 hours suggests infection. A deviated fundus means a full bladder. Lochia rubra on day 1, afterpains during feeding, and a fundus that firms with massage are all expected.",
  {"A":"Correct — that rate of loss is haemorrhage.",
   "B":"Incorrect — expected for the first 3 days.",
   "C":"Incorrect — it firmed. That is what massage is for.",
   "D":"Correct — fever after 24 hours suggests infection.",
   "E":"Correct — deviation means a full bladder.",
   "F":"Incorrect — oxytocin release during feeding causes afterpains. Expected."},
  difficulty="Medium", subtopic="Postpartum", tags=("maternity","postpartum"), note_id=N5)

note(N5, "Postpartum assessment",
  "Tone, height, position — and the three things the exam actually asks",
  ["maternity","postpartum","high-yield"],
  doc(
    p("Postpartum questions reduce to three things, and the exam asks about them relentlessly: the fundus, the lochia, and the temperature."),
    h(2,"The fundus — three properties, in order"),
    table("Check all three, every time", ["Property","Normal","Abnormal means"],
      [["Tone","Firm","Boggy — atony, and haemorrhage risk"],
       ["Height","At the umbilicus for 24 h, then down 1 finger-breadth a day","Rising or staying high — bladder or atony"],
       ["Position","Midline","Deviated — almost always a full bladder"]]),
    callout("critical","Tone and position together decide your action. Boggy and MIDLINE — massage it. Deviated to the side — empty the bladder first, because massage will not hold against a full bladder pushing it up."),
    embed("emb-n5-a","Check yourself: the fundus", [q5a, q5b]),
    h(2,"Lochia"),
    table("What it should look like", ["Stage","Days","Colour"],
      [["Rubra","1-3","Red"],["Serosa","4-10","Pinkish-brown"],["Alba","10+","Yellowish-white"]]),
    p("The quantity matters more than the colour. Saturating a perineal pad in an hour is heavy; saturating one in 15 minutes is haemorrhage."),
    h(2,"Temperature"),
    ul("A temperature up to 38 °C in the first 24 hours is expected — dehydration and the work of labour.",
       "Above 38 °C after the first 24 hours suggests infection and is reported."),
    callout("memory","Fundus, lochia, temperature. If you can only remember three postpartum things, remember those three — and for the fundus, three properties: tone, height, position."),
    embed("emb-n5-b","Check yourself: normal or not", [q5c]),
  ))


# ============================================================ NOTE 6 — newborn

q6a = sata("Which newborn findings are NORMAL variations requiring reassurance only? Select all that apply.",
  [("A","Milia across the nose"),("B","Mongolian spots on the lower back"),
   ("C","Jaundice appearing in the first 24 hours"),("D","Erythema toxicum"),
   ("E","Telangiectatic nevi (stork bites)"),("F","A port wine stain")],
  ["A","B","D","E"],
  "Milia, Mongolian spots, erythema toxicum and stork bites are all normal and self-resolving. Jaundice in the FIRST 24 hours is pathological. A port wine stain is permanent and does not fade — not a variation to reassure about.",
  {"A":"Correct — blocked sebaceous glands, resolve on their own.",
   "B":"Correct — normal, and important to document so they are not mistaken for bruising.",
   "C":"Incorrect — jaundice in the first 24 hours is pathological.",
   "D":"Correct — newborn rash, self-limiting.",
   "E":"Correct — stork bites fade.",
   "F":"Incorrect — a port wine stain is permanent."},
  difficulty="Medium", subtopic="Newborn variations", tags=("newborn","neonatal"), note_id=N6)

q6b = mcq("A newborn becomes jaundiced at 12 hours of age. How should the nurse interpret this?",
  [("A","Physiological jaundice — expected"),("B","Pathological — requires investigation"),
   ("C","Breast-milk jaundice — reassure the mother"),("D","Normal if the bilirubin is under 12 mg/dL")], "B",
  "The clock is what matters. Jaundice within the first 24 hours is PATHOLOGICAL — most often haemolytic disease from blood-group incompatibility. Physiological jaundice appears after 24 hours, typically days 2 to 3.",
  {"A":"Incorrect — physiological jaundice appears after 24 hours.",
   "B":"Correct — under 24 hours is pathological until proven otherwise.",
   "C":"Incorrect — breast-milk jaundice appears much later, around days 4-7.",
   "D":"Incorrect — the timing decides this, not the number."},
  difficulty="Medium", subtopic="Hyperbilirubinaemia", tags=("newborn","neonatal"), note_id=N6)

q6c = mcq("A newborn has an APGAR of 5 at one minute. What does this indicate?",
  [("A","No action needed — reassess at five minutes"),
   ("B","Moderate distress — stimulate and give oxygen"),
   ("C","Severe distress — begin resuscitation immediately"),
   ("D","The infant is vigorous and needs routine care")], "B",
  "APGAR 8-10 is vigorous and needs routine care. 4-7 is moderate distress: stimulate, give oxygen, reassess. 0-3 needs immediate resuscitation.",
  {"A":"Incorrect — 5 needs intervention now, not just observation.",
   "B":"Correct — 4-7 is the moderate-distress band.",
   "C":"Incorrect — full resuscitation is for 0-3.",
   "D":"Incorrect — 8-10 is vigorous."},
  difficulty="Easy", subtopic="APGAR", tags=("newborn","neonatal"), note_id=N6)

note(N6, "The normal newborn — and what is not",
  "Skin variations that need only reassurance, and the timings that make a finding pathological",
  ["newborn","neonatal","high-yield"],
  doc(
    p("Most newborn questions test one judgement: is this finding normal, or does it need reporting? The dividing line is very often a clock."),
    h(2,"Skin findings that are normal"),
    table("Reassure and document", ["Finding","What it is","Course"],
      [["Milia","Blocked sebaceous glands — white pinpoints on nose and chin","Resolve in weeks"],
       ["Mongolian spots","Blue-grey pigmentation, usually lower back or buttocks","Fade over years"],
       ["Erythema toxicum","Blotchy red newborn rash","Self-limiting, days"],
       ["Telangiectatic nevi","'Stork bites' — flat pink marks, nape, eyelids","Fade"],
       ["Acrocyanosis","Blue hands and feet, pink trunk","Normal for 24-48 h"]]),
    callout("warning","Document Mongolian spots carefully at birth. They are entirely normal, but a later examiner who has not seen the record can mistake them for bruising."),
    callout("note","A PORT WINE STAIN is the exception in this list. It is permanent, does not fade, and is not something to reassure a parent will go away."),
    embed("emb-n6-a","Check yourself: normal or report it", [q6a]),
    h(2,"Jaundice — the clock decides"),
    table("When it appeared", ["Onset","Interpretation"],
      [["Within the first 24 hours","PATHOLOGICAL — usually blood-group incompatibility. Investigate."],
       ["After 24 hours, days 2-3","Physiological — the common, expected kind"],
       ["Days 4-7 in a breastfed infant","Breast-milk jaundice"]]),
    callout("critical","First 24 hours means pathological. This single rule answers more newborn jaundice questions than any bilirubin value."),
    h(2,"APGAR"),
    table("Scored at 1 and 5 minutes", ["Score","Means","Do"],
      [["8-10","Vigorous","Routine care"],
       ["4-7","Moderate distress","Stimulate, oxygen, reassess"],
       ["0-3","Severe distress","Resuscitate immediately"]]),
    p("Five components, each scored 0 to 2: heart rate, respiratory effort, muscle tone, reflex irritability, colour."),
    embed("emb-n6-b","Check yourself: jaundice and APGAR", [q6b, q6c]),
  ))


# ================================================================ THE MOCK
# Fresh items — none of these appear in a note. Product B sells this on
# its own, so it has to stand up without the notes behind it.

MOCK = []
def m(fn, *a, **kw):
    kw.setdefault("note_id", None)
    MOCK.append(fn(*a, **kw))

m(mcq, "A client's last menstrual period began 3 September. What is her estimated date of delivery?",
  [("A","10 June"),("B","3 June"),("C","10 December"),("D","27 May")], "A",
  "3 September + 7 days = 10 September; minus 3 months = 10 June.",
  {"A":"Correct.","B":"Incorrect — the 7 days were not added.",
   "C":"Incorrect — 3 months added instead of subtracted.","D":"Incorrect."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(mcq, "A client at 34 weeks' gestation has gained 19 lb. What is the nurse's interpretation?",
  [("A","Within normal limits"),("B","3 lb below expected — assess her"),
   ("C","6 lb below expected — biophysical profile indicated"),("D","Above the expected gain")], "C",
  "34 - 9 = 25 lb expected. She is 6 lb short, and 4 lb or more in either direction calls for a biophysical profile.",
  {"A":"Incorrect — 6 lb out is well beyond the 1-2 lb band.",
   "B":"Incorrect — the shortfall is 6 lb, not 3.",
   "C":"Correct — 4 lb or more means a BPP.","D":"Incorrect — she is below, not above."},
  difficulty="Hard", subtopic="Mixed", tags=("maternity","mock"))

m(sata, "Which findings would the nurse document as PROBABLE rather than positive signs of pregnancy? Select all that apply.",
  [("A","Positive serum hCG"),("B","Goodell's sign"),("C","Fetal heart on Doppler"),
   ("D","Hegar's sign"),("E","Fetus seen on ultrasound"),("F","Chadwick's sign")],
  ["A","B","D","F"],
  "Probable signs are objective but explicable by something other than pregnancy. Only the fetus itself — heard, seen, or palpated by an examiner — is positive.",
  {"A":"Correct — hCG rises in other conditions.","B":"Correct.",
   "C":"Incorrect — that is positive.","D":"Correct.",
   "E":"Incorrect — that is positive.","F":"Correct."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(mcq, "A nurse is asked when a client would MOST LIKELY first feel quickening. What is the best answer?",
  [("A","16 weeks"),("B","18 weeks"),("C","20 weeks"),("D","22 weeks")], "B",
  "Quickening spans 16-20 weeks. 'Most likely' takes the middle of the range.",
  {"A":"Incorrect — earliest.","B":"Correct — the middle.",
   "C":"Incorrect — latest.","D":"Incorrect — outside the range."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(mcq, "A labouring client is 9 cm dilated, irritable, and says she cannot continue. Which phase is she in?",
  [("A","Latent"),("B","Active"),("C","Transition"),("D","Second stage")], "C",
  "Transition is 8-10 cm, and the behaviour — irritability, nausea, wanting to give up — is as diagnostic as the centimetres.",
  {"A":"Incorrect — 0-3 cm.","B":"Incorrect — 4-7 cm.",
   "C":"Correct.","D":"Incorrect — second stage starts at full dilation."},
  difficulty="Easy", subtopic="Mixed", tags=("maternity","mock"))

m(mcq, "Membranes rupture and the nurse sees a loop of cord at the introitus. What is the priority action?",
  [("A","Notify the provider"),("B","Position knee-chest and lift the presenting part off the cord"),
   ("C","Cover the cord with a dry sterile dressing"),("D","Prepare for immediate vaginal delivery")], "B",
  "Relieve the compression first — everything else follows. The cord is covered with a MOIST sterile dressing, not a dry one, and delivery is usually caesarean.",
  {"A":"Incorrect — necessary, but not first.",
   "B":"Correct.","C":"Incorrect — moist, not dry, and not before relieving pressure.",
   "D":"Incorrect — this is a caesarean, and not the first action."},
  difficulty="Hard", subtopic="Mixed", tags=("maternity","mock","emergency"))

m(mcq, "The monitor shows decelerations that begin and end with each contraction, mirroring it exactly. What should the nurse do?",
  [("A","Document — this is expected"),("B","Turn the client to her left side"),
   ("C","Stop the oxytocin"),("D","Prepare for immediate delivery")], "A",
  "Mirroring the contraction exactly means EARLY decelerations — head compression during descent. Benign; document them.",
  {"A":"Correct — early decelerations are benign.",
   "B":"Incorrect — that is the response to late or variable.",
   "C":"Incorrect — no need with early decelerations.","D":"Incorrect."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(select_n, "Late decelerations are seen. Select the TWO actions the nurse should take FIRST.",
  [("A","Increase the oxytocin"),("B","Turn the client to her left side"),
   ("C","Give oxygen by mask"),("D","Document and continue to observe"),
   ("E","Ask the client to push with the next contraction")],
  ["B","C"],
  "Left lateral position and oxygen are the two immediate perfusion measures. Oxytocin is stopped, never increased.",
  {"A":"Incorrect — stronger contractions worsen perfusion.",
   "B":"Correct.","C":"Correct.",
   "D":"Incorrect — late decelerations are never watch-and-wait.",
   "E":"Incorrect."},
  difficulty="Hard", subtopic="Mixed", tags=("maternity","mock"))

m(mcq, "Four hours postpartum the fundus is boggy and midline. What should the nurse do first?",
  [("A","Ask the client to void"),("B","Massage the fundus"),
   ("C","Notify the provider"),("D","Increase the IV rate")], "B",
  "Boggy and MIDLINE means atony — massage it. Boggy and DEVIATED means a full bladder, and then voiding comes first.",
  {"A":"Incorrect — that is the answer when the fundus is deviated.",
   "B":"Correct.","C":"Incorrect — massage first.","D":"Incorrect."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(tf, "A temperature of 37.9 °C in the first 24 hours after delivery should be reported as probable infection.", "B",
  "Up to 38 °C in the first 24 hours is expected — dehydration and the work of labour. Above 38 °C AFTER the first 24 hours suggests infection.",
  {"A":"Incorrect — this is within the expected range for the first day.",
   "B":"Correct."},
  difficulty="Medium", subtopic="Mixed", tags=("maternity","mock"))

m(sata, "Which newborn findings require the nurse to notify the provider? Select all that apply.",
  [("A","Jaundice at 10 hours of age"),("B","Mongolian spots"),
   ("C","APGAR of 3 at one minute"),("D","Acrocyanosis at 2 hours"),
   ("E","Milia"),("F","A respiratory rate of 78 at 4 hours")],
  ["A","C","F"],
  "Jaundice inside 24 hours is pathological, an APGAR of 0-3 needs immediate resuscitation, and a rate of 78 is tachypnoeic (normal 30-60). Mongolian spots, acrocyanosis in the first 48 hours, and milia are all normal.",
  {"A":"Correct — pathological inside 24 hours.",
   "B":"Incorrect — normal.","C":"Correct — resuscitate.",
   "D":"Incorrect — normal for 24-48 hours.","E":"Incorrect — normal.",
   "F":"Correct — normal newborn rate is 30-60."},
  difficulty="Hard", subtopic="Mixed", tags=("newborn","mock"))

m(mcq, "A newborn is jaundiced on day 3. The nurse should recognise this as:",
  [("A","Pathological — investigate"),("B","Physiological — expected"),
   ("C","Breast-milk jaundice"),("D","A sign of sepsis")], "B",
  "After 24 hours, typically days 2-3, is physiological jaundice — the common and expected kind.",
  {"A":"Incorrect — that is jaundice inside 24 hours.",
   "B":"Correct.","C":"Incorrect — that appears days 4-7.",
   "D":"Incorrect — nothing here points to sepsis."},
  difficulty="Easy", subtopic="Mixed", tags=("newborn","mock"))


# ================================================================ QUIZZES

QUIZ_MOCK = "76000000-0000-4000-8000-000000000001"

QUIZZES = [{
    "quiz_id": QUIZ_MOCK,
    "title": "Maternity & Newborn — final mock",
    "description": ("Twelve items across dating, signs of pregnancy, labour, fetal "
                    "monitoring, postpartum and the newborn. Timed and sequential — "
                    "no going back. 30 minutes."),
    "quiz_kind": "MOCK", "mode": "TIMED_SEQUENTIAL",
    "duration_seconds": 1800, "pass_score": 0.7,
    "tags": ["maternity", "newborn", "mock"], "items": MOCK,
}]


# ================================================================ PROGRAMMES
# The whole point: ONE content set, four wrappers.

PROG_NOTES = "80000000-0000-4000-8000-000000000001"
PROG_MOCK  = "80000000-0000-4000-8000-000000000002"
PROG_FULL  = "80000000-0000-4000-8000-000000000003"
PROG_FREE  = "80000000-0000-4000-8000-000000000004"

NOTE_ORDER = [N1, N2, N3, N4, N5, N6]
NOTE_TITLES = {}   # filled after NOTES is complete
for _n in NOTES:
    NOTE_TITLES[_n["note_id"]] = (_n["title"], _n["subtitle"])


# ================================================================ EMITTER

def sql_str(s):
    return "'" + s.replace("'", "''") + "'" if s is not None else "NULL"

def sql_arr(items):
    if not items:
        return "'{}'"
    return "ARRAY[" + ", ".join(sql_str(i) for i in items) + "]::text[]"

def jsonb(o):
    return "$j$" + json.dumps(o, ensure_ascii=False) + "$j$::jsonb"

def uid(prefix, a, b_, c, d):
    tail = f"{a:03d}{b_:03d}{c:03d}{d:03d}"
    assert len(tail) == 12, tail
    return f"{prefix}-0000-4000-8000-{tail}"

OUT = []
def A(s=""):
    OUT.append(s)


def emit_programme(pid, idx, title, tagline, description, unit_label,
                   delivery, price_minor, units, access_days=None,
                   show_price=True, strategy_id=None):
    """units: list of (unit_title, unit_desc, [activity, ...])
       activity: dict(type=, title=, description=, note=, payload=, note_id=)"""
    A(f"-- {title}")
    A("INSERT INTO nclex_programmes (\n"
      "  programme_id, tutor_id, title, tagline, description,\n"
      "  delivery_mode, unit_label, length_units,\n"
      "  price_currency, show_price_publicly, payment_collection_mode,\n"
      "  access_window_days, payment_gates_access, status, published_at\n"
      ") VALUES (\n"
      f"  {sql_str(pid)}, {sql_str(TUTOR_ID)},\n"
      f"  {sql_str(title)},\n  {sql_str(tagline)},\n  {sql_str(description)},\n"
      f"  {sql_str(delivery)}, {sql_str(unit_label)}, {len(units)},\n"
      f"  'GHS', {'TRUE' if show_price else 'FALSE'}, 'ON_PLATFORM',\n"
      f"  {access_days if access_days is not None else 'NULL'}, "
      f"{'FALSE' if price_minor == 0 else 'TRUE'}, 'PUBLISHED', NOW()\n"
      ")\n"
      "ON CONFLICT (programme_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, tagline = EXCLUDED.tagline,\n"
      "  description = EXCLUDED.description, delivery_mode = EXCLUDED.delivery_mode,\n"
      "  unit_label = EXCLUDED.unit_label, length_units = EXCLUDED.length_units,\n"
      "  access_window_days = EXCLUDED.access_window_days,\n"
      "  show_price_publicly = EXCLUDED.show_price_publicly,\n"
      "  payment_gates_access = EXCLUDED.payment_gates_access,\n"
      "  status = 'PUBLISHED', updated_at = NOW();")
    A()
    if strategy_id:
        A("INSERT INTO nclex_programme_payment_strategies (\n"
          "  strategy_id, programme_id, kind, label,\n"
          "  total_price_minor, initial_price_minor, is_active, sort_order\n"
          f") VALUES (\n  {sql_str(strategy_id)}, {sql_str(pid)},\n"
          f"  'UPFRONT_FULL', {sql_str('Free' if price_minor == 0 else 'Pay in full')},\n"
          f"  {price_minor}, {price_minor}, TRUE, 1\n)\n"
          "ON CONFLICT (strategy_id) DO UPDATE SET\n"
          "  label = EXCLUDED.label, total_price_minor = EXCLUDED.total_price_minor,\n"
          "  initial_price_minor = EXCLUDED.initial_price_minor,\n"
          "  is_active = TRUE, updated_at = NOW();")
        A()

    A("DELETE FROM nclex_programme_units\n"
      f"WHERE  programme_id = {sql_str(pid)}\n"
      f"  AND  unit_id::text NOT LIKE '81000000-0000-4000-8000-{idx:03d}%';")
    A()

    rows = []
    for ui, (ut, ud, _acts) in enumerate(units, start=1):
        rows.append(f"  ({sql_str(uid('81000000', idx, ui, 0, 0))}, {sql_str(pid)}, {ui},\n"
                    f"   {sql_str(ut)},\n   {sql_str(ud)}, TRUE)")
    A("INSERT INTO nclex_programme_units\n"
      "  (unit_id, programme_id, unit_index, title, description, is_published)\n"
      "VALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (unit_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
      "  is_published = TRUE, updated_at = NOW();")
    A()

    brows, arows, atrows = [], [], []
    for ui, (_ut, _ud, acts) in enumerate(units, start=1):
        brows.append(f"  ({sql_str(uid('82000000', idx, ui, 1, 0))}, "
                     f"{sql_str(uid('81000000', idx, ui, 0, 0))}, NULL, 1,\n"
                     f"   {sql_str('Study')}, NULL, TRUE)")
        for oi, act in enumerate(acts, start=1):
            aid = uid('83000000', idx, ui, 1, oi)
            arows.append(
                f"  ({sql_str(aid)},\n   {sql_str(uid('81000000', idx, ui, 0, 0))},\n"
                f"   {sql_str(uid('82000000', idx, ui, 1, 0))}, NULL, {oi},\n"
                f"   {sql_str(act['type'])}, {sql_str(act['title'])},\n"
                f"   {sql_str(act.get('description'))},\n   {sql_str(act.get('note'))},\n"
                f"   {jsonb(act.get('payload', {}))}, TRUE)")
            if act.get("note_id"):
                atrows.append(
                    f"  ({sql_str(uid('84000000', idx, ui, 1, oi))},\n   {sql_str(aid)},\n"
                    f"   {sql_str(act['note_id'])}, NULL, {sql_str(pid)},\n"
                    f"   {sql_str(uid('81000000', idx, ui, 0, 0))},\n"
                    f"   {sql_str(uid('82000000', idx, ui, 1, 0))}, {oi})")

    A("INSERT INTO nclex_programme_blocks\n"
      "  (block_id, unit_id, cohort_id, ordinal, title, description, is_published)\n"
      "VALUES\n" + ",\n".join(brows) + "\n"
      "ON CONFLICT (block_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, is_published = TRUE, updated_at = NOW();")
    A()
    A("INSERT INTO nclex_programme_activities\n"
      "  (activity_id, unit_id, block_id, cohort_id, ordinal,\n"
      "   type, title, description, note, payload, is_published)\n"
      "VALUES\n" + ",\n".join(arows) + "\n"
      "ON CONFLICT (activity_id) DO UPDATE SET\n"
      "  ordinal = EXCLUDED.ordinal, type = EXCLUDED.type, title = EXCLUDED.title,\n"
      "  description = EXCLUDED.description, note = EXCLUDED.note,\n"
      "  payload = EXCLUDED.payload, is_published = TRUE, updated_at = NOW();")
    A()
    if atrows:
        A("INSERT INTO nclex_tutor_library_note_attachments\n"
          "  (attachment_id, activity_id, note_id, shelf_id, programme_id,\n"
          "   unit_id, block_id, position)\n"
          "VALUES\n" + ",\n".join(atrows) + "\n"
          "ON CONFLICT (attachment_id) DO UPDATE SET\n"
          "  note_id = EXCLUDED.note_id, unit_id = EXCLUDED.unit_id,\n"
          "  block_id = EXCLUDED.block_id, position = EXCLUDED.position;")
        A()
    A("INSERT INTO nclex_programme_quizzes (programme_id, quiz_id)\n"
      "SELECT DISTINCT u.programme_id, (a.payload->>'quiz_id')::uuid\n"
      "FROM   nclex_programme_activities a\n"
      "JOIN   nclex_programme_units u ON u.unit_id = a.unit_id\n"
      f"WHERE  u.programme_id = {sql_str(pid)}\n"
      "  AND  a.payload->>'quiz_id' IS NOT NULL\n"
      "ON CONFLICT (programme_id, quiz_id) DO NOTHING;")
    A()


def note_activity(nid):
    title, subtitle = NOTE_TITLES[nid]
    return {"type": "LIBRARY_NOTE", "title": title, "description": subtitle,
            "note": None, "payload": {}, "note_id": nid}

MOCK_ACTIVITY = {
    "type": "MOCK", "title": "Maternity & Newborn — final mock",
    "description": "Twelve items under exam conditions: timed, sequential, no going back. 30 minutes.",
    "note": "Sit it in one uninterrupted block.",
    "payload": {"quiz_id": QUIZ_MOCK},
}


def main():
    A("-- db/seed/pitch/08-maternity.sql")
    A("-- GENERATED by db/seed/pitch/build_maternity.py — edit the generator.")
    A("--")
    A("-- One body of maternity content, FOUR programme shapes. The point is the")
    A("-- packaging, not the content: a prospective tutor needs to see that this")
    A("-- platform is not only for running 8-week cohorts.")
    A("--")
    A(f"-- {len(NOTES)} notes ({sum(1 for n in NOTES for blk in n['body']['content'] if blk.get('type')=='embedded_questions')} embedded checkpoints), "
      f"{len(QUESTIONS)} questions, 1 mock quiz, 4 programmes.")
    A("--")
    A("-- Source: Mark Klimek Lectures 10-11. His framework; scenarios and every")
    A("-- question written fresh.")
    A("--")
    A("-- Idempotent throughout.")
    A()
    A("BEGIN;")
    A()

    A("-- " + "=" * 68)
    A(f"-- 1. Library notes — {len(NOTES)}, with embedded practice checkpoints")
    A("-- " + "=" * 68)
    A("-- The embedded_questions block holds item_ids only; the questions")
    A("-- themselves are ordinary reusable bank questions inserted in §2.")
    A("-- Notes are inserted BEFORE the questions so parent_note_id resolves.")
    A()
    rows = []
    for n in NOTES:
        rows.append(f"  -- {n['title']}\n"
                    f"  ({sql_str(n['note_id'])}, {sql_str(TUTOR_ID)},\n"
                    f"   {sql_str(n['title'])},\n   {sql_str(n['subtitle'])},\n"
                    f"   {jsonb(n['body'])},\n"
                    f"   {sql_arr(n['tags'])}, {sql_arr(n['pillars'])}, TRUE, 'TUTOR_WIDE')")
    A("INSERT INTO nclex_tutor_library_notes\n"
      "  (note_id, tutor_id, title, subtitle, body, tags, pillars,\n"
      "   is_published, visibility_mode)\nVALUES\n" + ",\n".join(rows) + "\n"
      "ON CONFLICT (note_id) DO UPDATE SET\n"
      "  title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,\n"
      "  body = EXCLUDED.body, tags = EXCLUDED.tags, pillars = EXCLUDED.pillars,\n"
      "  is_published = TRUE, version_id = gen_random_uuid(), updated_at = NOW();")
    A()

    A("-- " + "=" * 68)
    A(f"-- 2. Questions — {len(QUESTIONS)} "
      f"({len(QUESTIONS) - len(MOCK)} embedded in notes, {len(MOCK)} mock-only)")
    A("-- " + "=" * 68)
    A("-- parent_note_id is an ORIGIN LABEL, not a visibility rule: it records")
    A("-- which note a question was authored from. Every one is a full reusable")
    A("-- bank question regardless.")
    A()
    BATCH = 6
    for st in range(0, len(QUESTIONS), BATCH):
        batch = QUESTIONS[st:st + BATCH]
        rows = []
        for q in batch:
            rows.append(
                f"  ({sql_str(q['item_id'])}, {sql_str(TUTOR_ID)}, {sql_str(q['question_type'])},\n"
                f"   {sql_str(q['stem'])},\n   {sql_str(q['rationale'])},\n"
                f"   {jsonb(q['content'])},\n   {jsonb(q['correct'])},\n"
                f"   {sql_str(q['topic'])}, {sql_str(q['subtopic'])}, {sql_str(q['difficulty'])},\n"
                f"   {sql_arr(q['tags'])}, {q['marks']}, {sql_str(q['parent_note_id'])})")
        A(f"-- {batch[0]['item_id']} .. {batch[-1]['item_id']}")
        A("INSERT INTO nclex_tutor_questions\n"
          "  (item_id, tutor_id, question_type, stem, rationale, content, correct,\n"
          "   topic, subtopic, difficulty, tags, marks, parent_note_id)\n"
          "VALUES\n" + ",\n".join(rows) + "\n"
          "ON CONFLICT (item_id) DO UPDATE SET\n"
          "  question_type = EXCLUDED.question_type, stem = EXCLUDED.stem,\n"
          "  rationale = EXCLUDED.rationale, content = EXCLUDED.content,\n"
          "  correct = EXCLUDED.correct, topic = EXCLUDED.topic,\n"
          "  subtopic = EXCLUDED.subtopic, difficulty = EXCLUDED.difficulty,\n"
          "  tags = EXCLUDED.tags, marks = EXCLUDED.marks,\n"
          "  parent_note_id = EXCLUDED.parent_note_id,\n"
          "  is_published = TRUE, updated_at = NOW();")
        A()
    A("UPDATE nclex_tutor_questions SET\n"
      "  client_needs_category = 'Health Promotion and Maintenance',\n"
      "  nursing_subject = 'Maternity', is_published = TRUE, is_builder_visible = TRUE\n"
      "WHERE item_id IN (\n  " + ",\n  ".join(sql_str(q["item_id"]) for q in QUESTIONS) + "\n);")
    A()

    A("-- " + "=" * 68)
    A("-- 3. The mock quiz")
    A("-- " + "=" * 68)
    A()
    for z in QUIZZES:
        A("INSERT INTO nclex_tutor_quizzes\n"
          "  (quiz_id, tutor_id, title, description, quiz_kind, mode,\n"
          "   duration_seconds, pass_score, max_attempts, status, tags)\n"
          f"VALUES (\n  {sql_str(z['quiz_id'])}, {sql_str(TUTOR_ID)},\n"
          f"  {sql_str(z['title'])},\n  {sql_str(z['description'])},\n"
          f"  {sql_str(z['quiz_kind'])}, {sql_str(z['mode'])},\n"
          f"  {z['duration_seconds']}, {z['pass_score']}, NULL, 'PUBLISHED',\n"
          f"  {sql_arr(z['tags'])}\n)\n"
          "ON CONFLICT (quiz_id) DO UPDATE SET\n"
          "  title = EXCLUDED.title, description = EXCLUDED.description,\n"
          "  quiz_kind = EXCLUDED.quiz_kind, mode = EXCLUDED.mode,\n"
          "  duration_seconds = EXCLUDED.duration_seconds,\n"
          "  pass_score = EXCLUDED.pass_score, tags = EXCLUDED.tags,\n"
          "  status = 'PUBLISHED', updated_at = NOW();")
        rows = ",\n".join(f"  ({sql_str(z['quiz_id'])}, {i}, {sql_str(it)})"
                          for i, it in enumerate(z["items"], start=1))
        A("INSERT INTO nclex_tutor_quiz_items (quiz_id, position, item_id)\nVALUES\n"
          + rows + "\nON CONFLICT (quiz_id, item_id) DO UPDATE SET position = EXCLUDED.position;")
        A()

    A("-- " + "=" * 68)
    A("-- 4. Four programmes, one content set")
    A("-- " + "=" * 68)
    A()

    # A — notes only
    emit_programme(
        PROG_NOTES, 1, "Maternity & Newborn — Revision Notes",
        "Six reference notes covering the whole maternity section. Yours for 12 months.",
        "A revision pack, not a course. Six notes covering pregnancy dating, the signs "
        "of pregnancy, labour, fetal monitoring, postpartum assessment and the normal "
        "newborn — the whole maternity section of the test plan in one place.\n\n"
        "Every note carries practice checkpoints as you read, so it is not passive. But "
        "there are no live sessions, no deadlines and no mock: this is the cheapest way "
        "to have the material to hand while you revise from somewhere else.\n\n"
        "Twelve months' access from the day you buy.",
        "MODULE", "SELF_PACED", 15000,
        [(NOTE_TITLES[n][0], NOTE_TITLES[n][1], [note_activity(n)]) for n in NOTE_ORDER],
        access_days=365, strategy_id="88000000-0000-4000-8000-000000000001")

    # B — mock only
    emit_programme(
        PROG_MOCK, 2, "Maternity & Newborn — Mock Exam",
        "One timed mock across the whole maternity section. Thirty minutes, no going back.",
        "A single timed mock, sat under exam conditions: sequential, no going back, "
        "thirty minutes for twelve items spanning dating, signs of pregnancy, labour, "
        "fetal monitoring, postpartum and the newborn.\n\n"
        "There is no teaching here — it is an assessment. Every item carries a full "
        "rationale, so you will know exactly why each answer was what it was, but if you "
        "want the material taught first, buy the revision notes or the full course.\n\n"
        "Unlimited re-sits.",
        "MODULE", "SELF_PACED", 10000,
        [("The mock", "Twelve items, thirty minutes, timed and sequential.", [MOCK_ACTIVITY])],
        access_days=180, strategy_id="88000000-0000-4000-8000-000000000002")

    # C — the full thing
    emit_programme(
        PROG_FULL, 3, "Maternity & Newborn — Learn by Doing",
        "The same six notes, but you answer as you read — then sit the mock.",
        "The complete maternity section, built so that you are answering questions "
        "within a minute of starting to read. Every note is broken up by practice "
        "checkpoints: read a rule, use it immediately, see the rationale, carry on.\n\n"
        "That is the whole design. Reading a note about late decelerations teaches you "
        "less than being asked what to do about one and getting it wrong while the "
        "explanation is still in front of you.\n\n"
        "Six notes covering pregnancy dating, the signs of pregnancy, labour, fetal "
        "monitoring, postpartum assessment and the newborn — then a timed mock across "
        "all six to prove it stuck.\n\n"
        "Self-paced, no fixed dates. Twelve months' access.",
        "MODULE", "SELF_PACED", 60000,
        [(NOTE_TITLES[n][0], NOTE_TITLES[n][1], [note_activity(n)]) for n in NOTE_ORDER]
        + [("Prove it stuck", "A timed mock across all six topics.", [MOCK_ACTIVITY])],
        access_days=365, strategy_id="88000000-0000-4000-8000-000000000003")

    # D — free live sessions
    emit_programme(
        PROG_FREE, 4, "Free Weekly NCLEX Q&A",
        "A free live session every Tuesday. Bring your questions — recordings posted the same evening.",
        "Every Tuesday evening I run an open question-and-answer session, and it is "
        "free. No curriculum, no homework, no commitment — turn up with whatever is "
        "confusing you that week and we work through it together.\n\n"
        "Sessions are recorded and posted here the same evening, so if you are on shift "
        "you have not missed it. Join the cohort and you get the joining link, the "
        "schedule and every past recording.\n\n"
        "Who comes: candidates at every stage, including people who have not decided "
        "whether they want a paid programme at all. That is fine. Come and see how I "
        "teach before you spend anything.",
        "WEEK", "TUTOR_LED", 0,
        [("Week 1 — open Q&A", "Bring anything. Recording posted the same evening.", [
            {"type": "ONLINE_LIVE_SESSION", "title": "Weekly Q&A — week 1",
             "description": "Open session. No agenda beyond what you bring.",
             "note": None, "payload": {"typical_duration_minutes": 60}}]),
         ("Week 2 — open Q&A", "Bring anything. Recording posted the same evening.", [
            {"type": "ONLINE_LIVE_SESSION", "title": "Weekly Q&A — week 2",
             "description": "Open session. No agenda beyond what you bring.",
             "note": None, "payload": {"typical_duration_minutes": 60}}]),
         ("Week 3 — open Q&A", "Bring anything. Recording posted the same evening.", [
            {"type": "ONLINE_LIVE_SESSION", "title": "Weekly Q&A — week 3",
             "description": "Open session. No agenda beyond what you bring.",
             "note": None, "payload": {"typical_duration_minutes": 60}}]),
         ("Week 4 — open Q&A", "Bring anything. Recording posted the same evening.", [
            {"type": "ONLINE_LIVE_SESSION", "title": "Weekly Q&A — week 4",
             "description": "Open session. No agenda beyond what you bring.",
             "note": None, "payload": {"typical_duration_minutes": 60}}])],
        strategy_id="88000000-0000-4000-8000-000000000004")

    A("COMMIT;")
    A()

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "08-maternity.sql")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(OUT))
    embeds = sum(1 for n in NOTES for blk in n["body"]["content"]
                 if blk.get("type") == "embedded_questions")
    print(f"wrote {path}")
    print(f"  notes       {len(NOTES)}  ({embeds} embed blocks)")
    print(f"  questions   {len(QUESTIONS)}  ({len(QUESTIONS)-len(MOCK)} embedded, {len(MOCK)} mock)")
    print(f"  quizzes     {len(QUIZZES)}")
    print(f"  programmes  4")


if __name__ == "__main__":
    main()
