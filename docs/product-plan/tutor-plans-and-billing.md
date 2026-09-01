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

⭐ **Revised 2026-08-31** — the second design conversation. Two things
changed and both are structural: **the tutor, not us, is accountable to
their students** (§5, reversing this document's own "most important
business rule" four days after writing it), and **the enrolment gate
became a number — seats — rather than a switch** (§3's amendment, §5).
The 24-month cap settled on 08-27 survives, but **its reason did not**,
so §5 marks it for re-deciding.

## ⚠⚠ STATUS: PROPOSAL. NOTHING HERE IS DECIDED — except where §5 says it is.

Every number in this document is a placeholder, and the shape itself is
a recommendation Sam has not ratified. It is written down because the
reasoning is worth keeping, not because it is settled.

⚠ **The exceptions, all in §5 and all carrying a `SETTLED` marker:** the
accountability rule and its three conditions (2026-08-31), the shape of
the seat model (2026-08-31, *shape only — every number remains open*),
and the 24-month cap (2026-08-27, **flagged for re-decision**). Nothing
else in this file is decided, and nothing at all is built.

**Do not build from this file.** When a section becomes a decision it
gets a `<span>settled DATE</span>` marker like every other doc in this
folder. Until then, treat a table here as an argument, not a spec.

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

## 3. The tier model <span>PROPOSAL</span>

**Three tiers, one gate.** Names are placeholders Sam picked as
"probably" — Free / Pro / Plus — and may change.

### The single idea

> **Free: build anything you like. Paid: take enrolments.**

Free tutors get **every authoring surface, uncapped**. What they cannot
do is enrol a student or publish publicly.

⭐ **AMENDED 2026-08-31 — the gate is a number, not a switch.** The idea
above survives verbatim; what changed is how "can you enrol" is
answered. It is now *"how many seats do you hold?"*, and **Free is
simply the zero-seat case**. See the amendment note beneath the table.

### The table

| | **Free** | **Pro** | **Plus** |
|---|---|---|---|
| Programmes · curriculum · units · blocks · activities | Unlimited | Unlimited | Unlimited |
| Cohorts, cohort-specific activities | Unlimited | Unlimited | Unlimited |
| Tutor Library — notes, folders, shelves | Unlimited | Unlimited | Unlimited |
| My Bank — questions, case studies, trend datasets | Unlimited | Unlimited | Unlimited |
| Quizzes | Unlimited | Unlimited | Unlimited |
| Payment plans (defining them) | ✓ | ✓ | ✓ |
| Tutor profile | ✓ | ✓ | ✓ |
| Preview a programme as a student | ✓ | ✓ | ✓ |
| **Seats — student places** *(added 2026-08-31)* | **0** | **a band** | **a larger band** |
| **Publish to the public directory** | ❌ | ✓ | ✓ |
| **Enrol a student** — manual, invite, or self-enrol | ❌ *(no seats)* | ✓ **while seats remain** | ✓ **while seats remain** |
| Accept enquiries from the public page | ❌ | ✓ | ✓ |
| Progress · attendance · analytics · student library | *(empty)* | ✓ | ✓ |
| Transactional emails to students | *(none sent)* | ✓ | ✓ |
| Collect programme fees | off-platform | off-platform (mark-paid) | **on-platform checkout** |
| Instalments enforced automatically | — | manual mark-paid | ✓ |
| Paystack subaccount + our approval | — | — | **required** (§7) |
| Platform fee on processed sales | — | none | % — figure open |
| Setup credits **included** | — | — | starting balance (§8) |
| Setup credits **purchasable** | — | ✓ | ✓ |

⭐ **The "Operating" rows need no separate gate.** Progress, attendance,
analytics, the student-facing library and the student emails all
require students. Gating enrolment empties them automatically. One gate
cascades.

### ⭐ AMENDMENT 2026-08-31 — seats are one added row, not a new table

Sam: *"in terms of the plan table this adds as the seat, all the other
things are valid."* Every other row above stands exactly as written.
One row is added and one row's **reason** changes — its values do not.

**This generalises §3 rather than replacing it.** Every argument the
section makes survives, and one gets stronger:

- **One enforcement point** — seats are checked where an enrolment is
  created, and nowhere else. Previously that check was a boolean *and*
  a tier lookup; now it is a single number, so there is **less** to
  enforce, not more.
- **No cardinality trap** — a free tutor holds **zero** seats, and zero
  is a plain absence. Still nothing has to pretend to be a transaction.
- **No downgrade semantics** — seats already held are never taken away.
- **Conversion at proven value** — unchanged.

⭐ **And it gains what the boolean never had: it scales.** A tutor with
5 students and one with 200 no longer pay the same. The old shape had
no answer to that except "invent another tier".

⚠ **The student-cap objection below is answered, not ignored.** §3
ruled out counting students on safety — the wall would be hit *by a
student who had already paid off-platform*. **Measured 2026-08-27 and
re-checked 2026-08-31:** with fees off-platform, the only paths that
create an enrolment are tutor-driven (`addStudentAction`,
`addSelfPacedStudentAction`, `convertWaitlistEntryAction`); the
student-driven path (`lib/payments/activate.ts`,
`enrolment_source: 'SELF_PAID'`) fires only after a Paystack payment
through us, which does not happen for programme fees at launch. **So
the tutor hits the wall, in their own dashboard, before anyone has
been promised anything** — precisely the condition §3 said a cap could
never satisfy. ⚠ The objection becomes live again the day Plus ships;
see §5's open list.

⏭ **Open in the table:** whether a band is **included** in Pro/Plus or
**bought separately on top**, and whether Plus's advantage is a bigger
band, cheaper seats, or neither. Same open question as *"bands only, or
a monthly fee as well?"* (§11).

### Why this shape rather than a quota matrix

- **One enforcement point** (§2), not eight. This is the objection that
  killed the quota design.
- **No cardinality trap** (§2) — nothing is counted.
- **No downgrade semantics.** The hardest question in every quota model
  — *"you have 7 programmes, free allows 1"* — simply does not arise.
  Nothing is ever retroactively taken away.
- **Conversion happens at proven value**: they have built the thing and
  someone wants in.

### ⚠⚠ Why there is no student cap, and why that is a safety decision <span>REVERSED 2026-08-31 — read the note at the end</span>

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

⚠⚠ **REVERSED 2026-08-31 — and the sentence in bold above is exactly
why it could be.** The requirement was never "no cap"; it was **"the
wall must be hit by the tutor."** With fees off-platform, a seat cap
meets that requirement: the only enrolment paths that fire are
tutor-driven, so the tutor sees *"0 places remaining"* on their own
dashboard before promising anyone anything. The failure case this
section describes — a nurse who has paid and is then refused — needs
the **student** to be the actor, which requires on-platform checkout
we are not shipping at launch. **The safety test is passed, not
waived.** See §3's amendment note and §5.

⚠ It becomes live again the day Plus ships; the check must then run
**before** payment, not after (§5's open list).

### Rows deliberately not gated

| Not gated | Reason |
|---|---|
| ~~Student count~~ **← gated as of 2026-08-31** | ~~The above~~ — see the reversal note above and §3's amendment |
| Programme / cohort count | Costs us almost nothing, and caps make the product feel mean before it has proved anything |
| Question / note count | Same, plus three separate authoring surfaces to police |
| "Analytics depth", "library: limited" | ⚠ **Unimplementable as written.** If a row cannot be stated as a number or a switch it does not belong in a plan table — it is a permanent argument about what "basic" means |

### ⚠ What this shape costs

1. **A free tutor never sees the student-facing experience** — no
   student ever exists on Free. §4's trial covers this; if it does not,
   the fallback is a **sandbox student**, not a quota.
2. **Free is genuinely generous.** Someone can build an entire
   programme and never pay. Intentional — they also cannot teach a
   single person — but we must be comfortable being used as a free
   authoring tool.
3. ~~**It is an all-or-nothing wall.** No gentle middle where a tutor
   with 3 students limps along. That is the trade for having no quota
   system.~~ ⭐ **No longer true as of 2026-08-31** — a small band *is*
   the gentle middle, and it is priced. This cost is simply gone.

---

## 4. The trial, and why its clock starts late <span>PROPOSAL</span>

**30 days of Pro, no card required. The clock starts at the tutor's
first enrolment — not at signup. It ends by dropping to Free, never to
a lockout.**

### The objection this answers

Sam, on the first version of §3:

> *building one programme will be actual work — then I build it and
> can't use it. That forces me to upgrade, but I don't really get the
> experience of the platform. And 30 days may not be enough to build a
> full programme.*

Correct, and the fault was the clock's starting point. A trial that
begins at signup is spent **building** — the part that needs no trial —
and the tutor reaches the teaching loop on day 28 with two days left.

⭐ **Starting the clock at go-live inverts it.** Build for a month or
three, free, at whatever pace. The 30 days are then spent entirely on
the thing that actually converts: running a real cohort, watching
progress fill in, taking attendance, seeing a student move through the
curriculum.

It costs nothing to implement — the trial start is a timestamp written
at first enrolment rather than at account creation.

ⓘ Pair it with **preview-as-a-student**, which is already open work
(`tutor-onboarding.md` §14 and the 2026-08-25 sessions), so a free
tutor can walk their own curriculum before ever going live.

⚠ **Ending to Free, not to a lockout, is load-bearing.** A trial that
ends in a locked account destroys content the tutor spent weeks on and
makes the product feel like a trap. Ending to Free means they keep
everything and simply cannot take new enrolments — which is exactly
§5's lapse behaviour, so it is one rule, not two.

---

## 5. Accountability, lapse and grace <span>REWRITTEN 2026-08-31</span>

### ⭐⭐ The tutor is accountable to their students. We are not the guarantor. <span>SETTLED 2026-08-31 (Sam)</span>

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

⭐ **A fact that materially narrows the risk, verified 2026-08-31.**
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

#### The three conditions this decision comes with <span>SETTLED 2026-08-31 (Sam)</span>

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
- **2026-08-31 — reinstated.** ⭐ We return to the 2026-05-17 position,
  but with three things it never had: a **stated reason** (we never
  took the student's money, so the promise is not ours to guarantee),
  **disclosure** (terms at enrolment and in the email), and a **soft
  landing** (warning, a window, and the tutor's contact details).

⚠ **The 2026-05-17 clause was therefore right, for a reason it never
gave.** It read as a platform protecting its own cash flow; it is
better defended as a platform refusing to guarantee somebody else's
contract.

### The model, in Sam's own two questions <span>SETTLED in shape 2026-08-31 (Sam) — every number PROPOSAL</span>

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

ⓘ **Verified 2026-08-31**, since the model is borrowed: MoodleCloud's
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

### ⭐⭐ No lifetime access. The platform maximum is 24 months. <span>SETTLED 2026-08-27 (Sam) — ⚠ NOT BUILT — ⚠⚠ ITS REASON CHANGED 2026-08-31, RE-DECIDE</span>

⚠⚠ **Read this box before the section.** The cap was settled to bound
**our** liability for a lapsed tutor's students. **2026-08-31 decided
that is not our liability** — so the original reason is gone.

⭐ **And the seat model now prices the access window automatically.** A
tutor who grants two years ties that seat up for two years, so **they**
pay for the generosity, not us. The economics enforce what a platform
rule was enforcing.

⚠ **Sam's own scenario is the argument against a 730-day pre-fill.** A
tutor runs a four-week course and leaves the box alone; our maximum
takes over; he is now accountable for two years of something he never
promised — **and it costs him a seat for two years**. That is us
inventing an obligation and then billing for it. It is the same
path-of-least-resistance failure as today's blank-means-lifetime, with
a smaller number attached.

⏭ **Two calls, both open:** does a platform maximum survive at all (as
a backstop, not as liability control)? And what is the box pre-filled
with — the maximum, something proportionate to the programme's length,
or nothing, forcing a choice?

**The cap may well survive. It should not survive by inheritance.**
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

## 7. Plus — and why the approval is not purchasable <span>PROPOSAL</span>

On-platform collection is **two independent gates**: a plan *and* an
approval. **The approval cannot be bought.**

### Why

- It is the same axis separation as §2 — vetting standing and
  commercial standing are different questions, and merging them has
  produced a bug every time.
- If money alone bought on-platform collection we would be **selling
  access to a risk we carry**, and would be commercially incentivised
  to grant it to people we should not.
- ⚠ **Refunds and chargebacks land on us** (§6). Per-tutor discretion
  is the honest control for an exposure we cannot delegate.

### The approval has real content

On-platform requires a **verified Paystack subaccount** — bank details
and account-name verification. Paystack is explicit that *"Paystack
won't be liable for payouts to the wrong bank account"*, so the
verification is ours to do. **That verification is the trust step**; it
is not an arbitrary judgement.

### What Plus is actually worth to a tutor

Worth stating, because it justifies a price: no chasing MoMo
screenshots, no manual mark-paid per student, **instalments that
enforce themselves**, automatic enrolment on payment, and a real
revenue ledger. For a tutor running 40 students on deposit-plus-balance
that is hours a week.

⭐ Which is also why the money here is better as a **percentage than a
higher subscription** — it scales with our exposure, which is the thing
that actually varies.

### ⚠ Sequencing

**Free and Pro are almost entirely assembly of what exists. Plus is a
genuine arc** — subaccount creation and verification, the flat
`transaction_charge`, refund handling, the approval surface.

So: **Free and Pro at launch. Plus when there are tutors we would vouch
for and a Paystack conversation behind us.**

⚠ Where `subaccount_code` lives is **open**. §2 says `nclex_tutors`
holds no money. A payout destination is arguably closer to *identity*
than to *plan or expiry* — but it would be the first money-shaped field
ever to touch that table, and the question deserves a decision rather
than a default.

---

## 8. Setup credits — "we'll set your content up for you" <span>PROPOSAL</span>

Sam's addition. **Plus includes a starting balance; any paying tier can
buy more.**

⭐ **Deliberately an add-on at every tier, not a Plus property.** Plus
otherwise means *"we handle your money"*; setup means *"we type in your
content"*. They appeal to **different tutors** — one has material and
no payment need, the other has money flowing and no content problem.
Bundled, one of them overpays.

### ⚠ This is the first thing in the model with a real marginal cost

Every other capability is software: one tutor or a thousand, the cost
barely moves. **Setup is our time.** So it can never be "unlimited", it
must be bounded in **time as well as quantity**, and it is the one line
that can hurt us if it sells well.

Concretely: 40 Plus signups in a month = **200 programmes of setup work
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
**10 credits**, which feels like the right size for a Plus starting
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
  Otherwise Plus carries an unbounded liability callable in two years.
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

## 9. The numbers — all open

| | Status |
|---|---|
| Price of Pro | ⚠ **Open.** The "$29/month" figure predates any real thinking and may not survive it (`tutor-onboarding.md` §12) |
| Price of Plus | Open |
| Platform fee % | Open |
| Currency — USD or GHS | Open, and see §10 |
| Setup credit price for Pro | Open. We do not know our own unit cost. Publish *"from GHS X"* or "request a quote" until five jobs have been done and timed |
| Trial length | 30 days proposed |
| Included setup credits on Plus | ~10 proposed |

### ⚠⚠ The most under-examined question in this document

**How does the tutor's subscription actually recur?**

Neither the ChatGPT analysis nor the design conversation touched it,
and it is not small. A monthly price implies recurring card-on-file.
Whether a **Ghanaian-issued card can hold a recurring USD charge** is
unverified — and **MoMo generally does not do recurring at all.**

This could push toward annual billing, manual renewal, or pricing in
GHS. ⭐ **It is the only open item that could invalidate the pricing
*shape* rather than merely adjust a number**, and it should be answered
before anything here is ratified.

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

| Position | Rejected alternative | Why |
|---|---|---|
| **One gate: enrolment** | A quota matrix (programmes 1, cohorts 1, students 10, questions 50) | Eight enforcement points, the cardinality trap, and downgrade semantics — the three things §12 refused to design. One gate has none of them |
| **No student cap, ever** | "10 students on free" | ⚠ The wall is hit by a student who may already have paid the tutor off-platform. Safety, not economics |
| **Trial clock starts at first enrolment** | 30 days from signup | The trial would be spent building, and the tutor reaches the product on day 28. Sam's objection; the fix costs nothing |
| **Trial ends to Free** | Trial ends to a lockout | Destroying weeks of content makes the product a trap — and it makes lapse and trial-end one rule instead of two |
| **Off-platform at launch** | $29 + 5% of on-platform sales from day one | Merchant-of-record, refunds and chargebacks land on us. Off-platform is **already built**, so deferring costs nothing |
| **On-platform gated by plan AND approval** | A tier you can simply buy | Selling access to a risk we carry, and incentivising ourselves to grant it badly |
| **Setup credits as an add-on at any tier** | A Plus-only property | Payments and content-entry appeal to different tutors; bundled, one overpays |
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

## 11. Open questions

1. ⚠⚠ **How the subscription charge recurs** (§9). Answer first — and
   **more pressing since 2026-08-31**, because seat bands are likely
   annual.
2. The numbers (§9) — now including **band sizes and seat prices**,
   and underneath them the question that decides the shape: **will a
   Ghanaian tutor accept per-seat pricing at all?**
3. **Bands only, or a monthly fee as well?** Equivalently: is a band
   *included* in Pro/Plus or *bought on top*, and is Plus's advantage a
   bigger band, cheaper seats, or neither? (§3 amendment)
4. ⚠⚠ **Does the 24-month platform maximum survive, and what is the
   access box pre-filled with?** Its original reason — bounding our
   liability — was removed on 2026-08-31. Do not inherit it. (§5)
5. **Grace length**, and whether **students** are warned at the same
   moment the tutor is. (§5)
6. ⚠ **Unenrolling must be visible to the student.** When a tutor
   removes someone mid-programme, the student should hear it **from
   us** — *"your tutor has removed you from this programme"*. Cheap to
   build; it is the transparency that makes the accountability position
   defensible, and it deters casual seat-churning because the tutor
   knows their students are told.
7. ⚠ **If students ever self-enrol** (on-platform checkout, §7), the
   seat check must run **before** payment — in `startPayment`, which
   writes its rows before money moves. The natural place,
   `lib/payments/activate.ts`, runs *after* Paystack has taken the
   money: that would mean taking a student's money and then refusing
   her.
8. ✅ ~~Reconcile §5 with the 2026-05-17 access-window rule~~ — settled
   2026-08-27, then **reversed 2026-08-31**: we are back on the
   2026-05-17 rule, with a reason, disclosure and a soft landing. See
   §5's *"settled twice and reversed once"* note. ⚠ Still **not
   built**.
9. Does a lapsed tutor's public page hide or show "enrolment closed"?
   (§5)
10. Where `subaccount_code` lives, if Plus is built. (§7)
11. Does Free stay forever, or go read-only after long inactivity?
12. Do free tutors' students get transactional emails? ⓘ They cost us
    real Resend spend and are sent on the tutor's behalf — though under
    §3 a free tutor has zero seats and therefore no students, so this
    only bites if the gate ever loosens.
13. What happens to **enquiries** that arrive for a tutor who cannot
    enrol anyone.
14. Is the free tier worth its cost at all, versus everyone-paid with a
    longer trial and no free tier?

---

## 12. Slices

**Not scoped, deliberately.** §11.1 must be answered first, and the
whole document is a proposal. When it is ratified, the natural
sequence is:

1. Subscription record + the one enrolment gate + the trial timestamp
2. The billing page and the upgrade flow
3. Setup-credit ledger + balance display + request form (§8's minimum)
4. Plus: subaccount, verification, flat `transaction_charge`, approval
   surface

⚠ Steps 1–3 are mostly assembly of what exists. **Step 4 is a genuine
arc** and should not be sequenced with the others.
