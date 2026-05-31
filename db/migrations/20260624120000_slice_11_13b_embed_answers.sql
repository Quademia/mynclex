-- 20260624120000_slice_11_13b_embed_answers.sql
-- Slice 11.13b — embedded-questions player + attempt history.
--
-- Creates nclex_library_embed_answers: an APPEND-ONLY history log of
-- student attempts on note-embedded questions. One row per attempt —
-- there is NO unique constraint, because re-practising is allowed and
-- history is both the permanent record and the future tutor-analytics
-- source. The live note always renders the tutor's CURRENT questions;
-- each submit appends a row carrying its OWN frozen snapshot, so a later
-- tutor edit can never make a past attempt incoherent.
--
-- Shape FUSES the two runner storage tables into one row (embeds have no
-- session, so no split): the answer fields from nclex_attempt_answers +
-- the question-snapshot columns from nclex_attempt_items (inlined), plus
-- note_id + block_id. item_id FKs to nclex_tutor_questions (embeds
-- reference the tutor's own bank), ON DELETE RESTRICT.
--
-- Also backfills a stable `id` onto every existing embedded_questions
-- block in note bodies (new blocks get one from the editor going
-- forward) so an attempt can be attributed to a specific block.

create table if not exists nclex_library_embed_answers (
  answer_id                     uuid primary key default gen_random_uuid(),
  student_id                    uuid not null references nclex_users(id) on delete cascade,
  note_id                       uuid not null references nclex_tutor_library_notes(note_id) on delete cascade,
  block_id                      text not null,
  item_id                       text not null references nclex_tutor_questions(item_id) on delete restrict,
  question_type                 text not null,
  -- Answer side (from nclex_attempt_answers):
  answer_json                   jsonb   not null,
  is_correct                    boolean not null,
  score_awarded                 numeric not null,
  time_spent_sec                integer,
  -- Question snapshot (from nclex_attempt_items, inlined + frozen at submit):
  stem_snapshot                 text    not null,
  instruction_snapshot          text,
  content_snapshot_json         jsonb   not null,
  correct_answer_snapshot_json  jsonb   not null,
  rationale_snapshot            text,
  rationale_img_snapshot        text,
  marks_snapshot                numeric not null,
  submitted_at                  timestamptz not null default now()
);

comment on table nclex_library_embed_answers is
  'Append-only history of student attempts on note-embedded questions (slice 11.13b). One row per attempt; each carries its own frozen question snapshot. Deliberately NOT in nclex_attempts (no session semantics; avoids analytics pollution).';

-- "Latest attempt" lookups (per student/note/block/question) + tutor
-- analytics by question.
create index if not exists nclex_library_embed_answers_student_idx
  on nclex_library_embed_answers (student_id, note_id, block_id, item_id, submitted_at desc);
create index if not exists nclex_library_embed_answers_item_idx
  on nclex_library_embed_answers (item_id);

alter table nclex_library_embed_answers enable row level security;

-- Student reads + inserts their OWN rows only. Append-only: no UPDATE /
-- DELETE policies (rows are immutable; note/student deletion cascades).
create policy nclex_library_embed_answers_self_select
  on nclex_library_embed_answers for select to authenticated
  using (student_id = auth.uid());

create policy nclex_library_embed_answers_self_insert
  on nclex_library_embed_answers for insert to authenticated
  with check (student_id = auth.uid());

-- Tutor reads rows for embeds of their OWN bank questions (v2 analytics).
create policy nclex_library_embed_answers_tutor_select
  on nclex_library_embed_answers for select to authenticated
  using (
    exists (
      select 1
      from nclex_tutor_questions q
      where q.item_id = nclex_library_embed_answers.item_id
        and q.tutor_id = auth.uid()
    )
  );

-- SUPER_ADMIN bypass.
create policy nclex_library_embed_answers_admin_all
  on nclex_library_embed_answers for all to authenticated
  using (nclex_user_has_role('SUPER_ADMIN'))
  with check (nclex_user_has_role('SUPER_ADMIN'));

-- ── Backfill: stable id on every existing embedded_questions block ──
-- Embed blocks are top-level doc nodes ({type:'doc', content:[…]}); we
-- map over the top-level content array, adding attrs.id where missing.
-- Guarded so it is safe to re-run and skips legacy / non-doc bodies.
update nclex_tutor_library_notes n
set body = jsonb_set(
  n.body,
  '{content}',
  (
    select jsonb_agg(
      case
        when elem->>'type' = 'embedded_questions'
             and elem->'attrs' is not null
             and not (elem->'attrs' ? 'id')
        then jsonb_set(elem, '{attrs,id}', to_jsonb(gen_random_uuid()::text))
        else elem
      end
      order by ord
    )
    from jsonb_array_elements(n.body->'content') with ordinality as t(elem, ord)
  )
)
where jsonb_typeof(n.body->'content') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(n.body->'content') e
    where e->>'type' = 'embedded_questions'
      and e->'attrs' is not null
      and not (e->'attrs' ? 'id')
  );
