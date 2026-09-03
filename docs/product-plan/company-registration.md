# Company Registration — settled 2026-09-02

Canonical home for **where and what Quademia incorporates**, the payment
rails that follow from that choice, and the Ghana ORC filing pack. It
extends `domain-and-identity.md` §2 (*Company name*), whose checklist now
points here; the reasoning lives in this file.

⚠ **Provenance.** These decisions were made in a **Claude web chat**
session on 2026-09-02, not in Claude Code. Sam wrote the handoff summary
and it was logged into the repo on 2026-09-03. Nothing here is verifiable
from the codebase — it is off-platform work (registrar, payment
processor, tax authority) — so treat it as **Sam's record of what was
decided**, not as something a later session checked. The one exception:
the parent-site README claim under *Corrections to standing docs* was
read from GitHub and holds.

Companion artefact, **deliberately kept OUT of this repo**:
`quademia-registration-answer-key.md` — the field-by-field guide for the
ORC forms, sent to the Ghana co-director. It carries personal data (TINs,
addresses) and must not be committed anywhere.

---

## The settled decisions

### 1. Jurisdiction: **Ghana first — and the doc's Ghana assumption survived for a different reason than it was made**

`domain-and-identity.md` §2's checklist assumed Ghana ORC without ever
weighing the alternative. This session weighed it, and the answer is
Ghana first, UK second, **both** — sequenced by what each unblocks:

- ⚠ **The naive UK-vs-Ghana analysis initially pointed AT the UK** — Sam
  lives in and runs everything from England, and HMRC's
  central-management-and-control test means a Ghana company directed
  from England risks UK tax residence anyway (both countries' compliance,
  one company). That analysis was correct and is retained as a live
  caution for the accountant (see *Standing cautions*).
- ⭐⭐ **What flipped the sequence: the Paystack Starter account is at its
  lifetime collections ceiling.** Confirmed by Sam — it will not take
  further payments. MyNMCLicensure revenue is therefore OFF until the
  account upgrades to Registered Business, and **only a Ghana-registered
  entity can upgrade it** (Paystack Ghana requires Ghana registration
  documents + a settlement account matching the certificate name
  exactly). A UK certificate is useless to the live-revenue problem. So
  Ghana is not the "later" entity — it is the urgent one.
- ⭐ **Ownership: Sam personally, never the UK company.** Sam is a
  Ghanaian citizen. A wholly Ghanaian-owned company sits entirely
  outside the GIPC/GIPA foreign-investment regime (historically US$500k
  minimum capital for wholly foreign-owned; being dismantled by the GIPA
  law but still a registration layer). The moment a UK parent owns the
  Ghana company it becomes foreign-participation. **Consequence: the two
  companies are SIBLINGS, both owned by Sam directly — not
  parent/subsidiary.**

### 2. Name: **QUADEMIA LIMITED** (Ghana)

- Rejected: **"Quademia Ghana Limited"** — 22 chars sits at Paystack's
  statement-descriptor truncation edge, reads less like the brand
  (statement recognition is the whole point of legal-name-equals-brand,
  §2), and names today's ONLY operating company as if it were the
  subsidiary of a parent that doesn't exist.
- Rejected: **"Quademia Consult Limited"** — misdescribes (we sell
  platforms and exam administration, not advice), resurrects the retired
  "QAcademy Educational Consult" shape, and at 24 chars it truncates.
- Disambiguation is the SECOND company's job: UK and Ghana are separate
  registries, so the UK company can also be "Quademia Ltd", or take
  "Quademia Education Ltd" if two identical names ever confuse a
  contract.
- ⚠ Ghana's ORC register is not searchable from here the way Companies
  House is — name search on rgdeservices.com is open item #1. Fallback
  if taken: **Quademia Education Limited**.
- ⓘ UK side pre-checked: Companies House search found no "Quademia"
  (nearest: Quadem, Quadex, Quadratum) — plain "Quademia Ltd" looks free
  there for when that day comes.
- ⓘ **"Limited" vs "Ltd" is decided by a tick on Form 3 §A**, and the
  styling that prints on the certificate is the one Paystack will match
  character for character (see §6). Settle it at the counter before any
  account is opened.

### 3. Company type: **private company limited by shares, Act 992** — with the Act's actual demands

Not a Business Names Act sole proprietorship (Form A read and set aside:
no legal personality, no "Limited", Paystack would verify Sam
personally, GHS 25/yr renewal). The limited company's real requirements,
from the forms:

- **Two directors minimum, one ordinarily resident in Ghana.** Sam + the
  Ghana co-director (a trusted person — confirmed available). Director
  residential addresses do NOT appear on the public record.
- **Secretary: cheaper than feared.** Form 3 §L's qualification tick-list
  includes "tertiary level qualification" and "appears to the directors
  as capable" — a trusted person with a degree qualifies. A corporate
  firm remains the tidier option, not a necessity. Decision open (item
  #4 in the answer key).
- **Auditor: the one genuine outsourcing requirement.** Licensed under
  the Chartered Accountants Act, signed consent letter attached at
  filing, max six-year term. No route around it.
- Shares: single equity class, Sam sole subscriber, modest stated
  capital (the answer key uses GHS 5,000 / 10,000 shares as the example
  — duty scales with stated capital, confirm rate with the auditor).

### 4. Payment rails: **per product, not one processor for everything**

The doc's implicit "one Paystack account carries all" died on one fact:
⭐⭐ **Ghanaian businesses on Paystack settle international payments in
GHS only** (only Kenya- and Nigeria-based businesses can hold other
currencies). A Registered Business DOES accept both rails — mobile money
+ local cards + international Visa/Mastercard worldwide (no Amex for
Ghana) — but a US nurse's dollars arrive as cedis. Serviceable bridge;
wrong long-term rail for MyNclex. Hence:

| Product | Rail | Entity |
|---|---|---|
| MyNMCLicensure + MyTeacher | Paystack (MoMo + cards) | Quademia Limited (Ghana) — NOW |
| MyNclex primary | Stripe, USD | Quademia Ltd (UK) — at launch, not before (prod is empty by design; no dollar revenue is being lost) |
| MyNclex secondary | Paystack GHS/MoMo button for Ghana-based NCLEX aspirants | Quademia Limited (Ghana) |

- ⚠ **Dual-rail on one product splits revenue across two entities**
  (Stripe→UK, Paystack→Ghana). Solvable and common — Ghana company as
  local reseller under a simple intercompany agreement — but it is an
  accountant conversation, not a year-end improvisation.
- **Upgrade IN PLACE**, Starter → Registered on the existing account's
  Compliance page — gamma's live keys and history survive. This is also
  the moment for the §2 email sweep (account email → admin@quademia.com).
- ⓘ This connects to `tutor-plans-and-billing.md` §9, which had left the
  tutor-plan currency **open** (GHS and USD both intended) and noted that
  Ghana reaches Stripe only *through* Paystack. The UK entity is the
  door to Stripe proper. Nothing in that doc is changed by this one;
  the entity question it flagged now has a shape.

### 5. Flutterwave: **researched, held in reserve — one written question outstanding**

Researched 2026-09-02 (Sam asked; full reasoning in the chat session):

- Real scale and licensed in Ghana since 2017 (FTSL, Accra); mobile
  money MTN/Telecel/Airtel; Kenya's 2022 money-laundering case ended
  with the ARA withdrawing and the company cleared (Nov 2023), funds
  returned; since then licences across ~34 countries incl. Nigeria's CBN
  switching licence.
- ⚠ Yellow flags for a small merchant: international card fee raised
  3.8% → **4.8%** (Nov 2024) — roughly double Stripe; polarised
  Trustpilot (55% five-star / 32% one-star — the settlement-hold/support
  failure pattern); CFO + two senior finance exits amid the IPO push.
- ⭐ **Its ONLY structure-changing promise: USD settlement for a Ghana
  merchant** — which would let one Ghanaian entity carry MyNclex dollars
  and defer the UK company. Their docs cut both ways (help centre: non-US
  merchants can settle USD, min $1,000 threshold, examples always Kenyan;
  their own Ghana materials: "payouts in GHS"; pricing page:
  international cards "settled in your local currency by default").
- ⏭ **The action, owed this month:** one email to Flutterwave
  (hi@flutterwavego.com / contact form), answer required IN WRITING: as a
  Ghana-registered merchant, (1) can we price in USD, (2) can we settle
  in USD — domiciliary account or USD payout balance, (3) under what
  conditions/BoG requirements. Expectation: GHS-only, plan unchanged. If
  yes: UK company defers.
- **Dropped as primary processor.** Reserve/fallback only.

### 6. Settlement account: **name-match is the trap; MoMo is the shortcut**

- Paystack activates a Registered Business only when the settlement
  account name matches the registration certificate **character for
  character** — settle the exact styling (Limited vs Ltd, decided by a
  tick on Form 3 §A; the answer key tells the co-director to confirm at
  the counter which tick prints which) BEFORE opening any account.
- ⭐ **Paystack Ghana accepts a merchant mobile money account in the
  business name as the settlement account, not only a corporate bank
  account** — and a business MoMo wallet opens much faster than a
  corporate bank account with a director abroad. Sequencing: MoMo first
  → Paystack live → corporate bank account at its own pace (banks may
  want signatories in-branch; the co-director is a signatory via board
  resolution). Bonus: MoMo payouts have no minimum threshold; bank
  payouts min GHS 50.
- ⓘ Filed for later, not needed now: a USD domiciliary/FX account is the
  account type the Flutterwave scenario would need; the UK company gets
  its own account (Tide/Starling/Wise) when it exists. **Never mix the
  two companies' money.**

### 7. The filing pack: **complete, decoded, answer key produced**

Two batches read: the co-director's ORC counter bundle (Form 3, Form A,
26(B), 26(C), BO1, BO2) and Sam's downloaded "Private-Limited-Company"
pack — same Form 3 version (no counter-vs-online mismatch), and it
supplied the missing piece:

- ⭐ **Form 26(A) — Consent to Act as a Director — was absent from the
  first bundle** and is required per director (Form 3 wants BOTH a
  consent letter and the 26(C) statutory declaration for each). Two
  copies needed.
- ⚠ **The pack's ReadMe says BO forms only for extractive-industry
  sectors — the ReadMe is stale.** BO1 itself says every company;
  current ORC practice is BO declaration for all new registrations. File
  BO1 + one BO2 (Sam, natural person, 100% direct, veto yes) regardless.
- ⚠ 26(C)'s year line is pre-printed "2020" — strike and correct. It is
  a statutory declaration (commissioner for oaths); whether the ORC
  accepts Sam's sworn before a UK notary is a question for the filing
  agent — wet-ink originals courier to Ghana either way.
- Other pack contents: cover note (front sheet — all officers + TINs),
  GRA individual TIN form (not needed, see §8), supplementary sheets (not
  needed: two directors, one subscriber, no corporate/minor holdings).
- Sector ticks: **Education + Telecom/ICT — deliberately NOT Health
  Care.** Quademia is education ABOUT healthcare (the UWorld/Kaplan
  category), and health-sector classification invites
  payment-processor enhanced review (Paystack's Ghana category rules)
  for no gain. Health appears instead as a phrase inside the objects:
  *"…including education and training for health professionals…"*
  (Sam's call, 2026-09-02).
- Objects wording (Form 3 §D) written broad on purpose — it
  pre-authorises the **exams-for-institutions business model** (which is
  MyExams' documented Direction 1/2, not a new idea): educational
  technology and e-learning incl. health-professional training;
  examination administration and assessment for individuals,
  institutions and organisations; platform development; related
  services.
- BOP (Business Operating Permit): apply LATER (district-assembly
  matter, must not gate incorporation).
- MSME classification: Micro, honestly.

### 8. TIN: **resolved — the Ghana Card PIN is the TIN, and Sam's verifies**

- Since April 2021 GRA uses the Ghana Card PIN as the individual TIN; the
  old P00 numbers are retired for individuals. The pack's TIN boxes are
  pre-printed "GHA-" for this reason.
- ✅ **Sam's PIN checked on gra.gov.gh/online-tools/verify-tin → VALID**
  (2026-09-02). Decisive — no myid linking step needed. That PIN goes in
  every personal TIN box (cover note, Form 3 §J + §P, BO2). ⚠ The PIN
  itself lives in the answer key, never in this repo.
- Rule of thumb, recorded in the answer key: **human → that human's Ghana
  Card PIN; company → blank** (Quademia Limited is born with its own
  corporate TIN at incorporation — that one goes to the bank and
  Paystack).
- ⏭ Co-director runs the same 30-second check on their own PIN before
  filing.

---

## §2 checklist deltas

Merged into `domain-and-identity.md` §2 on 2026-09-03. Recorded here too
so the reasoning and the checklist can be read side by side.

- [ ] Name availability check at Ghana ORC → **name settled: QUADEMIA
      LIMITED; fallback QUADEMIA EDUCATION LIMITED; search on
      rgdeservices.com is open item #1**
- [x] ~~Ask Paystack which registration tier they need~~ → **answered by
      their docs: Registered Business; company limited by shares; docs
      required = registration certificate + corporate bank OR merchant
      MoMo account matching the name + director details + Ghana TIN + GPS
      address**
- [ ] Business bank account in the exact registered name → **refined:
      merchant MoMo wallet first (also valid for Paystack), corporate bank
      account second**
- [ ] Trademark sanity check (Ghana + USPTO) → unchanged, still open
- [ ] @quademia social handles → **still open, re-flagged: do during the
      registration month, costs nothing**
- NEW [ ] **Flutterwave written USD question** (§5 above) — this month
- NEW [ ] **UK incorporation trigger:** MyNclex approaching real launch
      volume → Companies House "Quademia Ltd" (looked free), Stripe,
      Tide/Starling/Wise. Not before. Note: Companies House now requires
      director identity verification (GOV.UK One Login); registered
      office ≠ home address recommended.

## Corrections to standing docs

- ⚠ **The 2026-08-19 note under `domain-and-identity.md` build-order
  item ⑤ ("the policy names a data controller, so incorporation may be
  further along than §2 records — confirm before repeating") is now
  confirmed the OTHER way.** The parent-site README (read from GitHub
  2026-09-03) states the legal pages are DRAFTS, not in force,
  controller/contracting party **left blank**, banner on both pages,
  pending registration + professional review + Sam's commercial blanks.
  So registration remains genuinely upstream of the legal text, exactly
  as §2 and the *Legal pages* section originally held. Once the
  certificate lands, the controller is **QUADEMIA LIMITED (Ghana)**.

## Standing cautions (for the accountant, when one is engaged)

- ⚠ **UK management-and-control risk on the Ghana company is real and
  unresolved** — a Ghana company whose decisions are all taken in
  England can be argued UK tax resident. A Ghana-resident co-director
  and genuine Ghana operations help; put it to a UK/Ghana cross-border
  accountant before year-one accounts, not after.
- ⚠ The MyNclex dual-rail intercompany arrangement (§4) goes to the same
  accountant.
- ⓘ Ghana VAT: non-resident digital-service rules exist and Ghana
  registration changes the company's own position — flag, don't
  improvise.

## Sequence from here

1. Name search → 2. engage auditor + settle secretary → 3. sign/declare
consent + declaration forms (Sam's couriered) → 4. file (cover note,
Form 3, 26(A)×2, 26(B), 26(C)×2, BO1+BO2+Ghana Card copy, auditor
consent, fee) → 5. certificate + corporate TIN → 6. MoMo/bank account in
exact name → 7. Paystack Starter→Registered upgrade + email sweep →
8. MyNMCLicensure revenue back on; privacy policy gets its controller.
**Target: filed within one month of 2026-09-02.** During the month, in
parallel: Flutterwave email, @quademia handles.

## What this changes for the product code

Nothing today. Three things to remember when it does:

- **No user-facing string may name "Quademia Limited" or a registration
  number until the certificate exists** — the parent site's standing
  rule (its `CLAUDE.md`) already says so, and it applies here too.
- **The tutor-plan currency question** (`tutor-plans-and-billing.md` §9)
  now has an entity behind each answer: GHS via Paystack on the Ghana
  company now; USD via Stripe on a UK company later. Still a proposal.
- ⚠ **Unverified from the repo: which Paystack account MyNclex's prod
  keys will come from.** If it is the same Starter account gamma uses —
  the one at its ceiling — then a first real MyNclex sale on Paystack
  waits on the same upgrade. MyNclex prod takes no money today (empty by
  design), so nothing is lost yet; settle this before a live secret key
  goes on the prod Worker.
