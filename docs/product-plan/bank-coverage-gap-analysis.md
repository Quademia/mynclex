# Bank Coverage — Gap Analysis (2026-07-28)

Analysis of the **standalone** question bank ahead of the next authoring
run. Purpose: commission new items against measured gaps rather than by
body system alone, so the new stock both grows the free practice pool
*and* fixes the bank's blueprint balance.

Snapshot taken from `qacademy-mynclex-dev` on 2026-07-28.

---

## 1. Where the bank stands

| Slice | Count |
|---|---|
| Standalone items | 2,978 |
| Case children | 594 |
| Trend children | 162 |
| **Total** | **3,734** |

Of the 2,978 standalone: **2,400 are ticked `cat_pool`** (reserved for
CAT per the Slice 20 design), leaving **578 outside the reservation**
for practice, the builder, and readiness packs.

### Target arithmetic

| Target free pool | New items to author | Standalone becomes |
|---|---|---|
| **1,200** | **622** | 3,600 |
| 2,400 | 1,822 | 4,800 |

*(This corrects the figures given in the previous session — 1,042 /
2,242 — which double-counted growth in the reserved pool. The reserved
2,400 is fixed by the 15-CAT floor and doesn't grow with the free pool,
so reaching 1,200 free costs 622 items, not 1,042.)*

**Recommended target: 1,200 free / 622 new items.** It matches the 2:1
reserved:free ratio the case and trend wrappers already use (60/30), and
622 items is enough to close every gap listed below.

---

## 2. Client-needs blueprint — two cells out of range

Measured against the NCLEX-RN 2023–2026 test plan percentage ranges:

| Subcategory | Bank | Test plan | Verdict |
|---|---|---|---|
| Physiological Adaptation | 18.0% | 11–17% | **over ceiling** |
| Pharmacological & Parenteral | 16.1% | 13–19% | in range |
| Management of Care | 14.2% | 15–21% | **under floor** |
| Reduction of Risk Potential | 13.2% | 9–15% | in range |
| Safety & Infection Control | 13.2% | 10–16% | in range |
| Health Promotion & Maintenance | 8.7% | 6–12% | in range (low) |
| Psychosocial Integrity | 7.9% | 6–12% | in range (low) |
| Basic Care & Comfort | 7.0% | 6–12% | in range (near floor) |

Six of eight cells are in range — the bank is in better blueprint shape
than expected. Two need correcting, and because Physiological Adaptation
is over its ceiling, the fix is **additive**: author into the other cells
rather than removing anything.

**53 items carry a NULL `client_needs_subcategory`** and are invisible to
any blueprint-driven selection. These need backfilling.

---

## 3. The real gap: specialty coverage

This is the finding that matters most, and body-system commissioning
would not have surfaced it.

| Subject | Count | Share |
|---|---|---|
| Medical-Surgical | 994 | 33.4% |
| Fundamentals | 455 | 15.3% |
| Pharmacology | 443 | 14.9% |
| Leadership & Management | 402 | 13.5% |
| Mental Health | 241 | 8.1% |
| Community Health | 125 | 4.2% |
| **Pediatrics** (+ `Pediatric`) | **110** | **3.7%** |
| **Maternity** (+ `Maternal-Newborn`) | **110** | **3.7%** |
| Critical Care | 39 | 1.3% |

Maternal/newborn and paediatric content together account for **7.4%** of
the standalone bank. On the real exam these are woven through every
client-needs category and are a far larger share of what candidates
actually face. Mark Klimek devotes **two of twelve lectures** — L10
(Maternity & Neonatology) and L11 (Fetal Complications) — to maternity
alone, roughly 17% of his course against our 3.7%.

Worse, what exists is lopsided:

- **Maternity (97):** 55 are Health Promotion. Only **4** are
  Pharmacological, **1** Management of Care, **1** Psychosocial.
- **Pediatrics (103):** 52 are Health Promotion. Only **4** are
  Pharmacological, **1** Management of Care, **1** Psychosocial.

So the bank's maternity and paediatric items are almost entirely
"teaching and milestones" — the intrapartum emergencies, OB drugs,
neonatal assessment, and paediatric prioritisation questions are
effectively absent.

---

## 4. Taxonomy drift — fix before authoring

Classification labels have split into near-duplicates. This corrupts
both gap analysis and CAT blueprint selection, and it will get worse
with 600 more items.

| Canonical | Drifted variants |
|---|---|
| Maternity | `Maternal-Newborn` (13) |
| Pediatrics | `Pediatric` (7) |
| Gastrointestinal | `GI` (103) vs `Gastrointestinal` (95) |
| Renal/Genitourinary | `Genitourinary` (40), `Renal` (29) |

Plus NULLs: 59 `nursing_subject`, 57 `body_system`, 69 `topic`, 53
`client_needs_subcategory`.

Recommended: a one-off normalising migration before the authoring run,
and a CHECK constraint or lookup table so new items can't reintroduce
the drift.

---

## 5. Klimek cross-check — 12 zero-coverage areas

The Mark Klimek lecture notes (12 lectures) are the most widely used
NCLEX review resource among international candidates, and they are a
good proxy for "what the exam actually tests" rather than "what a
textbook covers." Cross-checking his distinctive content against the
bank:

### Zero items in the bank

| Klimek topic | Lecture |
|---|---|
| Kernicterus / opisthotonos positioning | L6 |
| Caput succedaneum vs cephalohematoma | L11 |
| Mongolian spot (and documenting it to prevent abuse allegations) | L11 |
| Erythema toxicum neonatorum | L11 |
| Betamethasone (antenatal steroid) | L11 |
| Surfactant administration | L11 |
| Methylergonovine / Methergine | L11 |
| Hallucination vs **illusion** (the "referent" distinction) | L4 |
| Hiatal hernia (and its mirror-image management vs dumping) | L6 |
| Laminectomy — pre-op assessment by level, post-op restrictions | L7 |
| Truncus arteriosus / transposition of the great vessels | L3 |
| Piaget stage → how to time pre-procedure teaching | L12 |

### One to five items only

Prolapsed cord (1), disulfiram teaching (1), dumping syndrome (1),
tetralogy of Fallot (1), Naegele's rule (1), log roll (1), black-tag
triage (1), clozapine/agranulocytosis (2), Wernicke-Korsakoff (2),
NMS vs EPS (3), serotonin syndrome (4), MAOI/tyramine (4), phenytoin
level (4), crutch gaits (5), lochia (5), ventilator weaning by ABG (5),
apical vs basilar chest tube (5).

### Well covered already

Digoxin toxicity (39), Cushing's (48), UAP delegation (51), neutropenic
precautions (15), chest tube bubbling (13), VEAL CHOP (11).

The pattern is consistent with §3: the holes cluster in **maternity,
newborn, paediatrics, and psych**, exactly the specialties the bank
under-weights.

---

## 6. Klimek angles worth authoring beyond the gaps

Klimek's value isn't only topic coverage — it's the *discriminating
angle* he teaches, which produces harder, less duplicable items than
straight recall. Angles worth building items around:

- **Acid-base:** cause-driven derangement (in labour → respiratory
  alkalosis; drowning / PCA pump → respiratory acidosis); "as the pH
  goes, so goes the patient, except potassium."
- **Ventilator alarms:** high-pressure = obstruction (kink → water →
  mucus plug, in that order); low-pressure = disconnection.
- **"First" vs "best" action** — the same stem with two different lead-ins
  and two different correct answers (his chest-tube and V-fib examples).
  This is a genuinely under-used item form in our bank.
- **Overdose vs withdrawal × upper vs downer** — a 2×2 that generates
  many non-duplicating items, including the neonatal variant
  (<24h = intoxication, ≥24h = withdrawal).
- **Alcohol/abuse psychosocial:** denial → *confront* in abuse but
  *support* in grief; dependency vs co-dependency vs manipulation.
- **Psychosis triage:** functional (present reality) vs dementia
  (redirect) vs delirium (reassure) — three different correct responses
  to the *same* patient statement.
- **Thyroidectomy timeline:** 0–12 h airway/haemorrhage; 12–48 h tetany
  (total) vs storm (subtotal); >48 h infection.
- **Electrolyte prefix rules:** kalaemias follow the prefix except HR and
  urine output; calcaemias and magnesaemias oppose it.
- **Insulin peak arithmetic** — "given at 07:00, when do you check for
  hypoglycaemia?" across R / NPH / lispro / glargine.
- **Lab-value ABCD priority scheme** and the Five Deadly Ds (K >6, pH in
  the 6s, CO₂ in the 60s, pO₂ <60, platelets <40,000).
- **Prioritisation rule stack:** acute > chronic; fresh post-op (<12 h) >
  other; unstable > stable; then organ hierarchy (brain > lung > heart >
  liver > kidney > pancreas). Plus the four always-unstable states
  (haemorrhage, fever >105°F, hypoglycaemia, pulseless/breathless).
- **The modifying phrase** — items where the diagnosis is a decoy and the
  trailing clause decides priority.
- **Staff-management escalation:** illegal → supervisor; immediate harm →
  confront and take over; merely inappropriate → address later; never
  ignore.
- **LPN/UAP scope edges:** "the first of anything" rule; UAP may give A&D
  ointment but not hydrocortisone or nitroglycerin.
- **Fetal monitoring:** L-tracings → LION; variable decels → cord →
  push/position.
- **Postpartum:** fundus firm/midline, boggy-and-displaced → catheterise;
  bilateral calf circumference over Homan's sign.

---

## 7. Recommended commissioning allocation (622 items)

| Bucket | Items | Rationale |
|---|---|---|
| Maternity / newborn | 160 | 3.7% → ~8%; fills 7 of 12 zero-coverage topics |
| Pediatrics | 150 | 3.7% → ~8%; Piaget teaching, toys, growth rules |
| Management of Care | 110 | lifts 14.2% over the 15% floor |
| Pharmacology gaps | 80 | OB meds, psych drugs, toxicity levels, aminoglycosides |
| Mental Health | 70 | illusion/hallucination, psychosis triage, abuse dynamics |
| Med-surg zero-coverage | 52 | laminectomy, hiatal/dumping, congenital heart |

Constraint for every bucket: **no new items in Physiological Adaptation**
unless the topic is currently at zero, since that cell is already over
its blueprint ceiling.

---

## 8. Sequencing

1. Normalise the taxonomy (§4) — migration + constraint.
2. Backfill the 53 NULL `client_needs_subcategory` values.
3. Commission the 622 items against §7, using the §6 angles.
4. Re-run this analysis and confirm every cell lands in range.
