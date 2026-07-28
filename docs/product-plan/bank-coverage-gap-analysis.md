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

**Resolved** by `db/migrations/20260818120000_bank_taxonomy_normalisation.sql`.

The canonical vocabularies are `NURSING_SUBJECTS` and `BODY_SYSTEMS` in
`lib/bank/classifications.ts` — that file is the source of truth, and it
settles two calls this analysis initially got wrong: the canonical renal
label is **`Genitourinary`** (not `Renal/Genitourinary`, which is itself
drift), and **`Critical Care` is not a subject at all** — those items are
medical-surgical.

Counting the whole table rather than the standalone slice, the drift was
wider than first measured: 7 stray `nursing_subject` values and 12 stray
`body_system` values.

| Canonical | Folded in |
|---|---|
| Medical-Surgical | `Medical-Surgical Nursing` (30), `Critical Care` (39), `Critical Care Nursing` (6), `Adult Health - Cardiovascular` (6) |
| Maternity | `Maternal-Newborn` (29), `Maternal Newborn Nursing` (2) |
| Pediatrics | `Pediatric` (7) |
| Gastrointestinal | `GI` (103) |
| Genitourinary | `Renal/Genitourinary` (102), `Renal` (43), `Renal/Urinary` (2) |
| Neurological | `Neurologic` (6), `Neuro` (3) |
| Psychiatric/Mental Health | `Psychiatric` (6), `Neuropsychiatric` (6) |
| Reproductive | `Reproductive/Obstetric` (2) |
| Multisystem | `Cardiovascular/Immune` (2) — both sepsis items |

`Not applicable` is kept as a legitimate `body_system`: it means
"deliberately not system-specific" (leadership, ethics, delegation), which
is distinct from NULL meaning "unclassified".

CHECK constraints now close both vocabularies, so a future bulk insert
fails loudly instead of drifting silently. NULLs remain permitted.

### Still open — 28 unclassified items, and a CAT-pool problem

25 of the 53 NULL-subcategory items were genuine questions and have been
backfilled. The remaining **28 are early editor test fixtures**, not NCLEX
content — stems such as "The human body is a deligate…", "Haett block", and
a handful of `SAMTEST` rows carrying raw Tiptap JSON.

The problem is not that they are unclassified. It is that **48 of the
original 53 were `is_published = true` AND ticked `cat_pool`** — so
placeholder fixtures are sitting inside the 2,400-item reserved pool and can
be served during a CAT attempt. Nothing has been deleted or unpublished:
that is Sam's call. Recommended: unpublish the fixtures and clear their
`cat_pool` tick, then re-check the reserved pool count.

### Also noted — a pending inconsistency, not drift

`DIFFICULTY_LEVELS` in `classifications.ts` is still `['Easy','Medium','Hard']`
while the database already holds 560 items banded `Very easy` / `Very hard`.
That is Slice 10a's 5-band work not yet reflected in the TS constant — left
alone deliberately, since 10a is the slice that closes it.

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

1. ~~Normalise the taxonomy (§4)~~ — done, `20260818120000`.
2. ~~Backfill the NULL `client_needs_subcategory` values~~ — 25 done; 28
   remain and are editor fixtures, not questions (see §4).
3. ~~Commission the 622 items against §7~~ — done, `db/seed/gapfill-20260728/`.
4. ~~Re-run this analysis~~ — done, §9.

---

## 9. Result (2026-07-28, after the run)

**622 items loaded**, all `cat_pool = FALSE`, no NULLs in any classification
column, one `difficulty_source` value throughout (`CURATOR_LABEL`).

Standalone bank: **2,978 → 3,600**. Free practice pool: **578 → 1,207**
non-reserved, of which **1,192 are published** and therefore actually
servable. (The gap is 15 unpublished rows — 8 pre-existing, plus the 7
fixtures parked in §10. The headline "1,200" quoted mid-run counted every
non-reserved standalone row regardless of publish state; 1,192 is the honest
usable figure.)

### The blueprint closed

| Subcategory | Before | After | Test plan | |
|---|---|---|---|---|
| Pharmacological and Parenteral | 16.1% | 16.2% | 13–19% | ✅ |
| Management of Care | **14.2%** | **16.0%** | 15–21% | ✅ was under floor |
| Physiological Adaptation | **18.0%** | **15.6%** | 11–17% | ✅ was over ceiling |
| Reduction of Risk Potential | 13.2% | 14.3% | 9–15% | ✅ |
| Safety and Infection Control | 13.2% | 12.8% | 10–16% | ✅ |
| Health Promotion and Maintenance | 8.7% | 9.2% | 6–12% | ✅ |
| Psychosocial Integrity | 7.9% | 8.5% | 6–12% | ✅ |
| Basic Care and Comfort | 7.0% | 6.7% | 6–12% | ✅ |

**All eight cells are now inside their test-plan ranges.** Physiological
Adaptation fell back under its ceiling without a single item being deleted —
the run simply grew everything around it, which is why the constraint in §7
was "author elsewhere" rather than "remove".

### Specialty mix

| Subject | Before | After |
|---|---|---|
| Maternity | 3.7% (110) | **7.5% (271)** |
| Pediatrics | 3.7% (110) | **7.0% (253)** |
| Leadership and Management | 13.5% | 13.9% |
| Mental Health | 8.1% | 8.8% |
| Medical-Surgical | 33.4% | 30.4% |

Maternity and paediatrics roughly doubled and are no longer skewed to health
promotion — the run added intrapartum emergencies, neonatal assessment,
congenital heart defects and weight-based dosing, all of which were close to
absent.

### Zero-coverage topics closed

Every topic listed in §5 now has items: kernicterus 2, caput vs
cephalohaematoma 3, dermal melanocytosis 2, erythema toxicum 2,
betamethasone 1, surfactant 1, methylergonovine 1, illusion 4, hiatal hernia
3, laminectomy 7, transposition 2, truncus 2, and the four Piaget stages 6
(as *cognitive development and procedure preparation* — the items teach the
stage without naming the theorist, which is how the exam frames it).

### Notes for the next run

- **Answer-key position was deliberately not rebalanced.** The batch keys
  A-heavy, but `shuffle_options` defaults `TRUE` and
  `lib/practice/runner/option-order.ts` permutes MCQ / SATA / SELECT_N per
  attempt and relabels badges positionally. Students never see the authored
  order, so rewriting it would have been churn — and risky on the dosage
  items, where numeric options are conventionally ascending.
- **Cross-file duplication is the failure mode to guard.** Thirteen agents
  each deduplicated within their own batch and all reported clean; the only
  real collision was *between* batches (two independent takes on the same
  infant-fracture safeguarding scenario). Run `qa_report.py` across the whole
  set before loading, not just per file.
- **Make bulk loads idempotent from the start.** This run was interrupted by a
  session limit at 310/622, and partly-loaded multi-row statements could not
  simply be re-run. Appending `ON CONFLICT (item_id) DO NOTHING` made every
  file safely repeatable and turned resumption into a no-op.

---

## 10. CAT-pool triage (2026-07-28, settled)

The reserved pool held **2,400 items, 61 of which the CAT selector could
never serve** — 49 with no `difficulty` band (§5 needs it to place the item on
the ability ladder), 27 with no `client_needs_subcategory` (§8 needs it to
hold the content blueprint), 15 with neither. All 61 were real authored
content; the synthetic `DEV_CAT_POOL` filler scored zero unplaceable.

**Context that reframes the size of this.** 1,811 of the 2,400 is
`DEV_CAT_POOL` — dev-only scaffolding with a delete-me line in its own seed
header, which never ships. The dev reservation is therefore ~589 real items
plus test filler, not a genuine editorial 2,400.

### What was done

| | Items | Action |
|---|---|---|
| Not NCLEX questions | 7 | cleared from the pool, unpublished, not deleted |
| Missing subcategory only | 12 | subcategory assigned from content |
| Missing difficulty only | 33 | band judged from the item |
| Missing both | 9 | both assigned |

The 7 removed were anatomy/biology drafts and garbled fixtures ("The human
body is a deligate…", "Haett block…", "Which of the following lists is cell
growth?"). They are unpublished rather than deleted, so nothing is
unrecoverable.

An earlier reading of this file called the `SAMTEST` rows fixtures. **That was
wrong** — they are well-formed questions (heart failure, sepsis, DKA, stroke)
that merely lacked a subcategory, and they were completed, not removed. The
`91xxx` block likewise turned out to be real content tagged `for_prod`, which
is why every one of them was fixed rather than evicted.

### The durable fix

`20260819120000_cat_pool_requires_placement_metadata.sql` adds:

```sql
CHECK (NOT cat_pool OR (difficulty IS NOT NULL
                        AND client_needs_subcategory IS NOT NULL))
```

Nothing can now enter the reserved pool unable to be selected from it.
Verified by attempting a violation — rejected with `23514`.

### Deliberately not done

The pool now reads **2,393, not 2,400**, and was not topped back up. Restoring
the count would mean demoting seven real items out of the free practice pool
to satisfy a figure that is three-quarters synthetic. The genuine reservation
gets built in Slice 10a; that is the point to size it properly.
