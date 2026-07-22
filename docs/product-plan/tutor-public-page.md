# Tutor Public Page

*Planning document. Captures the initial product discussion of 2026-07-22.*

> **Status: planning / design phase.** No schema or implementation is approved
> by this document. Table names, routes, public-view shapes, publishing rules,
> and service/payment behaviour are illustrative until the build plan is
> finalised.

## Summary

Give every tutor who uses the programme side of MyNclex a professional public
page inside the platform — effectively a small, structured website that adapts
to the tutor.

The page tells prospective students:

- who the tutor is;
- what they teach and how they teach;
- which programmes are available;
- which additional services they offer;
- how to contact them;
- why the tutor is credible and relevant to the student's needs.

The tutor receives a shareable public link without needing to buy a domain,
build a website, arrange hosting, or manage a separate enquiry system.

A representative public route is:

```text
/tutors/[slug]
```

Examples:

```text
/tutors/ama-mensah
/tutors/nclex-pro-solutions
```

The working product name in this document is **Tutor Public Page**. Other
possible labels are **Tutor Storefront**, **Tutor Mini-site**, or **My Teaching
Page**. The tutor dashboard should probably use the plain label **Public Page**.

---

## The problem

The current public discovery experience is programme-first. The public
`/programmes` page lists published programmes from different tutors, and each
card attributes the tutor or business behind it.

That is useful when a visitor already knows they want a programme, but it does
not give a tutor a complete public identity. A prospective student may still
want to know:

- Who is this tutor?
- What is their nursing and teaching background?
- Which subjects do they specialise in?
- Do they support beginners or repeat test-takers?
- Do they provide one-to-one coaching or other services?
- What other programmes do they run?
- How can I contact them?
- Can I trust the claims on the page?

Most tutors do not have their own website. Even tutors with a business name may
rely mainly on WhatsApp, Instagram, TikTok, Facebook, or direct referrals.

MyNclex can remove that barrier by giving each tutor a polished public page as
part of the platform.

## Why it matters to MyNclex

This is both a tutor-acquisition feature and a student-discovery feature.

### Tutor value

A tutor receives:

- a professional public presence;
- a shareable MyNclex URL;
- automatic promotion of their published programmes;
- a place to describe additional services;
- structured lead collection;
- stronger credibility than a social-media profile alone;
- no need to maintain a separate website.

### Platform value

MyNclex receives:

- a stronger reason for tutors to join;
- more inbound traffic when tutors share their page;
- better programme discovery;
- more enquiries and enrolments;
- a clearer connection between a tutor's public identity and their teaching
  workspace;
- a future foundation for tutor and service discovery.

The tutor proposition becomes:

> Run your programmes, manage your students, and receive a professional public
> teaching page — all in one place.

---

## Product definition

The Tutor Public Page is a **structured tutor storefront**, not a generic
website builder.

MyNclex provides one high-quality responsive page template. The content and
selected presentation settings adapt to the tutor, but the tutor does not drag
arbitrary blocks around a canvas or design a website from scratch.

This protects:

- visual quality;
- mobile responsiveness;
- accessibility;
- platform consistency;
- support burden;
- safe public-data handling.

The page combines three existing or adjacent product concepts:

1. **Public tutor identity** — person and optional business branding.
2. **Published programmes** — loaded automatically from the tutor's real
   programme records.
3. **Tutor services and enquiries** — additional offers and a professional
   contact path.

---

## Existing foundations

The feature should extend the existing public-discovery architecture rather
than create a separate parallel system.

### Public profile already exists

`nclex_users.public_profile` already stores outward-facing tutor information.
The current `PublicProfile` shape supports:

- headline / current role;
- speciality;
- years of tutoring experience;
- personal biography;
- optional business name;
- optional business logo URL;
- optional business biography.

The existing tutor profile editor already provides:

- structured person and business fields;
- explicit save behaviour;
- unsaved-change protection;
- a live preview.

The public-page editor can evolve this surface rather than duplicate it.

### Programme discovery already exposes tutor attribution

The public programmes page already shows:

- tutor or business attribution;
- avatar or initials;
- programme title and tagline;
- delivery mode;
- duration and access window;
- public price or "Contact for price";
- next-cohort / availability information.

These programme cards should be reused on the tutor page, filtered by the
owning tutor.

### Curated public projection already exists

The `nclex_public_*` view family is already the single public read path for
published programme data. Anonymous visitors receive a curated public slice
without opening the underlying user, programme, cohort, or curriculum tables.

The tutor page should follow the same rule through a dedicated public
projection, rather than reading base tables directly.

### Programme enquiries already exist

Published programmes already support a structured contact form containing:

- name;
- email;
- optional phone number;
- preferred contact method;
- optional message.

The tutor page can extend this into tutor-level and service-level enquiries
without exposing the tutor's private account contact details by default.

---

## One template that adapts to the tutor

Every tutor uses the same responsive page system, but the page changes based on
available content and selected settings.

### Personal tutor

Show:

- tutor photograph;
- tutor name;
- professional headline;
- personal biography;
- specialities and teaching approach;
- programmes;
- services;
- contact section.

### Tutor with a business or academy

Show:

- business logo and business name;
- tutor / founder identity alongside the business;
- business description;
- programmes;
- services;
- contact section.

The business should not silently replace the responsible person. The existing
attribution rule — business and tutor shown together — remains the safer and
clearer default.

### Sparse or unavailable content

Sections with no usable content disappear cleanly.

Examples:

- no additional services → hide the services section;
- no published programmes → show services and a "No programmes currently open"
  message;
- no business branding → use the personal tutor presentation;
- no reviews → do not show an empty review block;
- no public social links → keep the internal enquiry form as the contact path.

A tutor should not be able to publish a visibly empty or low-trust page. See
*Publishing requirements*.

---

## Proposed public-page structure

## 1. Hero

The top of the page establishes identity, relevance, and the primary action.

Possible content:

- tutor photograph;
- business logo, where applicable;
- tutor name;
- business / academy name;
- current role or professional headline;
- main specialities;
- short introduction;
- verification badge where applicable;
- primary call to action;
- secondary call to action.

Example:

> **Ama Mensah, RN, MSN**  
> Adult Health and NCLEX-RN Educator  
> Helping international nurses strengthen clinical judgement and prepare
> confidently for the NCLEX.

Suggested calls to action:

- **View programmes**
- **Contact Ama**

## 2. Trust summary

A compact row of factual trust signals may appear beneath the hero.

Possible fields:

- years tutoring;
- main specialties;
- delivery formats;
- languages;
- verified tutor status;
- verified credentials;
- response-time indicator, only if calculated from real enquiry data.

Only facts supported by stored or verified data should be shown. The platform
must not invent pass rates, student counts, response times, qualifications, or
other trust claims.

## 3. About the tutor

The tutor explains:

- nursing background;
- clinical experience;
- teaching experience;
- subject expertise;
- typical learner profile;
- approach to NCLEX preparation;
- motivation for teaching.

The editor should provide prompts rather than an unlimited blank page.

Suggested prompt:

> Tell students about your nursing background, teaching experience, areas of
> expertise, and the kind of support they can expect from you.

## 4. Programmes

This section is automatic. The tutor does not manually create duplicate
programme cards for the public page.

The page queries the tutor's real published programmes and displays the
existing public programme card information:

- title;
- tagline;
- tutor-led or self-paced;
- duration;
- access window;
- next cohort or current availability;
- public price or "Contact for price";
- enrolment / waitlist / view-details action.

Behaviour:

- published programmes appear automatically;
- drafts and archived programmes stay hidden;
- a tutor-led programme with an open cohort can show **Enrol now**;
- a published programme without an open cohort can show **View details** or
  **Join waitlist**, where supported;
- self-paced programmes can remain continuously available where their current
  programme rules allow it.

## 5. Additional services

Programmes and services are separate concepts.

A programme is structured learning delivered through the existing programme
system. A service is a smaller or different tutor offer, for example:

- one-to-one NCLEX coaching;
- study-plan consultation;
- repeat-test-taker assessment;
- pharmacology revision session;
- dosage-calculation workshop;
- question-bank review session;
- group revision class;
- interview preparation;
- mentorship;
- licensure-process orientation.

Each service may contain:

- title;
- short description;
- delivery method;
- duration;
- public price or "Contact for price";
- status;
- sort order;
- enquiry / booking-request action.

Example:

> **Personal NCLEX Study-Plan Review**  
> A 45-minute consultation to review your preparation history, identify weak
> areas, and build a focused study plan.  
> Online · 45 minutes · Contact for price

### v1 service transaction rule

The first version should not require a complete standalone-service checkout
system.

Suggested v1 actions:

- **Send enquiry**
- **Request booking**
- **Ask about price**

Direct service payment, scheduling, refunds, and fulfilment tracking can remain
separate future work.

## 6. Teaching approach

A structured teaching-style section helps students understand how the tutor
works without relying only on a biography.

Possible selectable attributes:

- clinical-judgement focused;
- beginner friendly;
- suitable for repeat test-takers;
- scenario-based teaching;
- personalised study plans;
- live group classes;
- recorded lessons;
- weekly quizzes;
- performance feedback;
- small cohort sizes.

A tutor selects a limited number and may add a short explanation.

## 7. Qualifications and credentials

Possible structured credential fields:

- qualification / credential title;
- issuer;
- jurisdiction;
- issued year;
- expiry date, where relevant;
- verification status;
- public visibility.

The public page must distinguish:

- tutor-supplied information;
- platform-verified credentials.

Unsupported marketing claims should not be presented as verified facts.

## 8. Reviews and outcomes

Reviews are valuable but should not become tutor-authored testimonials with no
provenance.

A later verified-review model may accept reviews only from students whose
programme enrolment or eligible service relationship is known to the platform.

Potential display:

- average rating;
- number of verified reviews;
- written feedback;
- associated programme or service;
- review date.

**Deferred from the first version** unless a reliable verified-review model is
approved.

## 9. Contact

The default contact mechanism is a structured MyNclex enquiry form, not direct
exposure of the tutor's private account email or phone number.

Suggested interest choices:

- a specific programme;
- one-to-one coaching;
- group classes;
- a listed service;
- another service;
- general question.

Suggested visitor fields:

- name;
- email;
- optional phone number;
- preferred contact method;
- selected programme or service;
- message.

The enquiry should enter the tutor's existing lead-management workflow.

## 10. Public contact links

A tutor may optionally publish selected business contact channels:

- WhatsApp;
- public business email;
- public business phone;
- Instagram;
- TikTok;
- LinkedIn;
- Facebook;
- YouTube;
- external website.

These should not be stored inside the existing `public_profile` JSONB merely
because that object is public. Public contact settings need explicit fields,
validation, visibility controls, and a clear distinction from private account
contact information.

The internal enquiry form remains the safe default.

---

## Navigation and discovery

The public programme and tutor surfaces should reinforce one another.

### From `/programmes`

The programme card continues to open the programme detail page, while the tutor
name / avatar gains a separate **View tutor profile** path.

### From programme detail

Add a compact **About your tutor** section containing:

- tutor identity;
- headline;
- short biography;
- verified signals;
- **View full tutor page** link.

### From the tutor page

Every programme card opens its existing programme detail page.

### Future discovery

The current public discovery may eventually expand into:

- Browse programmes;
- Browse tutors;
- Browse services.

Possible later filters:

- subject area;
- tutor-led or self-paced;
- one-to-one or group;
- price range;
- availability;
- language;
- clinical speciality;
- beginner support;
- repeat-test-taker support.

This broader marketplace is not required for the first tutor-page release.

---

## Tutor editing experience

Suggested private route:

```text
/tutor/public-page
```

Possible editor sections:

1. **Profile**
2. **Branding**
3. **Programmes**
4. **Services**
5. **Credentials**
6. **Contact and links**
7. **Appearance**

Key behaviours:

- reuse and expand the current public-profile editor;
- explicit save rather than fragile auto-save;
- unsaved-change protection;
- live preview;
- desktop and mobile preview;
- draft / published status;
- publish and unpublish controls;
- copy public link;
- page-completion indicator;
- clear explanation of which information is public;
- automatic programme list preview;
- section visibility controls.

## Controlled appearance

The tutor should not receive a drag-and-drop website builder.

Reasonable controls:

- one polished responsive layout;
- a small set of approved accent themes;
- light or dark hero treatment;
- personal or business emphasis;
- optional banner image;
- section visibility;
- limited section ordering;
- compact or detailed programme-card presentation.

MyNclex retains control over spacing, typography, mobile behaviour,
accessibility, and responsive layout.

---

## Publishing requirements

A public page should require a minimum level of completeness.

Proposed minimum:

- active tutor account;
- unique public slug;
- tutor display name;
- profile image or business logo;
- headline;
- short biography;
- at least one published programme or one published service;
- at least one enabled contact path;
- acceptance of public-page and content rules.

Possible lifecycle:

```text
DRAFT → PUBLISHED → UNPUBLISHED
```

Admin actions may include:

- suspend public page;
- remove an unsafe or misleading field;
- reject a prohibited slug;
- revoke a verification badge;
- review reported content.

Whether every page requires manual admin approval before first publication is
an open question.

---

## Suggested data model

The current `nclex_users.public_profile` remains the source for the basic tutor
and optional business identity fields.

The following are initial shapes, not approved schema.

### `nclex_tutor_public_pages`

```text
tutor_id
slug
status
accent_theme
hero_style
banner_image_url
show_programmes
show_services
show_credentials
show_reviews
section_order
published_at
updated_at
```

Purpose:

- public-page lifecycle;
- route slug;
- page-level presentation settings;
- section visibility and ordering.

### `nclex_tutor_services`

```text
service_id
tutor_id
title
description
delivery_method
duration_minutes
price_currency
price_minor
show_price_publicly
status
sort_order
created_at
updated_at
```

Possible status:

```text
DRAFT · PUBLISHED · ARCHIVED
```

### `nclex_tutor_social_links`

```text
link_id
tutor_id
platform
public_url
sort_order
is_visible
created_at
updated_at
```

### `nclex_tutor_credentials`

```text
credential_id
tutor_id
title
issuer
jurisdiction
issued_year
expires_at
verification_status
is_public
created_at
updated_at
```

Possible verification status:

```text
UNVERIFIED · PENDING · VERIFIED · REJECTED · EXPIRED
```

### Tutor-level enquiries

The existing programme-enquiry model is programme-scoped. The tutor page needs
to support enquiries that may be:

- programme-specific;
- service-specific;
- general tutor enquiries.

Two possible approaches:

1. Extend the current enquiry table with nullable programme / service scope and
   a source field.
2. Introduce a broader tutor-lead parent that programme enquiries become one
   subtype of.

Do not silently choose between these during implementation; the existing
inbox, deduplication, status lifecycle, notifications, and analytics must be
reviewed first.

---

## Public projection and privacy

Create a curated public projection, for example:

```text
nclex_public_tutor_pages
```

It should expose only deliberately public information for:

- published pages;
- active tutor accounts;
- public profile fields;
- published services;
- approved public links;
- public credentials and verification state;
- published programme summaries.

The page must not read private account contact fields or underlying protected
tables directly from anonymous requests.

### Public-profile rule

`public_profile` remains public-display data only. Private or sensitive account
information must never be added there merely to make the public page easier to
build.

### Contact rule

- private tutor email and phone remain private by default;
- the internal enquiry form is always safe to offer;
- separately configured business contact channels may be displayed only when
  the tutor explicitly enables them;
- every public link and public contact field requires validation and abuse
  controls.

### Claims and verification

The page must distinguish between:

- tutor-provided description;
- measured platform data;
- verified credentials;
- unverified claims.

Pass rates, student counts, response-time claims, qualifications, employer
claims, and outcomes should not be presented as platform-verified unless the
platform can support that assertion.

---

## Suggested routes

Public:

```text
/tutors/[slug]
```

Tutor management:

```text
/tutor/public-page
/tutor/public-page/services
/tutor/public-page/credentials
/tutor/public-page/contact
```

The final private route structure may use one tabbed page rather than multiple
routes. The route decision belongs to the UI plan.

---

## SEO and sharing

The page is intended to be shared outside MyNclex, so it should support:

- stable canonical URL;
- page title and description;
- tutor / business Open Graph image;
- shareable social preview;
- meaningful heading structure;
- server-rendered public content;
- sitemap inclusion for published pages;
- noindex for draft / unpublished pages;
- redirect strategy when a slug changes.

Custom domains are not part of v1.

---

## Recommended v1 scope

Build:

1. One standard adaptive public-page template.
2. Unique tutor slug.
3. Tutor / business hero.
4. About section.
5. Automatic list of the tutor's published programmes.
6. Manually created service cards.
7. Tutor-level enquiry form.
8. Optional social / public business links.
9. Controlled accent and hero settings.
10. Live preview, draft, publish, unpublish, and copy-link controls.
11. Programme-list and programme-detail links to the tutor page.
12. Curated public projection and appropriate RLS / public-view boundaries.
13. Basic admin moderation controls.

## Deferred

Not required for v1:

- custom domains;
- drag-and-drop layout building;
- arbitrary custom HTML / CSS;
- blog posts;
- appointment-calendar integration;
- direct checkout for standalone services;
- service fulfilment workflow;
- refunds and service-payment disputes;
- verified student reviews;
- visitor analytics beyond basic platform events;
- public multi-tutor academy / team pages;
- advanced tutor marketplace search;
- custom page templates;
- newsletter tools;
- full CRM automation.

---

## Suggested delivery sequence

### Slice 1 — Public identity and route

- public-page table / slug / lifecycle;
- curated public tutor-page projection;
- hero and about sections;
- automatic published-programme list;
- public route;
- programme → tutor links;
- basic tutor editor and preview.

### Slice 2 — Services and enquiries

- service authoring;
- published service cards;
- tutor / service enquiry scope;
- inbox integration;
- enquiry notifications and deduplication review.

### Slice 3 — Contact, credentials, and moderation

- public contact / social links;
- structured credentials;
- verification states;
- admin moderation actions;
- reporting / abuse handling.

### Slice 4 — Discovery and optimisation

- optional tutor directory;
- tutor / service filters;
- verified reviews if approved;
- public-page analytics;
- conversion improvements.

---

## Success signals

Possible product measures:

- percentage of eligible tutors publishing a page;
- public-page completion rate;
- tutor-page visits;
- programme-detail clicks from tutor pages;
- enquiries submitted from tutor pages;
- enrolments attributed to tutor pages;
- number of tutors sharing their public URL;
- tutor activation and retention after receiving a public page;
- service enquiries per published service;
- report / moderation rate.

These are measurement ideas, not v1 acceptance criteria.

---

## Risks and guardrails

### Empty or poor-quality pages

Use minimum publishing requirements, guided fields, preview, and section hiding.

### Misleading qualifications or outcomes

Separate tutor-provided content from verified platform facts. Provide reporting
and admin moderation.

### Private contact leakage

Keep account contact fields private. Store explicitly public channels
separately and expose them only through curated public views.

### Scope becoming a website-builder product

Hold the line on one controlled template and limited appearance choices.

### Service marketplace complexity

Start with enquiries rather than payment, scheduling, refunds, commissions, or
fulfilment tracking.

### Duplicate programme data

Programme cards must read the real programme records. Tutors should never
re-enter programme title, price, duration, or cohort availability on the public
page.

### Business identity hiding the tutor

Keep the tutor visible alongside the business unless a later multi-tutor
organisation model explicitly replaces this rule.

### Abandoned public URLs

Unpublish pages when tutors are inactive, preserve safe redirects after slug
changes, and define behaviour for suspended or deleted accounts.

---

## Open questions

1. **Name:** Public Page, Tutor Storefront, Tutor Mini-site, or My Teaching
   Page?
2. **Route:** `/tutors/[slug]` or another public namespace?
3. **Eligibility:** Is the page available to every tutor account or only tutors
   with the programme feature enabled?
4. **Publishing approval:** Can a tutor publish immediately, or does first
   publication require admin review?
5. **Minimum content:** Is one published service enough without a programme?
6. **Slug ownership:** Who resolves name conflicts, reserved words, impersonation,
   and business-name disputes?
7. **Service pricing:** Which currencies and price-display modes should v1
   allow?
8. **Enquiry model:** Extend programme enquiries or introduce a broader tutor
   lead model?
9. **Credentials:** Which credentials can QAcademy realistically verify, and
   who performs verification?
10. **Contact exposure:** Which direct contact channels are allowed, and should
    WhatsApp be treated differently from a public phone number?
11. **Section ordering:** Fixed order or a small set of controlled reorder
    options?
12. **Programme-less pages:** Should an active tutor be allowed to publish a
    profile with services only?
13. **Business pages:** Is v1 always one tutor + optional business, or should an
    academy with several tutors be supported from the start?
14. **Platform branding:** How prominent should "Hosted by MyNclex" be?
15. **Moderation:** What content can be automatically blocked, and what requires
    manual review?
16. **Analytics:** Which public-page events are needed in v1?
17. **Reviews:** When is there enough enrolment / service data to introduce a
    verified-review model?

---

## Initial recommendation

Proceed with a focused first version built around this promise:

> A professional teaching page hosted by MyNclex, automatically connected to
> the tutor's programmes and enquiries.

The first release should prioritise:

- professional identity;
- automatic programme promotion;
- additional service discovery;
- safe contact and lead collection;
- easy sharing;
- controlled quality.

It should not attempt to become a general website builder or a complete tutor
marketplace in the same release.

---

## Related files

- `app/(public)/programmes/programmes-list.tsx` — current public programme
  cards and tutor attribution.
- `lib/discovery/types.ts` — `PublicProfile` and public programme shapes.
- `app/(app)/tutor/profile/public-profile-form.tsx` — current tutor public
  profile editor and live preview.
- `db/migrations/20260530120000_slice_3_5_public_profile_column.sql` — current
  public-profile storage rule.
- `db/migrations/20260530130000_slice_3_5_public_profile_in_view.sql` — current
  programme public-profile projection.
- `db/migrations/20260528120000_slice_3b_public_programmes_view.sql` — public
  programme projection boundary.
- `db/migrations/20260529120000_slice_3c_public_detail_views.sql` — public
  programme units and cohorts.
- `db/migrations/20260707120000_universal_programme_contact.sql` — current
  public programme contact mechanism.
- `docs/product-plan/payments-and-enrolment.md` — public programme discovery,
  contact, enrolment, and payment context.
- `docs/product-plan/tutor-home.md` — tutor cross-programme home and existing
  public-profile / programme workflows.
