# Tutor Plans & Billing — what a tutor pays, and what that buys

Canonical home for the **commercial** side of the tutor relationship:
the plan tiers, what each unlocks, how the charge recurs, whether a
student's programme fee ever touches our merchant account, and the
"we'll set your content up for you" service.

Created 2026-08-27, from a design conversation between Sam and Claude
that began with a ChatGPT analysis Sam had commissioned separately. It
**answers `tutor-onboarding.md` §12**, which had been left open as
*"Out of scope — tutor plans and quotas"* with a list of questions to
settle first. That section's reasoning has been **moved here**, not
copied — it is load-bearing and must have exactly one home.

Sibling docs own their domains. `tutor-onboarding.md` owns the tutor
record and the four ways in — how someone *becomes* a tutor.
`payments-and-enrolment.md` owns how a **student** pays for a
programme. This doc owns how a **tutor** pays us, and what that
entitles them to.

⭐ **Revised 2026-09-01** — the second design conversation. Two things
changed and both are structural: **the tutor, not us, is accountable to
their students** (§5, reversing this document's own "most important
business rule" four days after writing it), and **the enrolment gate
became a number — seats — rather than a switch** (§3's amendment, §5).
The 24-month cap settled on 08-27 survives, but **its reason did not**,
so §5 marks it for re-deciding.

## ⚠⚠ STATUS: PROPOSAL. THE SHAPE IS NOW LARGELY SETTLED; EVERY PRICE IS NOT.

**Every number in this document is still a placeholder.** As of
2026-09-01 (later) the *structure* has been ratified by Sam in
conversation — the tiers, their names, the gate, and how on-platform
payments are reached. What has **not** been decided is what anything
costs.

⚠ **What IS settled, each carrying a marker where it stands:**

| Settled | Where | When |
|---|---|---|
| The accountability rule and its three conditions | §5 | 2026-09-01 |
| The seat model — *shape only, every number open* | §3 | 2026-09-01 |
| Tiers named **Starter · Pro · Academy**; *Enterprise* held in reserve | §3① | 2026-09-01 later |
| Starter holds **10 seats**, permanently | §3② | 2026-09-01 later |
| **There is no trial** | §4 | 2026-09-01 later |
| Bands **10 · 50 · 200** in shape, plus buyable extra seats | §3③ | 2026-09-01 later |
| On-platform payments is a **capability, not a rung**; Partner deferred | §7① | 2026-09-01 later |
| **Starter can never hold it** | §7② | 2026-09-01 later |
| Billing is **GHS, annual** — MoMo cannot recur | §9 | 2026-09-01 later |
| The access window is **required and NOT pre-filled** | §5 | 2026-09-01 later — refines 08-27 |
| The 24-month maximum | §5 | 2026-08-27, **re-justified 2026-09-01**: seats must come back, and nobody can underwrite a decade |
| **A student is never removed in silence** — pause, resume and removal all notify | §5 | 2026-09-01 later, *in principle* — ⚠ not built |

⚠ **Everything else — and in particular every price, band price, seat
price and percentage — is open.** See §11.

**Do not build from this file.** When a section becomes a decision it
gets a `<span>settled DATE</span>` marker like every other doc in this
folder. Until then, treat a table here as an argument, not a spec.
**Nothing at all is built.**

⭐ **Nothing is locked in yet, and that is the most useful fact in this
document.** Verified 2026-08-27: prod holds **zero payments**, no tutor
is on any plan, and `payment_collection_mode` is a per-programme column.
There is nobody to grandfather and nothing to migrate. The cost of
choosing wrong today is close to zero; the cost of not choosing is that
the tutor side cannot be used by anyone, because nobody knows what it
costs them.

---

## 1. The question, and why it is really four

The commercial question was arriving as one knot. It is four, and they
are independent:

| | Question | Depends on | Reversible? |
|---|---|---|---|
| **A** | How do we charge tutors — subscription, revenue share, both? | Nobody. Ours | Fully. It is a price |
| **B** | Does a tutor's programme fee ride on **our** merchant account? | **Paystack.** Outside us | **Poorly.** This is the one with liability |
| **C** | What is in free vs paid? | A, and how many tutors we want | Fully, until people are on plans |
| **D** | What gets built, and when? | A, B, C | Fully |

⭐ **B is the only genuinely hard one**, and for a specific reason: it
is the only one where being wrong means *we are holding someone else's
money when it goes wrong*. A wrong price is a conversation. A wrong
chargeback is a liability.

**The corollary is the working method for this whole area:** decide A
and C quickly and cheaply, expect to be wrong, and fix them from real
tutors' reactions. Spend the caution on B alone.

---

## 2. Inherited and settled — moved from `tutor-onboarding.md` §12

These were settled during the onboarding arc (2026-08-21) and are not
re-opened here. They constrain everything below.

### Billing is a layer above the tutor record, never inside it

`nclex_tutors` holds **no money, no expiry and no plan**. Whatever
commercial model lands attaches to a tutor by `user_id` without
touching that table, the grant, the application flow, or any admin
surface.

⚠ `plan_type` + `access_expires_at` columns on `nclex_tutors` were
**proposed and rejected** in that session: they would be a second,
competing copy of what a subscription already models — two places to
ask *"is this tutor paid up?"*.

### Vetting standing and commercial standing are independent axes

`nclex_tutors.status` answers *"are they allowed to teach here?"*. A
subscription answers *"are they paid up?"*. Merging them produced two
concrete bugs during design:

- suspend a tutor → subscription lapses → a sweep sets EXPIRED → they
  pay → the system sets APPROVED → **a suspended tutor is teaching
  again**
- a self-applicant picks a paid plan, is then rejected → either we owe
  a refund to someone we turned down, or the "selection" was never
  binding

⭐ This is why **`EXPIRED` is deliberately not a `status` value**, and
why §7 below keeps approval separate from payment for on-platform
collection too. It is the same principle a third time.

### Admission ≠ plan assignment

**Two operations. A UI may combine them ("Approve and set plan"); the
model must not.**

- Approval puts everyone on the free tier automatically — no plan
  choice at any doorway.
- Upgrading is a separate, self-serve act by the tutor, from a billing
  page, at the moment a limit actually bites.
- An admin may **grant** a plan to an existing tutor (comp, deal) — an
  action *against a tutor*, not part of admitting one.

If *"which plan are you interested in?"* is ever wanted on the
application form, it is a **form field in the application payload** —
an intent, not an entitlement.

### ⚠⚠ The free-tier cardinality trap

The reason §12 refused to design this in the first place, and the trap
the ChatGPT proposal walked into without noticing:

> **Every tutor is always on exactly one plan, including one who never
> pays.**

But subscription rows come from a purchase or a grant, and a user may
hold zero. So either:

- every tutor gets a FREE subscription row — **at which point the row
  stops being evidence of a transaction**; or
- free tutors' limits live nowhere and get hardcoded — **which means
  you cannot change the free tier or grandfather anyone without a
  deploy**.

⭐ §3's design exists largely to dissolve this. If the free tier has
**no quotas at all**, "which plan are you on" collapses to "do you hold
an active paid subscription?" — a question a plain absence answers
correctly. There is nothing to count, so a free tutor needs no row
pretending to be a transaction.

### ⚠ Enforcement has no home — unless there is only one gate

§12's other refusal: *"50 students, 1 programme" must be checked at
programme creation, cohort creation and every enrolment path. That is
an arc, not a column.*

⭐ **Measured 2026-08-27**: there are exactly **two** code paths that
create an `nclex_enrolments` row — `lib/enrolments/actions.ts` (a tutor
adds or approves) and `lib/payments/activate.ts` (a student pays and is
activated). With tutor fees off-platform at launch (§6), the second
does not fire for programme enrolments, so the gate is effectively
**one place**.

That measurement is what makes §3 viable where a quota matrix is not.

### ⚠ Do not model a tutor plan as an `nclex_products` row

Products are built entirely around consumer purchases —
`duration_days`, `readiness_credits`, dual-currency prices. Every
column that does real work answers *"how long"* or *"how many
credits"*. Adding `TUTOR_PRO` with a `duration_days` jams a quota tier
into a duration model.

ⓘ Note the exception §8 makes deliberately: **setup credits** genuinely
*are* a consumable allowance, and there the products/credits pattern is
the right one. The rule is about plans, not about everything a tutor
might buy.

---

## 3. The tier model <span>PROPOSAL — shape settled 2026-09-01, every price open</span>

**Three tiers, one gate.** The tiers are **Starter · Pro · Academy**
(settled 2026-09-01, later; they were Free / Pro / Plus).

### The single idea

> **Build for nothing. Pay to teach at scale.**

Every tutor gets **every authoring surface, uncapped** — programmes,
curriculum, library, bank, quizzes — on every tier including the free
one. What a tier buys is **how many students you may hold**, whether the
public can find you, and whether you may take money through us.

⭐ **AMENDED 2026-09-01 — the gate is a number, not a switch.** "Can you
enrol" became *"how many seats do you hold?"*

⚠⚠ **AMENDED AGAIN the same day — and the original phrasing did NOT
survive.** This section used to read *"Free: build anything you like.
Paid: take enrolments"*, with Free as the **zero-seat** case. Starter
now holds **ten real seats**, so the free tier teaches people, and the
line between free and paid is **scale, discovery and money** rather than
whether you may teach at all. The old sentence is recorded rather than
quietly rewritten, because two amendments in one day is exactly the kind
of change that gets half-applied.

### The table <span>REVISED 2026-09-01 (later) — names, seats, and the capability</span>

| | **Starter** | **Pro** | **Academy** |
|---|---|---|---|
| Programmes · curriculum · units · blocks · activities | Unlimited | Unlimited | Unlimited |
| Cohorts, cohort-specific activities | Unlimited | Unlimited | Unlimited |
| Tutor Library — notes, folders, shelves | Unlimited | Unlimited | Unlimited |
| My Bank — questions, case studies, trend datasets | Unlimited | Unlimited | Unlimited |
| Quizzes | Unlimited | Unlimited | Unlimited |
| Payment plans (defining them) | ✓ | ✓ | ✓ |
| Tutor profile | ✓ | ✓ | ✓ |
| Preview a programme as a student | ✓ | ✓ | ✓ |
| **Seats — student places** | **10** | **50** | **200** |
| **Extra seats, buyable above the band** | ❌ | ✓ | ✓ |
| **Enrol a student** — manual or invite | ✓ *while seats remain* | ✓ *while seats remain* | ✓ *while seats remain* |
| **Publish to the public directory** | ❌ | ✓ | ✓ |
| Accept enquiries from the public page | ❌ | ✓ | ✓ |
| Progress · attendance · analytics · student library | ✓ | ✓ | ✓ |
| Transactional emails to students | ✓ | ✓ | ✓ |
| **On-platform payments** — the capability (§7) | ❌ **never** | ✓ *by approval* | ✓ *by approval* |
| Collect programme fees | off-platform only | off-platform, or **on-platform if approved** | off-platform, or **on-platform if approved** |
| Instalments enforced automatically | — | ✓ *with on-platform* | ✓ *with on-platform* |
| Platform fee on processed sales | — | one all-in % | one all-in % |
| Setup credits **included** | — | — | starting balance (§8) |
| Setup credits **purchasable** | — | ✓ | ✓ |
| **Price** | **Free** | GHS / year | GHS / year |

⚠ **The "Operating" rows changed meaning on 2026-09-01 (later).** They
used to read *(empty)* on Free, and the note here said they needed no
separate gate because gating enrolment emptied them automatically. That
argument died with the zero-seat free tier: **a Starter tutor now has up
to ten real students**, so progress, attendance, analytics and the
student-facing library all render, and the emails **are sent**. One gate
still cascades — it just cascades to *ten*, not to nothing. See the
email consequence in ② below.

### ⭐⭐ AMENDMENT 2026-09-01 (later) — the ladder, its names, and what the top of it is

A second conversation the same day settled the shape of the whole
ladder. Six decisions, each recorded with the reasoning that produced
it, because several of them reverse a position taken earlier in this
very document.

#### ① The tiers are **Starter · Pro · Academy**, and "Free" is not a name

Sam: *"do we have to call it free?"* — and he is right that it is the
weakest label on the page.

- **It misdescribes what we are giving away.** Our bottom tier is not a
  crippled product; it is the complete authoring suite plus ten real
  students. "Free" prices it at nothing in the reader's head before
  they have looked at it.
- **Nobody self-identifies as a Free user.** Tier-naming research is
  consistent on this: the label should be something the customer is
  willing to *be*.
- ⚠ **One paradigm, no mixing.** *Starter · Pro · Academy* is a single
  progression of professional scale. Mixing metaphors — *Starter,
  Professional, Unlimited* — is the documented way to make a pricing
  page confusing.
- **"Academy"** lands locally and echoes Quademia without competing
  with it.

⏭ ***Enterprise* is deliberately NOT used, and is held in reserve.** It
would be the obvious name for a top rung, and spending it here would be
a mistake: the real enterprise customer is a **nursing school, hospital
or recruitment agency buying seats for its own nurses** — a genuinely
different buyer from a tutor, and plausible for this audience. Keep the
word for the customer it actually describes.

#### ② Starter holds **10 seats**, permanently, and the trial is gone

Settled by Sam earlier the same day, then reasoned through here. The two
mechanisms were doing the same job:

> **Ten free seats and a 30-day trial both exist to let a tutor
> experience the teaching loop. Having both is paying twice for one
> outcome.**

Seats won, because a trial is a *clock* and this model's unit is a
*stock*. See §4, which is superseded and records what survives of it.

Sam's conversion logic, which is the point of the number: *"I built this
and got 10 people through it smoothly, so maybe I can upgrade to 50."*
That is a tutor upgrading at **proven value** — exactly what §3 is for.

⚠⚠ **Two consequences of a free tier that has real students, both
forced rather than chosen:**

- ⭐ **The free grant must be a STARTING number written onto the tutor,
  not a live rule.** Sam intends to tune these numbers as real usage
  arrives. If `10` is read live at enrolment time, dropping it to 5
  later puts every existing Starter tutor with 7 students instantly
  over their limit — **retroactively taking back something people are
  using**. Granting the current number *once* and storing it means a
  later change affects only new tutors, and everyone existing is
  grandfathered for free. It also keeps §2's cardinality trap shut: the
  constant seeds a grant, it is never a live lookup.
- ⚠ **Starter tutors' students DO get transactional emails.** The old
  §11.12 asked this and answered it *"only if the gate ever loosens"* — this is
  the gate loosening. It is not a choice: §5's accountability rule
  requires disclosure at enrolment and a warning before access ends, so
  a Starter student receiving nothing makes the soft landing
  undeliverable. It costs real Resend spend, and that is the price of
  the position.

#### ③ The bands are **10 · 50 · 200**, with **buyable extra seats** above each

⚠ **The 50 → 200 gap is real** — a tutor at 65 students would have to
buy a band they will not fill for two years, which is the standard and
deserved criticism of seat pricing: *it penalises growth*.

⭐ **An extra rung and buyable overage solve the same problem, and
overage solves it better.** It is continuous rather than lumpy; it is an
upsell ("add 15 seats") rather than a decision ("move to Academy"); it
adds no column to the pricing page; and it is precedented — TalentLMS
runs exactly this shape, bands then per-extra-user.

> **Overage is the fourth tier, priced continuously.**

⚠ **One rule makes it work: an overage seat must cost more per head than
a seat inside a band.** Otherwise the cheapest path is Starter plus 190
extra seats and nobody ever upgrades. Priced above the band rate there
is a natural crossover — where Pro-plus-overage exceeds Academy, the
tutor moves up unprompted.

⏭ **A fourth rung gets added when someone is standing at the wall** — if
tutors start buying 150 seats on top of Academy, that is the evidence
for a 500-seat band, sized from what they actually bought rather than
guessed now.

#### ④ ⚠⚠ The bands and the ACCESS WINDOW cannot be decided separately

The most easily-missed thing in the model, and it does not appear in the
pricing table at all.

**Seats free up when a student's access ends** (§5). So the default
access window silently multiplies or divides every band:

> At 12-month access a tutor's seats turn over once a year. At
> **24-month** access they turn over half as often — so the same tutor
> needs **twice the band**. Academy's 200 behaves like **100**.

⚠ **The access window is now a REQUIRED, un-pre-filled field** (settled
2026-09-01, §5), so what tutors actually type decides whether these
bands are the right numbers. §11.2 carries what remains open — the
helper text, which is now the whole mechanism. ⭐ **Proposed: 12 months pre-filled, 24 as the
permitted maximum** — which makes the bands behave the way the table
reads, and makes a tutor think about what they are granting.

⚠ It also means bands must be sized against **accumulated** students,
not cohort size. Roughly: `seats ≈ annual intake × access window in
years`. A tutor who thinks of themselves as running "20 students" hits a
50-seat wall in year two and feels cheated.

#### ⑤ Price each band for its FLOOR, not its ceiling

The tutor deciding whether to buy Pro is the one with **15** students,
not the one with 48. So Pro's price has to make sense at 15. The
48-student tutor gets a bargain — which is fine; they are the best
advocate you have and they will grow into Academy.

This matters more here than it would elsewhere: Ghana's ARPU runs
20–30% below Nigeria's, and the market carries a documented free-to-paid
cliff (§9).

#### ⑥ What the market does, checked 2026-09-01

Comparable platforms were read rather than assumed, and the finding
reframes why seats exist for us at all:

| Platform | Free tier | How it scales |
|---|---|---|
| TalentLMS | Free forever, **5 users** | Active-user bands 40 · 70 · 100, then per-user |
| MoodleCloud | ❌ **killed permanent free in 2026** | User bands to a 750 cap |
| Thinkific | ❌ **killed in 2026** | Unlimited students; gates on transaction % |
| Teachable | ✓ | Revenue share, up to **7.5%** |
| LearnWorlds | ❌ | Unlimited learners; feature tiers |

⭐⭐ **The industry gates on the money. We cannot — and that is precisely
why seats exist.** Thinkific, Teachable, Podia and Kajabi can offer
unlimited students because they take a cut of every sale: the more
students a creator enrols, the more those platforms earn, automatically.
Their cheap tiers are not generosity, they are a revenue share.

With fees off-platform (§6) **we earn nothing when a tutor grows.** With
no transaction fee *and* no cap, a tutor with 500 students would pay
exactly what a tutor with 5 pays.

> **Seats are our stand-in for the transaction fee — the only lever
> tying our revenue to a tutor's success while the money moves outside
> us.**

⚠ **Two findings that cut AGAINST our free tier, recorded because they
are inconvenient:** MoodleCloud — whose seat shape we borrowed — and
Thinkific both abolished their permanent free plans in 2026; and
Zummit Africa ran at **80–90% intake while free and fell to 30%** on
introducing a subscription. The free-to-paid cliff in this market is
severe.

⭐ **Why we proceed anyway, and the test that would change our mind.**
None of those platforms has our second business: a Starter tutor's ten
students are ten warm **Bank** prospects, and Bank revenue is ours
outright with no tutor split and no fee. Starter is acquisition spend,
not charity. **The review test is therefore measurable rather than a
matter of taste: if Starter tutors are not producing Bank subscribers,
the free tier is failing at its actual job.**

### Why this shape rather than a quota matrix

- **One enforcement point** (§2), not eight. This is the objection that
  killed the quota design.
- **No cardinality trap** (§2) — nothing is counted.
- **No downgrade semantics.** The hardest question in every quota model
  — *"you have 7 programmes, free allows 1"* — simply does not arise.
  Nothing is ever retroactively taken away.
- **Conversion happens at proven value**: they have built the thing and
  someone wants in.

### ⚠⚠ Why there is no student cap, and why that is a safety decision <span>REVERSED 2026-09-01 — read the note at the end</span>

A cap on students is hit **by a student trying to enrol** — not by the
tutor doing something. And with fees collected off-platform (§6), **the
money has already changed hands outside our system before the quota
check runs.**

The failure is: a nurse pays a tutor GHS 2,500 by MoMo, the tutor goes
to enrol her, and **our platform refuses** because she is student 11.
The person harmed has paid, has no account, and has no relationship
with us.

⭐ **The wall must be hit by the tutor, in their own workflow, before
anyone has promised anything.** That is what gating *publish* and
*first enrolment* achieves and what a student cap destroys. This is
ruled out on safety, not economics.

⚠⚠ **REVERSED 2026-09-01 — and the sentence in bold above is exactly
why it could be.** The requirement was never "no cap"; it was **"the
wall must be hit by the tutor."** With fees off-platform, a seat cap
meets that requirement: the only enrolment paths that fire are
tutor-driven, so the tutor sees *"0 places remaining"* on their own
dashboard before promising anyone anything. The failure case this
section describes — a nurse who has paid and is then refused — needs
the **student** to be the actor, which requires on-platform checkout
we are not shipping at launch. **The safety test is passed, not
waived.** See §3's amendment note and §5.

⚠ It becomes live again the day the on-platform **capability** ships; the check must then run
**before** payment, not after (§5's open list).

### Rows deliberately not gated

| Not gated | Reason |
|---|---|
| ~~Student count~~ **← gated as of 2026-09-01** | ~~The above~~ — see the reversal note above and §3's amendment |
| Programme / cohort count | Costs us almost nothing, and caps make the product feel mean before it has proved anything |
| Question / note count | Same, plus three separate authoring surfaces to police |
| "Analytics depth", "library: limited" | ⚠ **Unimplementable as written.** If a row cannot be stated as a number or a switch it does not belong in a plan table — it is a permanent argument about what "basic" means |

### ⚠ What this shape costs <span>REVISED 2026-09-01 (later)</span>

1. ~~**A free tutor never sees the student-facing experience** — no
   student ever exists on Free. §4's trial covers this; if it does not,
   the fallback is a **sandbox student**, not a quota.~~
   ⭐ **Gone as of 2026-09-01 (later).** A Starter tutor has **ten real
   students**, so they see the entire student-facing experience without
   paying anything and without a trial. This was the cost the trial
   existed to cover, and it is the reason the trial could be deleted
   (§4). ⓘ *Preview-as-a-student* is still worth building, but for a
   different reason: walking your own curriculum **before** enrolling
   anyone real.
2. **Starter is genuinely generous.** Someone can build an entire
   programme, teach ten people and never pay us a cedi. Intentional —
   they cannot be found publicly, cannot accept enquiries and cannot
   take money through us — but we must be comfortable being used as a
   free authoring-and-small-teaching tool. ⭐ The justification is that
   those ten students are ten **Bank** prospects (§3⑥), and the
   standing test is whether they actually become subscribers (§11.12).
3. ~~**It is an all-or-nothing wall.** No gentle middle where a tutor
   with 3 students limps along. That is the trade for having no quota
   system.~~ ⭐ **No longer true as of 2026-09-01** — a small band *is*
   the gentle middle, and it is priced. This cost is simply gone.
4. ⚠ **New cost, 2026-09-01 (later): Starter's students cost us real
   money.** Ten students per free tutor means Resend spend on
   transactional email, database rows, and support surface — for
   accounts that pay nothing. It is forced rather than chosen (§3②),
   and it is the concrete price of the position.

---

## 4. ~~The trial, and why its clock starts late~~ <span>⚠⚠ SUPERSEDED 2026-09-01 (later) — THERE IS NO TRIAL</span>

> ⚠⚠ **This section describes a mechanism that no longer exists.** It is
> kept in full, struck through, because the *reasoning* in it is what
> killed it — and because a section that simply vanished would leave
> whoever reads §10's decision table wondering what happened to the two
> trial rows in it.

### ⭐ Why it died

Sam, on being told that Starter would hold ten real seats:

> *"then there will be no trial on pro."*

Correct, and the argument is one line:

> **Ten free seats and a 30-day trial exist for the same reason — to let
> a tutor experience the teaching loop, which §4 itself identifies as
> the only thing that converts. Having both is paying twice for one
> outcome.**

⭐ **Seats won because the unit of the model changed.** When the gate was
a *switch* (can you enrol: yes/no), a **clock** was the only way to
grant a temporary yes. Since the 2026-09-01 seats amendment the gate is
a **number**, and seats are a **stock** — so the natural way to grant a
taste of the product is *free seats, not free days*. A time-based trial
is a leftover from the boolean design.

⭐⭐ **And it dissolves the ugliest unanswered question this section
had:** *the trial ends and the tutor has 8 live students — now what?*
With seats there is no such moment. What they hold, they keep; seat
eleven costs money. **No timestamp, no expiry, no drop event, and one
concept instead of two.**

### What survives, and is now load-bearing elsewhere

- ⭐ **The insight about the clock's starting point was right**, and it
  is the reason the trial had to be replaced rather than merely
  shortened. A trial beginning at signup is spent **building** — the
  part that needs no trial — and the tutor reaches the teaching loop on
  day 28 with two days left. Sam's objection: *"building one programme
  will be actual work — then I build it and can't use it… And 30 days
  may not be enough to build a full programme."* Seats answer this
  completely: build for a month or a year, free, at any pace, and the
  ten seats are still there whenever go-live happens.
- ⚠ **"Ending to Free, not to a lockout" is still the rule** — it just
  applies to *lapse* now rather than to trial-end. A tier that ends in a
  locked account destroys content the tutor spent weeks on and makes
  the product a trap. See §5.
- ⓘ **Pair it with preview-as-a-student**, still open work
  (`tutor-onboarding.md` §14 and the 2026-08-25 sessions). It mattered
  when a free tutor had *no* students; with ten seats it matters less,
  but a tutor who wants to walk their own curriculum before enrolling
  anyone real still has no way to do it.

### ⚠ What this removes from the build

The trial-start timestamp, the trial-end job, the drop-to-Free
transition and every question about what happens to students at the
moment a trial expires. **None of it needs to exist.**

---

## 5. Accountability, lapse and grace <span>REWRITTEN 2026-09-01</span>

### ⭐⭐ The tutor is accountable to their students. We are not the guarantor. <span>SETTLED 2026-09-01 (Sam)</span>

> **A student's programme access is contingent on their tutor's account
> remaining active. The contract for the programme is between the
> student and the tutor. We are not a party to it.**

⚠⚠ **This reverses what this document called, four days earlier, its
most important business rule** — *"a tutor's card failing must not take
40 paying students offline"*. Sam's objection, and it is correct:

> *"I think we are boxing ourselves in taking accountability for the
> tutor. The tutor should be fully accountable to students they enrol.
> We cannot take that responsibility."*

**Three reasons it is right:**

1. **We never took the student's money.** The tutor's fee is collected
   off-platform (§6). We are not the seller, we did not process the
   payment, and no contract exists between us and that student for the
   programme.
2. ⭐ **The old rule contradicted itself.** It called the enrolment *"a
   contract between student and tutor, not a function of the tutor's
   relationship with us"* — and then made **us** honour it. You cannot
   name something as someone else's obligation and guarantee it in the
   same sentence.
3. **It was an unbounded liability accepted for free.** Every
   difficulty this section previously carried — the lapse hole, the
   read-only workaround, the collision between seats and student
   protection — came from volunteering to be the backstop for a promise
   nobody paid us to make.

⭐ **A fact that materially narrows the risk, verified 2026-09-01.**
Bank access is gated by `requireBankOrReadiness()` — the student's own
bank subscription or readiness entitlement. **Programme enrolment does
not grant bank access** (`app/(app)/student/bank/layout.tsx`; the
`hasProgrammeEnrolment` flag there is a hardcoded UI switch for the
product pill, not a gate). So a student who bought a Bank pass **from
us** keeps it whatever their tutor does. **The person who actually paid
us is never the person harmed.**

#### ⚠ The risk this carries, and it is not a legal one

The student's entire experience is ours — our login, our app, our
emails, our name at the top. When access ends she does not think *"my
tutor's subscription lapsed"*; she thinks **"Quademia locked me out."**
She then says so in a WhatsApp group of migrating nurses, which is how
this audience finds everything. Being legally right is no defence
against that.

ⓘ **Note we chose this exposure deliberately.** MoodleCloud can delete
an entire site on non-payment because those students are the *site
owner's* users — Moodle has no relationship with them. We built the
opposite on purpose: the student holds an account with **us**, we email
them, we hold their progress.

⭐ **So the line is not "who is responsible" but "did the student know
beforehand."** Cutting someone off after they were led to believe they
were safe is a betrayal. Cutting someone off who was told the terms on
day one is simply the deal, and nobody takes the deal to WhatsApp.

#### The three conditions this decision comes with <span>SETTLED 2026-09-01 (Sam)</span>

1. **Terms accepted at enrolment.** The student agrees to terms naming
   the tutor as the provider and stating that access depends on that
   tutor's account remaining active.
2. **The same wording in the enrolment email**, so it sits in the
   student's own inbox rather than only behind a checkbox they clicked
   once.
3. **A soft landing when access is at risk** — warning before it
   happens, a short window, and the tutor's name and contact so the
   student chases the right person.

⭐ Condition 3 costs almost nothing and converts *"Quademia locked me
out"* into *"my tutor's account lapsed — here is who to talk to."* Same
outcome, entirely different story.

#### ⓘ This rule has now been settled twice and reversed once

Written out so the history reads as a decision rather than a wobble.
The same note appears in `payments-and-enrolment.md`, where the
original clause still stands.

- **2026-05-17** — `payments-and-enrolment.md`: all student access
  contingent on the tutor maintaining their subscription.
- **2026-08-27** — superseded by the student-protection rule: students
  keep access regardless, with a 24-month cap bounding the liability.
- **2026-09-01 — reinstated.** ⭐ We return to the 2026-05-17 position,
  but with three things it never had: a **stated reason** (we never
  took the student's money, so the promise is not ours to guarantee),
  **disclosure** (terms at enrolment and in the email), and a **soft
  landing** (warning, a window, and the tutor's contact details).

⚠ **The 2026-05-17 clause was therefore right, for a reason it never
gave.** It read as a platform protecting its own cash flow; it is
better defended as a platform refusing to guarantee somebody else's
contract.

### The model, in Sam's own two questions <span>SETTLED in shape 2026-09-01 (Sam) — every number PROPOSAL</span>

> **Tutor:** *how many seats do you have — can you enrol, or can
> students enrol on your account?*
>
> **Student:** *do you still have access — is your tutor's account still
> active? Either way, your contract is with your tutor.*

That is the specification, and it is deliberately reproduced in Sam's
words. One number and one status flag, checked in the one code path
that creates an enrolment.

#### How seats are counted — a **stock**, not a running total

Seats follow MoodleCloud: the band is *how many students can use the
platform at any given moment*, not how many the tutor has ever had.

| Event | Seat |
|---|---|
| Tutor enrols a student | **occupied** |
| Student's access window expires | **freed** |
| Tutor removes a student, ending their access | **freed** |
| Tutor's account lapses | all their students lose access (above) |

⚠⚠ **This only works because of the decision above.** Stock counting is
honest only when *freeing a seat* and *ending someone's access* are the
**same act**. Under the old guarantee they were separate — so a tutor
could have unenrolled 40 students to free 40 seats while those 40
carried on using us, then enrolled 40 more. Three intakes a year on a
50-seat band would have put 120 live students on it. **A bigger hole
than the one this section set out to close, and one requiring no bad
intent at all** — just a tutor running short courses.

ⓘ **Verified 2026-09-01**, since the model is borrowed: MoodleCloud's
quota is *"the maximum number of users that can have an active account
and access your site at any given time"*; **suspended users stop
counting** and deleted users free the slot. Freeing the slot and
cutting the person off are one act there too.

#### ⭐ Recycling is the business model, not a leak

A tutor running two-week programmes recycles a 50-seat band constantly
and may put **1,000 students** through it in a year. Our costs scale
with 1,000; our seat revenue with 50. On paper, a leak.

It is not. Those 1,000 nurses now hold a **Quademia** account, have
used the product and have seen the question bank — and they **keep the
account when the programme ends**, because it is ours, not the
tutor's. The tutor is doing our recruiting.

> **The tutor pays modestly for the ability to teach. We take the
> student relationship. We monetise the student through the Bank.**

⚠ **State the consequence plainly: the Bank cross-sell (§6b) stops
being an opportunity and becomes load-bearing.** If those students
never convert, this model is thin.

#### ⭐ Seats are an asset to the tutor, not a restriction

*"Limited places"* is one of the oldest ways to sell a course, and here
it is **true** rather than marketing. Sam's point, and it is a product
instruction, not a nicety:

> *"the students having an account is a real thing — most students like
> to know the tutor has a space and hence is doing something genuinely
> organised."*

In a market where much NCLEX tutoring is a WhatsApp group and a folder
of PDFs, **the student account is itself the credibility signal**. So
build the cap as *"50 places · 12 remaining"* on the tutor's dashboard.
It is our billing mechanism and their sales tool at the same time.

### Lapse, grace and downgrade <span>PROPOSAL</span>

| Rule | Behaviour |
|---|---|
| **Tutor on lapse** | Keeps **all** content. Nothing deleted, nothing hidden from them. Seats stop working: new enrolments stop, public listing hides, **and existing students' access ends** after the warning + grace below |
| **Existing students** | Access ends with the tutor's subscription. They keep their Quademia account, their history, and any Bank pass they bought from us |
| **Grace** | MoodleCloud's shape, adopted: **30 days' warning before renewal → up to 30 days suspended → then access ends.** ⚠ We take the first two and **not** their third — a tutor's content is never deleted |
| **Downgrade** | Nothing deleted. Seats already held are not withdrawn |
| **Re-subscribe** | Flip one status. No migration, no re-publishing, no new grant of setup credits |

⏭ **Open:** whether grace is 30 days; and whether **students** are
warned at the same moment the tutor is. I think yes — condition 3 above
is worth very little if the student's warning arrives the day access
dies.

ⓘ The student-protection rule that stood here from 2026-08-27 came from
the ChatGPT analysis and was one of its genuine contributions. It was
**not wrong about the harm** — a student losing access she paid for is
a real harm. It was wrong about **who should carry it**.

### ⭐⭐ The fourth condition — a student is never removed in silence <span>SETTLED IN PRINCIPLE 2026-09-01 (Sam) — ⚠ NOT BUILT</span>

Sam: *"if they are paused or unenrolled they must be reliably informed
by email… this protects us."*

The accountability rule above ships with three conditions, and all three
describe the tutor **lapsing**. This is the fourth, and it describes the
tutor **acting**:

> **When a tutor pauses, resumes or removes a student, we tell the
> student. Every time, from us, and the tutor cannot switch it off.**

#### ⭐⭐ Why this became structural on 2026-09-01 rather than being a courtesy

Under a boolean gate a tutor had **no reason** to unenrol anybody.
**Under seats, every removal is worth money** — a freed seat is a seat
they do not have to buy. ⚠ And because §3 makes freeing a seat and
ending access **the same act**, the incentive points directly at a real
student losing real access.

> **The notification is the only thing standing between a seat model and
> quiet churn.** It is not transparency for its own sake; it is the
> control that keeps seats honest.

It is also what makes the accountability position defensible. We told
the student their access depends on their tutor (condition 1) — that is
only fair if we also tell them the moment it changes.

#### ⚠⚠ Measured 2026-09-01: today all three transitions are SILENT

Verified in the code, not assumed:

| Action | Exists? | Sends anything? |
|---|---|---|
| `pauseEnrolmentAction` → `nclex_pause_enrolment` | ✓ | ❌ **nothing** |
| `resumeEnrolmentAction` → `nclex_unpause_enrolment` | ✓ | ❌ **nothing** |
| `cancelEnrolmentAction` → `nclex_cancel_enrolment` | ✓ | ❌ **nothing** |

The contrast sits in the same file: `rejectEnrolmentAction` calls
`sendEnrolmentRejectedEmail`. Pause and cancel call `callTransition` and
return. And the registry has **no** `enrolment.paused` / `.resumed` /
`.cancelled` trigger — the enrolment triggers that exist are
`tutor_added`, `approved`, `rejected`, `access_expiring`,
`access_expired`, `access_extended`.

**So a tutor can remove a student's access today and the student finds
out by trying to log in.**

#### ⚠⚠ A LIVE DEFECT found while checking this — separable, and not fixed

There are **two** reasons an enrolment is paused — `INSTALLMENT_OVERDUE`
(the payment sweep) and `TUTOR_MANUAL` (the tutor clicks Pause). The
student-facing copy has **one** line, in
`lib/enrolments/types.ts` → `ENROLMENT_LOCKED_REASON`:

> *"Access paused — a payment is overdue. Your tutor can restore it."*

⚠⚠ **A student paused manually by their tutor is told a payment is
overdue.** That can be flatly untrue, and it is the worst false
statement available here — it tells someone they defaulted when they did
not. **It is on prod now.**

⭐ The fix is small and the data is already present: `paused_reason` is
carried on the roster row; only the copy fails to branch on it. ⓘ It is
a **bug fix, not a design decision** — recorded here because it was
found here, and left open deliberately (Sam, 2026-09-01: capture now,
build the emails later).

#### What the emails have to get right

- ⚠⚠ **The occurrence trap will bite here, and it is already a
  documented rule.** `stage` must name **which occurrence** whenever a
  subject can reach the same state twice — otherwise the second email
  **silently never sends**. A student can be paused, resumed and paused
  again. This is the textbook case, and it fails in the quietest
  possible way.
- ⭐ **Resume needs its own email.** Telling someone access stopped and
  saying nothing when it returns leaves them away for good. Silence is
  only safe in one direction.
- ⚠ **The pause email must name the real reason** — the tutor's decision
  versus an outstanding payment. Same reason the live defect above
  matters; two causes cannot share one sentence.
- ⚠ **The tutor cannot suppress it.** An email the tutor controls
  protects nobody, and the point is that it is *ours* to send.
- **Cancel should carry the tutor's note if one was given** —
  `cancelEnrolmentAction` already accepts `p_note` and nothing surfaces
  it.
- ⚠ **Never "your access to Quademia."** What changed is **one
  programme**. Already a standing rule in the email work, and it matters
  doubly here — see the framing below.

#### ⭐ And the framing that settles what this is about <span>Sam, 2026-09-01</span>

> *"This is about access to the programme, not the platform. We are not
> charging any student for access to our platform, our emails or our
> infrastructure. So this really is between the tutor and the student."*

Correct, and it clarifies the whole section. A student has **two**
independent relationships: the **programme**, bought from their tutor,
and the **Bank**, bought from us. Nothing in §5 touches the second.

⭐ This is why the notification is the right control rather than a
platform rule about *when* a tutor may remove someone. **Removal is
theirs to decide; disclosure is ours to guarantee.** We do not police
the deal — we make sure the student can always see where they stand in
it.

---

### ⭐⭐ No lifetime access. The access window is REQUIRED, and the platform maximum is 24 months. <span>SETTLED 2026-08-27, REFINED 2026-09-01 (Sam) — ⚠ NOT BUILT</span>

⚠⚠ **Read this box before the section — the decision survived, but its
reason was replaced twice.**

**① The original reason is gone.** The cap was settled on 2026-08-27 to
bound **our** liability for a lapsed tutor's students. 2026-09-01
decided that is **not our liability**. The sentence it rested on —
*"that maximum is the liability we choose to carry"* — no longer
describes anything.

**② Two better reasons replaced it, and these are the ones to keep.**

- ⭐⭐ **Seats must eventually come back.** A seat is a *stock* that frees
  when access ends. An unset window means access **never** ends, so the
  seat is consumed **permanently** — a Pro tutor granting 50 lifetime
  enrolments has zero seats forever and their band silently stops being
  a band. **Without a maximum, "seats" is not a stock, it is one-way
  consumption.**
- ⭐ **Nobody can underwrite a decade.** We cannot guarantee this
  platform, this programme or this tutor exists in ten years. A maximum
  is not us judging the tutor's deal — it is us refusing to let anyone
  commit a future none of us controls. Sam's 08-27 principle, inverted
  and made honest: *a tutor cannot grant more than they hold* becomes
  **a tutor cannot promise longer than anyone can underwrite**.

**③ ⭐ SETTLED 2026-09-01 — the field is REQUIRED and NOT pre-filled.**

Sam: *"dont prefill. make it required to be filled. that way the tutor
is never oblivious. the tagline/helpline can explain to the tutor what
it is and guide them to set a proper access limit."*

⚠ **This is a REFINEMENT of 08-27, not a restatement.** That day settled
*required **and pre-filled***, on the reasoning that a visible default
carries no hidden convention. The seat model changed the answer: **a
visible default is still a default**, and accepting one unthinkingly now
costs the tutor a seat for up to two years. Under the old liability
framing it cost them nothing.

⚠ **The pre-fill-proportionately idea is dead too**, and Sam's own
example killed it: *a four-week self-paced programme may legitimately
need a year of access, depending on the content.* **No rule can infer
the right window from the programme's length** — only the tutor knows.
Which is precisely why the responsibility is theirs.

⏭ **Open: the helper text.** It is now the whole mechanism — it must say
what the window means, that the student is told this date, and that a
longer window holds a seat longer. It is the only guidance the tutor
gets.

**④ No backfill.** Sam, 2026-09-01: *"we don't need any backfill. they
are not real users."* The dev rows below are test data and prod is
empty, so making the column `NOT NULL` is a one-line default rather than
a migration with a policy question attached. ⚠ **This is only true while
it stays true** — once real students hold lifetime access, setting an
expiry on them is not a migration, it is a broken promise.

Everything below is the 2026-08-27 reasoning, kept intact.

The rule that made §5 coherent as it stood on 2026-08-27, and **the one
decided thing in this document** at that date.

> **A tutor cannot grant a student more access than the tutor
> themselves holds.**

Sam's principle, and it is the right one: *"how can we allow a tutor to
give people lifetime access on our platform? That's only true if the
tutor has lifetime access on the platform."*

Applied strictly it goes too far — a tutor on a monthly plan holds one
month, so they could sell only one month, and nobody would buy that. The
workable form keeps the logic and moves the ceiling to our side:

> **A tutor may sell a bounded window. We honour a window the student
> already paid for — up to a maximum the platform sets. That maximum is
> the liability we choose to carry, and a tutor cannot commit us beyond
> it.**

**The maximum is 24 months.** And — Sam's framing, which is better than
removing the blank field — **an unset window is not "forever", it is
"the platform maximum"**. A tutor who does not care still does not have
to think about it.

⚠⚠ **This resolves the contradiction with `payments-and-enrolment.md`**,
which settled the opposite on 2026-05-17 (*"all student access is
contingent on the tutor maintaining their monthly platform
subscription"*, ~90-day transition then a lock). That rule was right
about exactly one case — the unbounded one — and capping the window
removes the case rather than the rule. What survives from §5 stands: a
tutor's card failing must not take 40 paying students offline, because
the remaining liability is now **finite and known**.

#### ⚠ Today lifetime is the DEFAULT, not an edge case

Measured on dev, 2026-08-27:

| | |
|---|---|
| Programmes with no access window (= lifetime) | **8 of 15** |
| Enrolments with no expiry (= lifetime) | **33 of 48** |

`access_window_days` is a free-text *"Access window (days)"* box that
starts empty, and `lib/programmes/programme-form-modal.tsx` comments
*"empty string = lifetime (NULL)"*. **The unbounded promise is the path
of least resistance** — a tutor grants it by not thinking.

ⓘ And a consequence nobody had connected: `lib/email/types.ts` —
*"Never null — lifetime rows never qualify."* The access-expiring /
access-expired emails released to prod on 2026-08-24 **structurally
cannot fire** for those students. Correct today (nothing expires), but
it means most enrolments sit outside the machinery built to stop access
ending in silence. Capping the window brings them **into** it.

#### BUILD HANDOFF <span>scoped 2026-08-27 — NOT BUILT, deliberately deferred</span>

Scoped in the same conversation that settled the rule, then parked by
Sam: *"we won't build it now, just capture and we will build it
later."* Everything below was verified against the live code and dev
data on 2026-08-27 — it should not need re-deriving.

⭐ **The core instruction: resolve NULL at WRITE time, never at read
time.** Make the column `NOT NULL` with the maximum as its default. Do
**not** leave NULL in place for readers to interpret as 730 days — the
readers are many (discovery, the access label, the analytics drawer,
the email templates, the expiry sweep) and a meaning that lives in
readers is precisely what this codebase spent 2026-08-25 to 08-27
paying for. *"RLS scopes this"* was true in six files until it was not.

⚠⚠ **THE TRAP: THERE ARE TWO UNRELATED "LIFETIME" CONCEPTS. DO NOT
CONFLATE THEM.**

`lib/payments/entitlements.ts` has its own — a **bank subscription**
with no `end_at`. That is *Quademia's own product*, and a perpetual
bank grant is entirely legitimate because we are granting access to our
own thing. It has nothing to do with a tutor's programme window.
**`lib/payments/entitlements.ts`, `app/(app)/student/picker/page.tsx`
and `lib/practice/history/*` are OUT OF SCOPE** even though they match
a grep for "lifetime". Touching them breaks bank entitlements.

**New — one migration**

`db/migrations/<ts>_programme_access_window_max.sql`
- `nclex_programmes.access_window_days` → `NOT NULL DEFAULT 730` +
  `CHECK` between 1 and 730
- backfill programme NULLs → 730 (**8 of 15 on dev**)
- backfill `nclex_enrolments.access_expires_at` NULLs →
  `enrolled_at + 730 days` (**33 of 48 on dev**)

**Edited — eight files**

| File | Change |
|---|---|
| `lib/programmes/programme-form-modal.tsx` | ⭐ **Required and pre-filled, not a blank box.** Sam's call, and better than "blank means the maximum": a required field with a visible number has **no hidden convention at all**. ⚠⚠ **But the pre-fill VALUE is now open — do not build `730` without re-deciding it (see the box at the top of this section).** A four-week course whose tutor leaves the box alone would grant two years and tie up a seat for two years; that is the same path-of-least-resistance failure this migration exists to remove, with a smaller number attached |
| `lib/programmes/actions.ts` | Validate the ceiling; never write NULL |
| `lib/enrolments/actions.ts` (~487) | The tutor-add freeze of `access_expires_at` |
| `lib/payments/activate.ts` (~307) | The paid-checkout freeze |
| `lib/discovery/format.ts` | "Lifetime" leaves the public page |
| `lib/enrolments/access-label.ts` | "Lifetime" leaves |
| `lib/analytics/tutor/student-drawer.tsx` + `types.ts` | The `'lifetime'` branch and its comment |
| `lib/email/types.ts` | ⚠ Its *"lifetime rows never qualify"* comments become **false** the moment this lands |

**Two calls left open, both to be made during the build**

1. **Hard `CHECK` in the database, or app-layer only?** Recommended:
   hard. It is a platform policy and encoding it once is the whole
   point. Cost — raising the cap to 36 months later needs a migration,
   which is arguably correct for a policy change.
2. **Should `nclex_enrolments.access_expires_at` also become
   `NOT NULL`?** Logically yes once every programme is bounded — but
   read both freeze sites first. If a legitimate path produces null (an
   admin grant, say), backfill and leave it nullable rather than break
   it.

⚠⚠ **This is the last moment it is free.** Prod has zero enrolments;
dev's NULLs are fixtures. The same migration in a year would
**retroactively shorten access somebody had already paid for** — a
refund conversation, not a data fix. The longer this waits, the more it
costs, and it costs nothing today.

⚠ **Open:** does a lapsed tutor's public programme page **hide**
(proposed) or show an "enrolment closed" state? Hiding loses an
acquisition surface; showing advertises something nobody can buy.

---

## 6. Where a student's money goes <span>PROPOSAL — off-platform at launch</span>

### The position

**Launch off-platform-only for tutor programme fees. Do not delete the
on-platform code.**

⭐ **This is not a build — it already works.** `lib/enrolments/actions.ts`
has a **mark-paid** mechanism that writes synthetic payment rows with
`collection_channel: 'OFF_PLATFORM'`. A tutor collects by MoMo, marks
the student paid, the enrolment activates. Shipped, on prod.

So the decision is not *"should we build a no-payments path"* — it is
*"which of two already-built paths is the default at launch"*. Much
smaller, and reversible: `payment_collection_mode` is a per-programme
column.

### Why off-platform first

1. **Zero implementation cost.** It is the status quo.
2. **It removes merchant-of-record, KYC, chargebacks and payouts from
   the launch entirely.**
3. **The subscription is a complete business on its own.**
4. Turning a tutor on later is a data change, not a migration.

### ⚠ What it costs — three things, all real

1. **The Bank cross-sell dies.** `BANK_OPTIN_AT_PROGRAMME` lets a
   student buy a Quademia Bank subscription **in the same checkout** as
   their enrolment. That upsell exists *because there is a Quademia
   checkout*. No on-platform sale, no moment to offer it — and it is
   100% our revenue with no split and no risk. See §6b for the
   recovery.
2. **Instalments become bookkeeping.** Deposit-and-balance, equal
   instalments, the arrears sweep and payment-gated access all run off
   payments we can *see*. Off-platform they run on what a tutor types
   in. The features do not break; they become as accurate as the
   tutor's record-keeping — and "access paused for arrears" is a heavy
   consequence to hang on a manual flag.
3. **We lose the revenue number** — the figure we would need to know
   whether the subscription is cheap or expensive for them, and the
   figure any future revenue share depends on.

### ⚠ And a cost that lands on the tutor

Every enrolment needs a manual **mark-paid**. At 40 students a cohort
that is real work, and it is a trust surface: **a tutor can mark
someone paid who has not paid, and the platform cannot know.** Records
entered this way are *tutor-asserted*, not observed, and should be read
that way everywhere they surface.

### Paystack, verified 2026-08-27 from their own documentation

Established so nobody re-derives it:

| Finding | |
|---|---|
| **Splits are enabled for Ghana by default** | No activation request needed |
| **MoMo is compatible with splits** | Splits are configured per *transaction* (`subaccount` / `split_code` at initialize), not per channel. Mobile Money is a supported Ghana channel, and Virtual Terminal docs describe assigning splits across all channels including MoMo. ⚠ Strong circumstantial evidence, not a categorical statement |
| **Fee bearer is a four-way dial** | *All accounts* (shared) · *All proportional* · *Your account* · *Subaccount*. With a single subaccount, a 0% main share charges the subaccount automatically |
| ⚠ **Refunds come out of our payout** | A refund on a split transaction goes *Reversal pending*; if it fails the amount is *"added back to your payout"* — so when it succeeds it came **out of ours** |
| ⚠ **Chargebacks land on the merchant — which is us** | Paystack's terms make the merchant responsible for the full amount of chargebacks, fraud claims and dispute fees |
| **Paystack Connect exists** | Onboards sub-merchants via a setup link and makes the **risk bearer an explicit choice**. ⚠ Its docs sit on a *pilot preview* URL — treat as "ask whether we can have it", not as something to design around |

⭐ **The correction that matters most.** A Paystack *subaccount* is not
the tutor's own Paystack account. It is a sub-entity of **ours**,
created with **our** secret key, pointing at their bank details. The
transaction runs on our merchant account. **Direct settlement is a
cash-flow fact; it is not a liability fact.** Anyone claiming
subaccounts mean "the tutor owns the financial relationship" is wrong,
and it is the error most likely to cost real money.

### ⚠ The mixed-basket problem, if on-platform ever returns

`lib/payments/init.ts` builds **one Paystack transaction from a basket
of items** — one reference, one total. One item type is
`BANK_OPTIN_AT_PROGRAMME`, a 100%-Quademia product sitting in the same
transaction as a tutor's programme fee.

A **percentage** split applies to the whole transaction and therefore
cannot express *"5% of the programme part, 100% of the bank part"* — it
would hand the tutor a cut of our own product.

⭐ **The fix is a flat `transaction_charge` computed per checkout**, not
`percentage_charge` on the subaccount:

```
transaction_charge = (platform items in full) + (fee% of the programme items)
```

ⓘ Scope, measured 2026-08-27: **27 files** reference the collection
mode, but only **one call site** (`init.ts`) would need the split
parameter. Settlement, activation and enrolment are untouched — they
key off the reference, not the split.

---

## 6b. Recovering the Bank cross-sell <span>PROPOSAL</span>

Sam's idea, and the machinery mostly exists.

**In-app prompt on early logins — the stronger of the two.**
`nclex_dismissed_prompts` already exists as a generic
`(user_id, prompt_key, dismissed_at)` table, already used for runner
tutorial prompts. That is exactly "show this until dismissed", it costs
nothing per student, and it does not depend on an email being opened.

**An offer in the enrolment email.** `enrolment.approved` and
`enrolment.tutor_added` already fire at the right moment. The discount
already exists: `bank_optin_discount` lives in `nclex_config` and is
already editable from `/admin/config`.

⚠ **The deadline is the one real design fork.** A time limit in an
email must be *enforced at checkout* or it is a lie the first time
someone tests it. Today the discount is a single global number — there
is no per-student offer with an expiry.

- **Marketing deadline** ("offer ends soon") — no code, mildly
  dishonest.
- **Real deadline** — needs a stored offer row per student with an
  expiry, and checkout must read it instead of the global config.

Starting with a standing discount and **no deadline** is respectable.
Urgency is worth adding once we know whether anyone converts.

⚠ If it goes in an email, the payload rule bites
(`transactional-email.md`): adding a field to an existing trigger adds
it to history **already sent**, so absence must mean the old behaviour.

---

## 7. On-platform payments — a **capability**, not a tier <span>REWRITTEN 2026-09-01 (later)</span>

On-platform collection is **two independent gates**: a paid tier *and*
an approval. **The approval cannot be bought.**

> ⚠ **This section was called "Plus" and described a top rung.** It is
> no longer a rung. The reasoning for the change is in ① below, kept in
> full because the rejected version is a good idea with a real argument
> behind it and will be proposed again by somebody.

### ① ⭐⭐ Why it is a capability and not a fourth tier

Sam proposed reintroducing **Partner** as an exclusive top rung — the
only tier that can take payments — reasoning that *reaching* it proves a
serious tutor running well.

**Two things in that are right**, and are why the idea is recorded
rather than dismissed:

- ⭐ **Reaching a tier is continuously re-earned evidence; an approval is
  a one-time judgement that goes stale.** A tutor sitting on a 200-seat
  band is *currently* paying and *currently* running volume, and stops
  being a Partner the moment that stops being true. An approval form is
  a snapshot of who somebody was on the day they applied.
- **A capability you might not be granted does not sell an upgrade.**
  Nobody buys Pro *hoping* to be approved. "Buy Partner, get payments"
  is a purchase decision; "buy Pro, then apply" is a maybe. On a pricing
  page that difference is worth real money.

**But it was rejected on four counts:**

1. ⚠ **Tier position filters for SIZE, and size is the wrong variable.**
   The risk being managed is refunds and chargebacks landing on our
   payout. A 200-student tutor generates **more** of that exposure than
   a 30-student one, not less. What actually reduces risk is
   *reliability* — identity, history, whether students complete — which
   is exactly what the approval checks directly.
2. ⚠⚠ **It delivers the feature precisely when it stops being needed.**
   Sam's own best argument for on-platform payments was that *"starter
   or fresh tutors may not have any form of payments system"*. A rung at
   200 students serves only tutors who solved payments years earlier.
3. ⚠ **The forced band jump returns** — a tutor with 60 students
   drowning in instalment-chasing would have to buy a 200-seat band.
   That is charging twice for the same growth: the percentage already
   scales with their success, and so does the band.
4. ⚠ **It delays the transaction-fee business by years.** Realistically
   **nobody is at Partner scale in year one**, so the only revenue line
   that grows without us doing any work would earn nothing for a long
   time. As a capability, a Pro tutor could be routing money through us
   in month three.

⭐ **The asymmetry that decided it:** a rung can be added at any time —
the day a tutor needs it, nothing breaks. **The capability cannot be
retrofitted to tutors who already left** because chasing payments was
intolerable and we made them wait until 200 students.

⏭ **Partner is therefore DEFERRED, not rejected — it is this model's
next chapter rather than an alternative to it.** Trigger to revisit:
**three or more tutors holding the capability and pressing against
Academy's band.** At that point it is sized and priced from evidence
instead of guesswork. ⓘ Deliberately *not* maintained as a live "Plan
B": two live plans are two things to keep true, and they drift.

### ② ⚠ Starter can NEVER have it <span>SETTLED 2026-09-01 (Sam)</span>

Sam: *"i wont allow on platform payment for starter."*

This is a better decision than the capability-on-every-tier version that
preceded it, for a reason beyond risk:

- ⭐⭐ **It preserves the property that makes the seat cap safe.** §3's
  cap is only safe because the **tutor** hits the wall, in their own
  dashboard, before anyone has been promised anything. On-platform
  checkout brings the **student** back as the actor — she pays, and
  *then* we discover there is no seat. That combination would have been
  at its worst on Starter: the tightest wall (10) paired with the
  least-known tutor.
- ⭐ **It gives Starter → Pro a second reason to exist.** The ladder was
  thin — the rungs differed only by seat count, which converts nobody
  whose cohort is small. The trigger is now two-sided: *"I have more
  than 10 students"* **or** *"I am tired of chasing 40 MoMo payments."*
  In a market of small cohorts, widening the conversion trigger beyond
  volume is worth more than the free tier is.
- **It removes a subsystem from the build.** Payout holds, volume
  ceilings and graduated approval for anonymous free accounts do not
  need to exist. A paying tutor with a subscription and an identity on
  file is a fundamentally different risk.

⚠ **What it costs:** the fresh-tutor case above. Someone with no way to
take money must pay for Pro first. In practice mild — they collect their
first cohort the way they already do, by MoMo, then upgrade once it is
real, and one cohort's fees dwarf a year of Pro.

### ③ Pricing the capability <span>PROPOSAL</span>

> **A paid tier costs the same annual fee whether or not it holds the
> capability. The percentage is the capability's entire price.**

- A tutor who processes nothing **pays nothing extra**, and costs us
  nothing but one review.
- A tutor who processes a lot **pays a lot** — and is worth a lot.
- No negotiation, no tier maths, no forced band jump, and it cannot be
  gamed.

⭐ **Charging a band uplift *and* a percentage would be charging twice
for the same growth.** The percentage already scales with success; let
it do the whole job.

⚠⚠ **Our percentage competes with ZERO, not with Teachable.** Teachable
can charge 7.5% because the creator's alternative is Stripe, which costs
them anyway. **Our tutor's alternative is MoMo straight to their own
phone, which is free.** So the rate has to be low enough that the admin
saving is obviously larger — and the sell is *time*, not status.

⚠ **And it must sit above Paystack's own cut.** Mobile money is **1.95%
in Ghana** and, as merchant of record, that comes out of *our*
settlement. A take rate below it means we pay to process their sales.

⭐ **Quote one all-in number.** *"5%, all in — that includes the payment
processing"* is one figure a tutor can weigh against free MoMo. Two line
items invite them to add it up and flinch, and it keeps Paystack's
fee-bearer dial (§6) an internal decision rather than a published one.

⏭ **The figure itself is open**, and the instinct is **start low and
raise it** — around 3–5% all-in — rather than the reverse.

### The approval has real content

On-platform requires a **verified Paystack subaccount** — bank details
and account-name verification. Paystack is explicit that *"Paystack
won't be liable for payouts to the wrong bank account"*, so the
verification is ours to do. **That verification is the trust step**; it
is not an arbitrary judgement.

- It is the same axis separation as §2 — vetting standing and
  commercial standing are different questions, and merging them has
  produced a bug every time.
- If money alone bought on-platform collection we would be **selling
  access to a risk we carry**, and would be commercially incentivised
  to grant it to people we should not.
- ⚠ **Refunds and chargebacks land on us** (§6). Per-tutor discretion is
  the honest control for an exposure we cannot delegate.

ⓘ **A payout delay stays available as a case-by-case dial** — the way
every payments company onboards an unknown merchant — but it is
something the approval *can* impose, not machinery that has to be built
up front.

### What the capability is actually worth to a tutor

Worth stating, because it justifies a percentage: no chasing MoMo
screenshots, no manual mark-paid per student, **instalments that enforce
themselves**, automatic enrolment on payment, access that pauses itself
when someone stops paying, and a real revenue ledger. For a tutor
running 40 students on deposit-plus-balance that is hours a week — and
worth nothing at all to one running eight.

### ⚠⚠ Sequencing, and the one thing this promotes to a build requirement

**Starter and Pro are almost entirely assembly of what exists. The
capability is a genuine arc** — subaccount creation and verification,
the flat `transaction_charge`, refund handling, the approval surface.

⚠⚠ **The seat check must move before the money.** The old §11.7 recorded
this as a future concern; the capability makes it mandatory the day it ships.
The check has to run in `lib/payments/init.ts` → `startPayment`, which
writes its rows **before** money moves — **not** in
`lib/payments/activate.ts`, which runs *after* Paystack has taken the
payment. Otherwise we take a nurse's money and then refuse her a place.

⚠ Where `subaccount_code` lives is **open**. §2 says `nclex_tutors`
holds no money. A payout destination is arguably closer to *identity*
than to *plan or expiry* — but it would be the first money-shaped field
ever to touch that table, and the question deserves a decision rather
than a default.

---

## 8. Setup credits — "we'll set your content up for you" <span>PROPOSAL</span>

Sam's addition. **Academy includes a starting balance; any paying tier can
buy more.**

⭐ **Deliberately an add-on at every tier, not an Academy-only property.** Academy
otherwise means *"we handle your money"*; setup means *"we type in your
content"*. They appeal to **different tutors** — one has material and
no payment need, the other has money flowing and no content problem.
Bundled, one of them overpays.

### ⚠ This is the first thing in the model with a real marginal cost

Every other capability is software: one tutor or a thousand, the cost
barely moves. **Setup is our time.** So it can never be "unlimited", it
must be bounded in **time as well as quantity**, and it is the one line
that can hurt us if it sells well.

Concretely: 40 Academy signups in a month = **200 programmes of setup work
owed**, with no schedule attached. The allowance is *"N credits,
redeemable within 90 days, scheduled with us"* — never just a quantity.

### It is cheaper than it looks

`.claude/skills/nclex-question-transcribe/` already turns a `.docx`
into bank content — extraction, the per-type JSON, ID minting,
read-back verification. **"200 questions" is not 200 hours of typing**;
it is a document intake and a supervised run.

⭐ And it targets the actual barrier in this market. It is not the
subscription price — it is that a tutor's material lives in Word files
and WhatsApp messages, and getting it in feels like a second job.

### The menu

One currency — **setup credits** — with a published price list, rather
than several separate allowances.

| Task | Credits |
|---|---|
| 25 questions transcribed, classified and published | 1 |
| One case study or trend set, with its tabs | 1 |
| 10 library notes from their documents | 1 |
| One programme's curriculum skeleton from their syllabus | 2 |
| One cohort configured + full live-session schedule | 1 |
| Import up to 50 existing students with enrolment state | 2 |
| Programme page + tutor profile written up | 1 |
| One quiz or mock assembled from their bank | 1 |

ⓘ Grounded in what actually exists: **8 activity types** in use
(`ONLINE_LIVE_SESSION` · `LIBRARY_NOTE` · `TEXT` · `PRACTICE_QUIZ` ·
`MOCK` · `SHELF` · `EXTERNAL_LINK` · `PDF`) and **9 question types**
(MCQ · SATA · TF · SELECT_N · MATRIX · MATRIX_MR · BOWTIE · CLOZE ·
HIGHLIGHT), plus case and trend wrappers with their tabs.

Sam's sketch — *"5 programmes, 200 questions, some cohorts"* — is about
**10 credits**, which feels like the right size for an Academy starting
balance.

### ⭐ Lead commercially with the migration

*"Send us your student list and we'll have them enrolled by Friday."* A
tutor with 40 students on WhatsApp has a real, painful problem, and
this is a far easier sell than any feature. It is also the moment their
operation moves into the product.

⚠ With a rule: enrolment and payment state are entered **from what they
tell us**, and should be marked tutor-asserted rather than observed —
consistent with how off-platform mark-paid already works (§6).

### ⚠ Three things we do not offer

1. **Writing clinical content they do not have.** Transcribe
   faithfully; never author or "improve" a rationale. **A wrong
   rationale we wrote is a clinical error in an exam-prep product** —
   a different order of liability from a typo. The transcription
   skill's MD5 verification exists because fidelity is provable and
   authorship is not.
2. **Setting their prices.** Configure the plan they choose; never
   advise the number.
3. **Anything open-ended.** "We'll help you get set up" with no unit is
   how a service business becomes unpaid support. Every credit maps to
   a task with a done state.

### Two things to state in the offer itself

- **The content stays theirs.** We are doing data entry on their
  material, not licensing it. In writing — it is the first question a
  good tutor asks.
- **They approve before publish.** Everything lands as **drafts**.

### The mechanics — two objects, not one

A readiness credit is consumed by an automated event. **A setup credit
is consumed by a human doing work over days**, so a job sits in the
middle.

| Object | Holds |
|---|---|
| **Credit ledger** | One row per credit: `tutor_id · source · granted_by · payment_id · expires_at · reserved_by_job · used_at · used_by_job · revoked_at · revoked_reason` |
| **Setup job** | The request: task type, the material link, the agreed cost, the state |

⭐ **One row per credit, never a balance column.** That is the property
worth copying from `nclex_readiness_credits`: "how many left" is a
`count(*)`, which cannot drift. A balance integer edited by four code
paths eventually lies.

`source` — `INCLUDED` · `PURCHASED` · `COMP`. It does real work at
expiry.

**Job states:**

```
REQUESTED → QUOTED → ACCEPTED → IN_PROGRESS → DELIVERED → APPROVED
                ↓         ↓                        ↓
            DECLINED  CANCELLED                  REDO
```

⚠⚠ **Credits are RESERVED at ACCEPTED and CONSUMED at APPROVED — never
at request.** Consume at request and a job we cannot finish has already
eaten their balance. Reserve at accept and the same credits cannot be
double-spent while work is underway.

⭐ **`QUOTED` is the step that stops us losing money.** A tutor writes
*"here are my questions"* and it is 300, not 200; or the "syllabus" is
a photo of a whiteboard. Submit → **we quote the credit cost** → they
accept → work starts. It is also the natural place to say *"this needs
6, you have 4"*.

**DELIVERED needs no new concept** — bank items, programmes, notes and
quizzes all already have draft/publish states. Delivered = the drafts
exist. Approved = they publish.

**Intake is a link field, not a file upload.** They paste a Drive link;
files travel outside the product. That skips storage limits, virus
scanning and size handling, none of which is what makes the service
valuable.

**Expiry:**

- `INCLUDED` credits **expire** — 90 days, stated on the pricing page.
  Otherwise Academy carries an unbounded liability callable in two years.
- ⚠ `PURCHASED` credits **should not** expire, or should get a long
  window. Someone paid money for a service; having it evaporate is a
  bad look and in some jurisdictions a consumer-protection question.
- Lapse and re-subscribe grants **nothing new** — the included balance
  is a joining grant, not a recurring entitlement.
- Cannot deliver → release the reservation. Cannot deliver at all on
  purchased credits → refund **money**, not credits.

### ⚠ Do not build this yet

With a handful of tutors this system is **a spreadsheet and an email
thread**. Building a job queue for a service nobody has bought is
exactly the trap this document keeps warning about.

The smallest real thing: **a credit balance a tutor can see** (the
ledger table and a number on a page) and **a request form that emails
us**. No quoting UI, no state machine, no admin queue — run the states
by hand until the volume makes that painful, and by then real jobs will
have told us what the states actually are.

⭐ The one thing worth getting right on day one is the **ledger shape**,
because it cannot be retrofitted cleanly once credits have been granted
and spent. The workflow around it can stay manual indefinitely.

ⓘ If a queue is ever built, `/admin/applications` is the template —
including its open question about whether a queue that keeps completed
items forever has stopped being one. Decide that **before** building a
second one.

---

## 9. The numbers — still open, but the SHAPE is now answered

| | Status |
|---|---|
| Price of Pro | ⚠ **Open.** The "$29/month" figure predates any real thinking and does not survive it — see the billing-shape finding below, which rules out both the currency and the interval |
| Price of Academy | Open |
| Price of an **extra seat** above a band | Open — but **must exceed the per-head rate inside the band** (§3③), or nobody upgrades |
| Platform fee % on processed sales | Open — **3–5% all-in** proposed, start low (§7③) |
| Currency | ✅ **GHS.** See below |
| Billing interval | ✅ **Annual.** See below |
| Seat bands | ✅ **10 · 50 · 200** in shape (§3③); the numbers stay tunable |
| Setup credit price for Pro | Open. We do not know our own unit cost. Publish *"from GHS X"* or "request a quote" until five jobs have been done and timed |
| ~~Trial length~~ | ✅ **There is no trial** (§4) |
| Included setup credits on Academy | ~10 proposed |

### ✅ ANSWERED 2026-09-01 — how the subscription recurs, and why it forces GHS + annual

> ⚠⚠ This was *"the most under-examined question in this document"* and
> *"the only open item that could invalidate the pricing shape rather
> than merely adjust a number."* It was checked against Paystack's own
> documentation and the answer does change the shape.

**① Mobile money cannot do recurring. At all.** Paystack, on the Pay
with Mobile Money channel: *"It's currently not possible for customers
to make recurring payments"* with it. Cards **can** — Paystack
authorises with a small charge (GHS 1) that is then refunded, and debits
the stored authorisation thereafter. MoMo one-off charges are fine, at
**1.95%** in Ghana.

**② Do not price in USD.** Ghanaian and Nigerian banks restrict foreign
exchange outflows, and local debit cards commonly carry a **$0
international limit or a token $20–100/month**. A recurring USD charge
on a Ghanaian card fails quietly and often.

⭐⭐ **And the seats decision had already solved this without anyone
noticing.** A *monthly subscription* is impossible on MoMo — the channel
does not support it. But **an annual prepaid band is just a purchase**,
which MoMo handles perfectly: the tutor buys twelve months of a band, we
warn them before it lapses, they buy again. **Seats are a stock, so
prepaid renewal is their natural shape rather than a workaround.**

**So: priced in GHS, sold annually.** Card holders get true auto-renew;
MoMo holders get an invoice and a reminder. One model, two payment
paths, and the reminder path is the same machinery §5's lapse warning
already needs.

### ⚠ What the market says about the price level

- **Ghana's ARPU runs 20–30% below Nigeria's**, so a figure that works
  in Lagos is too high in Accra.
- ⚠ **The free-to-paid cliff is documented and steep**: Zummit Africa
  ran at **80–90% intake while free** and fell to **30%** on introducing
  a subscription. This is the single strongest argument for pricing each
  band at its floor (§3⑤) and for keeping Starter genuinely useful.
- ⓘ These bound the *level*, not the *shape*. The shape is settled
  above.

### The arithmetic that was wrong

⚠ The ChatGPT analysis described dev programmes as ranging *"GHS 60 to
GHS 450,000-ish"*. That is a **100× misread of minor units**. Verified
2026-08-27: the most expensive programme on dev is `NCLEX-RN Live — The
8-Week Pass Plan` at `500000` minor = **GHS 5,000**.

Its worked example (80 students, GHS 500,000 of sales) and its
$239,000/year projection both rest on the inflated figure. **A
realistic Ghanaian tutor is doing GHS 20,000–60,000 a year**, so 5% of
sales is GHS 1,000–3,000 while a $29/month subscription is ≈ GHS 4,300
a year. The balance between the two revenue lines is roughly inverted
from how that memo presents it — which strengthens, not weakens, the
case that the subscription is the business and the platform fee is not.

---

## 10. Decisions, and what was rejected

⚠ **Three rows below are struck through.** They were live decisions on
2026-08-27 and were reversed on 2026-09-01. They stay visible, because a
table that silently drops a reversed decision teaches the next reader
that it was never considered.

| Position | Rejected alternative | Why |
|---|---|---|
| **One gate: enrolment** | A quota matrix (programmes 1, cohorts 1, students 10, questions 50) | Eight enforcement points, the cardinality trap, and downgrade semantics — the three things §12 refused to design. One gate has none of them |
| ~~**No student cap, ever**~~ **← REVERSED 2026-09-01: the cap is the model** | ~~"10 students on free"~~ | ⚠ Reversed because the requirement was never *"no cap"* — it was *"the wall must be hit by the tutor."* With fees off-platform every enrolment path is tutor-driven, so a seat cap meets it. §3 |
| **Seats — a stock of student places** | A boolean "can you enrol" switch | A tutor with 5 students and one with 200 should not pay the same; the boolean had no answer to that except inventing another tier |
| **Bands 10 · 50 · 200 + buyable extra seats** | A fourth rung between 50 and 200 | Overage is continuous rather than lumpy, is an upsell rather than a decision, adds no column to the pricing page, and is precedented (TalentLMS). **Overage is the fourth tier, priced continuously** |
| **Starter · Pro · Academy** | Free / Pro / Plus | "Free" misdescribes a full authoring suite plus ten students, and nobody self-identifies as a Free user. One naming paradigm, no mixed metaphors |
| ***Enterprise* held in reserve** | *Enterprise* as the top-tier name | The real enterprise buyer is a nursing school, hospital or agency buying seats for its own nurses — a different customer. Do not spend the word on a tutor tier |
| ~~**Trial clock starts at first enrolment**~~ **← REVERSED 2026-09-01: there is no trial** | ~~30 days from signup~~ | ⚠ Ten free seats and a trial do the same job; having both pays twice for one outcome. The starting-point insight survives and is *why* seats replaced it. §4 |
| ~~**Trial ends to Free**~~ **← moot, no trial** | ~~Trial ends to a lockout~~ | ⓘ The rule survives, applied to **lapse** instead: never end in a locked account. §5 |
| **On-platform payments is a CAPABILITY** | **Partner** as an exclusive fourth rung | Tier position filters for *size*, and size correlates with **more** chargeback exposure, not less; and a rung at 200 students delivers the feature to tutors who solved payments years ago. **Deferred, not rejected** — §7① carries the trigger |
| **Starter can never hold the capability** | The capability on every tier, including free | Keeps the seat cap safe (only the tutor hits the wall), gives Starter → Pro a second conversion trigger, and deletes payout-hold machinery for anonymous free accounts. §7② |
| **Same annual fee with or without the capability; the % is its price** | A band uplift *and* a percentage | Charging twice for the same growth — the percentage already scales with success |
| **One all-in percentage, quoted as one number** | Our fee plus Paystack's, itemised | Two line items invite the tutor to add them up and flinch; and it keeps the fee-bearer dial internal. ⚠ Must still exceed Paystack's 1.95% or we pay to process |
| **GHS, billed annually** | USD, billed monthly | ⚠ MoMo **cannot** do recurring at all, and Ghanaian cards commonly carry a $0 international limit. §9 |
| **The free grant is a starting number, stored** | A live `FREE_SEATS` lookup | Tuning the number later would retroactively put existing tutors over their limit. Stored, a change affects only new tutors. §3② |
| **Off-platform at launch** | $29 + 5% of on-platform sales from day one | Merchant-of-record, refunds and chargebacks land on us. Off-platform is **already built**, so deferring costs nothing |
| **On-platform gated by tier AND approval** | A tier you can simply buy | Selling access to a risk we carry, and incentivising ourselves to grant it badly |
| **Setup credits as an add-on at any tier** | A top-tier-only property | Payments and content-entry appeal to different tutors; bundled, one overpays |
| **Reserve at accept, consume at approve** | Consume at request | A job we cannot finish would have eaten the balance |
| **One row per credit** | A balance column | A balance edited by several paths drifts; a ledger cannot |
| **No "limited / basic / full" rows** | The ChatGPT matrix's middle column | ⚠ Not specifications. Roughly half its rows cannot be built as written |
| **A new doc, not §12** | Extending `tutor-onboarding.md` | That arc is complete and shipped, 1,518 lines; this is a distinct arc spanning it and `payments-and-enrolment.md` |

### What the ChatGPT analysis contributed

Recorded fairly, because it is genuinely mixed:

**Right, and adopted** — the separation of subscription / standing /
enrolment / platform fee · **protecting existing students when a tutor
lapses** (§5), its best contribution · *restrict, never delete* on
downgrade · the create-vs-publish distinction, which became §3's gate ·
the reversal in its second half, that we should not be the financial
intermediary at launch.

**Wrong** — the 100× price misread (§9) · "split settles the Paystack
charges for you" (the default bearer is the **main account**; it is a
four-way dial) · "subaccounts mean the tutor owns the financial
relationship" (§6 — we remain merchant of record).

**Missing** — it had not read `tutor-onboarding.md` §12, so it
re-derived settled ground and walked into the cardinality trap that
section had already identified; and it treated the platform fee as a
schema problem when it is a money-movement problem.

---

## 11. Open questions <span>REVISED 2026-09-01 (later)</span>

⭐ **Four of these closed on 2026-09-01 (later) and are kept struck
through**, so nobody re-derives them. What remains is almost entirely
**prices** — the structure is now settled in shape.

### Still open

1. ⚠⚠ **The prices themselves** — Pro, Academy, an extra seat, and the
   platform percentage. These need Sam's read on what a Ghanaian tutor
   charging GHS 2,500 a head will accept; no amount of desk research
   substitutes. Bounded by §9: GHS, annual, each band priced for its
   **floor** (§3⑤), and the percentage **above Paystack's 1.95%** but
   low enough to beat free MoMo (§7③).
2. ✅ ~~**The access-window default**~~ — **SETTLED 2026-09-01 (later):
   the field is REQUIRED and NOT pre-filled**, and the 24-month maximum
   survives on two new reasons (seats must come back; nobody can
   underwrite a decade). See §5. ⏭ **What is still open is the HELPER
   TEXT**, which is now the entire mechanism — it must explain what the
   window means, that the student is told the date, and that a longer
   window holds a seat longer. ⚠ Note the coupling in §3④ stands: at
   24-month access every band is effectively **halved**, so what tutors
   actually choose will decide whether 10 · 50 · 200 are the right
   numbers. ⓘ This absorbed the old §11.4.
3. ⚠ **Do Pro and Academy differ by anything beyond seats and public
   listing?** As written, everything else is identical. Three rungs that
   differ only by a number may be too thin to read as a ladder —
   although the capability now gives Starter → Pro a second reason
   (§7②), which Pro → Academy still lacks.
4. **Grace length**, and whether **students** are warned at the same
   moment the tutor is. (§5)
5. ✅ ~~**Unenrolling must be visible to the student**~~ — **SETTLED IN
   PRINCIPLE 2026-09-01 (later), and widened**: pause, resume *and*
   removal all notify the student, from us, and the tutor cannot
   suppress it. It is §5's **fourth condition**, not a nice-to-have —
   under seats a removal is worth money, so it is the control that
   keeps seats honest. ⚠ **Not built**; Sam: *"we will do the email
   when we build."* ⏭ What remains open is only the copy and the
   occurrence key — see §5.
6. ⚠⚠ **LIVE DEFECT, found 2026-09-01, NOT fixed — the paused student
   is told the wrong reason.** `ENROLMENT_LOCKED_REASON.PAUSED` in
   `lib/enrolments/types.ts` says *"Access paused — a payment is
   overdue"* for **both** pause reasons, so a student paused manually by
   their tutor is told they defaulted when they did not. **On prod
   now.** `paused_reason` is already on the roster row, so only the copy
   fails to branch. ⓘ A bug fix rather than a design decision —
   deliberately left open when the emails were deferred, so it does not
   disappear with them.
7. ✅ ~~Reconcile §5 with the 2026-05-17 access-window rule~~ — settled
   2026-08-27, then **reversed 2026-09-01**: we are back on the
   2026-05-17 rule, with a reason, disclosure and a soft landing. See
   §5's *"settled twice and reversed once"* note. ⚠ Still **not
   built**.
8. Does a lapsed tutor's public page hide or show "enrolment closed"?
   (§5)
9. Where `subaccount_code` lives, if the capability is built. (§7)
10. Does Starter stay forever, or go read-only after long inactivity?
11. What happens to **enquiries** that arrive for a tutor who cannot
    enrol anyone — ⓘ now a narrower question, since a Starter tutor
    *can* enrol ten people but cannot accept enquiries at all (§3).
12. ⭐ **The review test for Starter, which is measurable rather than a
    matter of taste:** are Starter tutors producing **Bank**
    subscribers? That is the job the free tier is being kept for
    (§3⑥). If the answer is no, the free tier is failing and the
    question in the old §11.14 becomes live again.

### ✅ Closed on 2026-09-01 (later)

- ✅ ~~**How the subscription charge recurs**~~ — **answered.** MoMo
  cannot do recurring at all; Ghanaian cards cannot reliably hold a USD
  charge. **GHS, billed annually**, and the seats model turns out to fit
  that better than a monthly subscription would. §9.
- ✅ ~~**Bands only, or a monthly fee as well?**~~ — **bands, annual,**
  with buyable overage above each. The capability is priced by
  percentage on top, with no band uplift. §3③ and §7③.
- ✅ ~~**Do free tutors' students get transactional emails?**~~ —
  **yes, forced.** §5's accountability rule requires disclosure at
  enrolment and a warning before access ends; a Starter student
  receiving nothing makes the soft landing undeliverable. It costs real
  Resend spend. §3②.
- ✅ ~~**Is the free tier worth its cost at all?**~~ — **kept, as
  acquisition for the Bank rather than as charity**, with item 11 above
  as the standing test. ⚠ Recorded honestly: MoodleCloud and Thinkific
  both abolished permanent free plans in 2026, and the African
  free-to-paid cliff is steep. §3⑥.
- ⏭ ~~**If students ever self-enrol, the seat check must run before
  payment**~~ — **no longer an open question, it is a build
  requirement.** Promoted to §7's sequencing: the check runs in
  `startPayment`, not `activate.ts`. It fires the day the capability
  ships.

---

## 12. Slices <span>REVISED 2026-09-01 (later)</span>

**Not scoped, deliberately.** The prices (§11.1) must be answered first,
and the whole document remains a proposal. When it is ratified, the
natural sequence is:

1. **Subscription record + the seat grant + the one enrolment gate.**
   The grant is written onto the tutor at grant time, never read live
   (§3②). ⓘ No trial timestamp — there is no trial (§4).
2. **Seat display and the upgrade flow** — the billing page, "38 of 50
   seats used", and buying a band or extra seats.
3. **Setup-credit ledger + balance display + request form** (§8's
   minimum).
4. **The on-platform capability**: subaccount creation and
   verification, the flat `transaction_charge`, refund handling, the
   approval surface — **and the seat check moved into `startPayment`
   before it ships**.

⚠ Steps 1–3 are mostly assembly of what exists. **Step 4 is a genuine
arc** and should not be sequenced with the others.

⚠ **The access-window build (§5, settled) is a prerequisite for step 1
being meaningful**, not a follow-on: seats are a stock that frees when access
ends, so a product where 33 of 48 enrolments never expire has seats that
never come back. It is scoped and parked — one migration, eight files.
