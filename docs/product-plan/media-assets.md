# Media Assets — architectural plan

**Status:** Planning settled 2026-05-13. Not yet built.
**Scope:** Centralised media storage for MyNclex — PDFs, images, avatars, and (future) videos.
**Related:** `bank.md` (rationale images), `curriculum-authoring-ux.md` (PDF activity),
`main.md` (user avatars).

---

## 1. Why this doc exists

We paused at the PDF activity (slice 9.3d-b) because PDF is only one part of a bigger
media problem. MyNclex will need to handle many uploaded files over time:

- Profile pictures
- Rationale images (bank + tutor questions)
- PDF handouts (curriculum activities)
- Programme resources
- Tutor-uploaded videos
- QAcademy-uploaded videos
- Future documents, images, audio, certificates

Building a separate upload system for each feature would mean duplicated code, drifting
permission models, and no single place to audit, retire, or migrate files. This doc
locks the architectural approach: **one general media-asset system, used by every
feature that uploads files**.

---

## 2. Core principle — every uploaded file becomes an asset row

A **media asset** is a database row that represents an uploaded file. The real file
lives in object storage (Supabase Storage for v1). The asset row is the control record:
who uploaded it, who owns it, what it's for, how big it is, what state it's in, and
where the file physically lives.

```
Upload file
    ↓
Create media asset row in nclex_media_assets
    ↓
Other tables reference asset_id (avatar_asset_id, rationale_asset_id, pdf_asset_id, …)
```

The app stops storing random file paths directly inside every feature.

---

## 3. The asset table

```
nclex_media_assets
  asset_id          UUID PK
  media_type        TEXT       -- 'IMAGE' | 'PDF' | 'VIDEO' | 'OTHER'
  purpose           TEXT       -- 'AVATAR' | 'RATIONALE_IMG' | 'PDF_ACTIVITY' | etc.
  storage_provider  TEXT       -- 'SUPABASE' | 'CLOUDFLARE_R2' | 'CLOUDFLARE_STREAM' | 'EXTERNAL'
  bucket            TEXT       -- bucket name within the provider
  storage_path      TEXT       -- UUID-based path, server-generated
  original_filename TEXT       -- what the user saw on their disk
  mime_type         TEXT
  size_bytes        BIGINT
  status            TEXT       -- 'UPLOADING' | 'READY' | 'DELETED' | 'PURGED'
  uploaded_by       UUID FK    -- who pressed upload (audit; NOT NULL)
  owner_user_id     UUID FK    -- who controls it (RLS; NULLABLE for platform-owned)
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
```

Exact column types, indexes, constraints, and RLS policies land at build time in the
migration that creates the table.

---

## 4. Locked decisions

Eight architectural decisions, settled in conversation 2026-05-13. Each is a principle,
not an implementation detail — actual provisioning (buckets, policies, caps) happens
at the build slice that needs it.

### 4.1 Storage provider — Supabase Storage for v1

All files in v1 live on Supabase Storage. The `storage_provider` column on every asset
row is the unlock: it lets us migrate any file or file type to a different provider
(Cloudflare R2, Cloudflare Stream, external) later without schema changes. The
frontend reads from the asset row to discover where a file actually lives, never
hardcoding the provider.

**Why Supabase first:** Already in the stack. Same auth, same RLS model, same
dashboard. Cost analysis shows we fit comfortably inside Pro-plan quotas for early
launch (Scenario A: 50 students ≈ $25/mo total). Migrating videos to R2 or Stream
becomes worthwhile around 200+ active students or when video egress crosses
~500 GB/month. The `storage_provider` column makes that a one-day data migration,
not a re-architecture.

### 4.2 Plan tier — Free for dev, Pro before launch

Free plan covers dev (1 GB storage, 5 GB egress — fine for solo testing). Pro plan
($25/mo base, 100 GB storage and 250 GB egress included) is required before real
tutors and students arrive. Upgrade timing is concurrent with launch.

### 4.3 Bucket strategy — separate buckets per purpose

Different file purposes have different access rules, different size limits, and
different MIME-type constraints. Supabase RLS and bucket-level rules attach to the
bucket, not to individual files — separate buckets keep each rule short, focused,
and auditable.

Expected initial buckets (provisioned at build time, names indicative):

- `nclex-pdfs` — PDF activity files (private)
- `nclex-avatars` — user profile pictures (public)
- `nclex-rationale-images` — question rationale images (public)
- `nclex-misc` — catch-all for future small stuff
- `nclex-videos` — when video uploads ship (private)

Actual bucket names, count, and per-bucket policies are decided in the build slice
that creates each bucket.

### 4.4 Public vs private — gated by what the file gates

Files that gate paid content (PDFs in programme activities, future tutor videos)
are private and served via short-lived signed URLs. Files that don't gate revenue
(avatars, rationale images) are public-read, with the bank/subscription gating
happening at the database layer above them.

Principle: lock down what gates revenue; leave the rest open. Signed URLs add
complexity (server mints them, client refreshes when they expire). We only pay
that complexity tax where it earns its keep.

### 4.5 Size caps — every bucket gets a hard cap, enforced at the bucket level

Caps are enforced by Supabase at the bucket level — oversized uploads are rejected
before they touch our code. Application-level checks are belt-and-braces only.

Recommended caps for the buckets we know about (revisitable at build time):

| Bucket | Suggested cap | Reasoning |
|---|---|---|
| `nclex-pdfs` | 25 MB | A 25 MB PDF is ~150-300 pages with images. Tutors with bigger files split them. |
| `nclex-avatars` | 2 MB | Forces sensible resize on the client. |
| `nclex-rationale-images` | 5 MB | Medical illustrations sit under this comfortably. |
| `nclex-videos` | TBD when video bucket ships | Likely 500 MB – 2 GB depending on encoding strategy. |

### 4.6 Filename handling — UUID `storage_path`, preserved `original_filename`

Two fields:

- `original_filename` — preserved verbatim from the user's upload, for display only
- `storage_path` — UUID-based, server-generated, used internally; never shown to users

Prevents filename collisions (two tutors both upload `lecture1.pdf`), neutralises
path-traversal exploits, prevents PII leaks via public URLs. Standard practice across
mature file-upload systems.

### 4.7 Deletion — soft-delete only in v1; sweeper deferred

Asset deletion is always soft (`status` flag), never hard. When an activity row
referencing an asset is deleted, the asset row flips to `status = 'DELETED'` and
the file stays in the bucket.

Why never hard-delete in v1:

1. **Snapshot safety.** Once attempt items snapshot asset IDs (per §6 below),
   hard-deleting could break review of historical attempts.
2. **Recoverable accidents.** A tutor's accidental delete is recoverable for the
   life of the asset row.
3. **Storage is cheap.** Orphans cost pennies at v1 scales.

A future sweeper job will purge files where `status = 'DELETED'` for at least
30 days AND no attempt snapshot still references the asset, flipping rows to
`status = 'PURGED'` when the file is actually removed from storage. The sweeper
is deferred until orphan volume justifies it.

### 4.8 Identity columns — both `uploaded_by` and `owner_user_id`

Two separate columns on every asset row:

- `uploaded_by` — audit trail, immutable, NOT NULL. Records which human pressed
  the upload button. Never changes.
- `owner_user_id` — controls RLS for edit/delete, mutable, NULLABLE. NULL means
  platform-owned (e.g. admin uploading a global rationale image).

They will be equal in the common case (user uploads their own thing) but separating
them keeps audit integrity when ownership transfers, and cleanly expresses
platform-owned assets that aren't tied to any individual user.

---

## 5. Migration approach — keep old fields alongside new

Existing fields like `nclex_users.avatar_url`, `nclex_bank_items.rationale_img`, and
`nclex_tutor_questions.rationale_img` will **not** be deleted immediately. The safer
migration shape:

1. Keep the old field temporarily.
2. Add a new `*_asset_id` field alongside it.
3. Route new uploads through the asset system.
4. Backfill historical rows (or migrate per-feature on demand).
5. Eventually deprecate the old field, in a separate slice, once we're confident
   nothing references it.

Example:

```
nclex_users:
  avatar_url        TEXT             -- legacy, kept for back-compat
  avatar_asset_id   UUID FK NULLABLE -- new path

nclex_bank_items:
  rationale_img        TEXT             -- legacy
  rationale_asset_id   UUID FK NULLABLE -- new path

nclex_tutor_questions:
  rationale_img        TEXT             -- legacy
  rationale_asset_id   UUID FK NULLABLE -- new path
```

PDF activity is new and will use `pdf_asset_id` from day one (no legacy field to
preserve).

---

## 6. Snapshot thinking — runner safety for rationale images

For quiz attempts, existing attempt items already snapshot rationale image text into
`rationale_img_snapshot`. This is correct: once a student starts a quiz, the delivered
question should not change under them.

When rationale images move onto the asset system, the future attempt-item snapshot
fields should be:

- `rationale_asset_id_snapshot` — the asset ID used at attempt-creation time
- `rationale_img_snapshot` — the resolved URL valid at that time (kept for safety
  against signed-URL expiry and asset replacement after the attempt started)

Both fields together protect attempt review: the asset ID identifies *which* asset,
the URL captures *what URL worked then*.

**Profile pictures do not need snapshot fields.** If a user changes their avatar,
the app simply shows the new one — no historical accuracy concern.

---

## 7. Video — flexible, but not built yet

Videos are different from images and PDFs because of bandwidth and streaming costs.
A 2 MB PDF downloaded by many students is manageable. A 300 MB video watched
repeatedly can become expensive quickly.

The asset table architecture supports videos via the `storage_provider` column —
day one we can store videos on Supabase, and later migrate to:

- `CLOUDFLARE_R2` — cheap object storage, zero egress
- `CLOUDFLARE_STREAM` — purpose-built video hosting with adaptive bitrate
- `EXTERNAL` — link out to YouTube / Vimeo / etc.

**No video upload is built in v1.** When demand arrives, the decision will be made
with then-current pricing and a deliberate planning slice.

Cost scenarios modelled 2026-05-13 (see `docs/product-plan/SESSIONS-2026-05-13.md`
or the conversation log):

| Scenario | Students | Storage | Egress | Cost (all-Supabase) |
|---|---|---|---|---|
| A | 50 | 19 GB | 130 GB | ~$25/mo |
| B | 300 | 55 GB | 1.17 TB | ~$80–108/mo |
| C | 1,000 | 175 GB | 5.65 TB | ~$253–513/mo |

At Scenario C, ~85% of egress is video. Migrating videos to R2 at that scale brings
total cost to ~$57/mo. Decision point: migrate videos when active students cross
~200 or video egress crosses ~500 GB/month.

---

## 8. Build sequencing

The media foundation must land **before** any feature that uploads files. Sub-slice
plan (see `BUILD_LIST.md` for canonical wording):

- **Media foundation slice** — `nclex_media_assets` table + RLS + first bucket
  (`nclex-pdfs`) + generic upload server action + generic asset-fetch helper. No
  feature integration yet.
- **PDF activity slice (9.3d-b)** — first consumer of the foundation. PDF editor in
  activity modal, file picker, upload progress, signed-URL viewer.
- **Avatar feature** — lands when user-profile UI is built.
- **Rationale image feature** — lands when rationale-image UI ships in the bank editor.
- **Video feature** — lands when demand + a video strategy land together.

---

## 9. Cost framing

Storage itself is essentially free at MyNclex's scale. Across all three scenarios
above, storage overage is at most $1.58/month. **The real bill is egress, and
videos dominate egress.**

Three honest takeaways:

1. For dev and early launch (Scenario A), all-Supabase is genuinely fine.
2. By Scenario B (300 students), all-Supabase still works but starts to look wasteful
   when R2 could do the same work for a third of the cost.
3. By Scenario C (1,000+ students), all-Supabase for video becomes genuinely
   expensive. Migrate videos to R2 or Stream at this point.

The `storage_provider` column on the asset row is the architecture that makes this
migration cheap — a one-time script that copies files and updates rows, with no
frontend code change.

---

## 10. Out of scope for this doc

- Specific bucket names, count, and policies — decided at build time per bucket.
- RLS policy SQL — written in the build-slice migration.
- Exact column types and constraints — refined in the migration file.
- Image transcoding or PDF preview generation — separate planning topic if needed.
- Antivirus or malware scanning of uploaded files — separate planning topic.
- CDN configuration beyond Supabase's built-in cache — separate planning topic.
