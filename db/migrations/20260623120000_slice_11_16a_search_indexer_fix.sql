-- Slice 11.16a — Library search: indexer fix + ranked search RPC
--
-- Two problems this migration fixes, both rooted in the same cause:
-- the body full-text indexer (`nclex_extract_body_text`) was written
-- in slice 11.1 against an EARLY, planned block shape, before the
-- Tiptap rich editor (slice 11.5) existed. Once the editor shipped,
-- notes started saving in Tiptap's native shape — a `{ type: 'doc',
-- content: [...] }` wrapper whose blocks nest their text differently
-- from what the indexer expected. The mismatch meant:
--
--   1. The whole-note SHOWSTOPPER. The indexer bails on its first line
--      (`jsonb_typeof(p_body) <> 'array' -> RETURN ''`) because the
--      stored body is now an OBJECT (`{type:'doc',...}`), not an array.
--      So EVERY rich-editor note has ZERO body text in its search
--      index — only title / subtitle / description were searchable.
--   2. The per-block STRAGGLERS. Even fed the inner `content` array,
--      the old per-type branches read the wrong keys: headings keep
--      text under `content` (not a top-level `text`), lists are
--      `bulletList`/`orderedList` (not `list`), tables nest
--      `tableRow → tableCell → paragraph` (not a flat `cells` array),
--      and the atom blocks `drug_card` / `lab_values` keep all their
--      text under `attrs`.
--
-- The rewrite below replaces the brittle per-type branches with a
-- single RECURSIVE walker. Tiptap stores essentially all prose in
-- `{ type: 'text', text: '…' }` leaves under `content`, so one
-- recursion covers paragraph / heading / callout / quote / lists /
-- tables / doc at once. The two atom nodes (drug_card, lab_values)
-- get explicit attrs handling. Opaque media blocks (libImage / libPdf
-- / libVideo / embedded_questions) are skipped — no prose to search.
--
-- Because `body_tsv` is a STORED generated column, simply replacing
-- the function does NOT recompute existing rows. So we DROP and
-- RE-ADD the column (which forces a recompute over every note — the
-- retroactive backfill) and rebuild its GIN index.
--
-- Finally we add `nclex_search_library_notes`, a SECURITY INVOKER
-- ranked-search RPC (RLS scopes it to the caller's own notes). It
-- takes the search text plus four field-scope booleans (title /
-- subtitle / description / body) and uses ts_rank with a per-field
-- weight mask so the toolbar's per-field filter can narrow matches to
-- chosen fields — driven entirely off the existing A/B/C/D weighting
-- in `body_tsv`, no extra storage.

begin;

-- ---------------------------------------------------------------------
-- 1. Tear down the generated column + its index so we can swap the
--    underlying function. (You cannot CREATE OR REPLACE a function a
--    generated column depends on while the column exists.)
-- ---------------------------------------------------------------------
drop index if exists nclex_tutor_library_notes_body_tsv_idx;
alter table nclex_tutor_library_notes drop column if exists body_tsv;

-- ---------------------------------------------------------------------
-- 2. Replace the body-text extractor with a recursive walker.
-- ---------------------------------------------------------------------
create or replace function public.nclex_extract_body_text(p_body jsonb)
returns text
language plpgsql
immutable
parallel safe
as $function$
declare
  v_type text;
  v_buf  text := '';
  child  jsonb;
  fld    jsonb;
  col    jsonb;
  rw     jsonb;
  cell   jsonb;
begin
  if p_body is null then
    return '';
  end if;

  -- Arrays — the legacy 11.2b top-level body array, or any `content`
  -- array handed in by the recursion. Walk each element.
  if jsonb_typeof(p_body) = 'array' then
    for child in select * from jsonb_array_elements(p_body) loop
      v_buf := v_buf || ' ' || nclex_extract_body_text(child);
    end loop;
    return v_buf;
  end if;

  -- Scalars — e.g. a lab-values row cell is a bare JSON string.
  if jsonb_typeof(p_body) <> 'object' then
    return ' ' || coalesce(p_body #>> '{}', '');
  end if;

  v_type := p_body->>'type';

  -- Opaque blocks carry no searchable prose. Skip the whole subtree.
  if v_type in (
    'libImage', 'image', 'libPdf', 'pdf', 'libVideo', 'video',
    'embedded_questions'
  ) then
    return '';
  end if;

  -- Atom nodes that store their text under `attrs` (no `content`).
  if v_type = 'drug_card' then
    v_buf := v_buf
      || ' ' || coalesce(p_body #>> '{attrs,name}', '')
      || ' ' || coalesce(p_body #>> '{attrs,drug_class}', '');
    if jsonb_typeof(p_body #> '{attrs,fields}') = 'array' then
      for fld in select * from jsonb_array_elements(p_body #> '{attrs,fields}') loop
        v_buf := v_buf
          || ' ' || coalesce(fld->>'label', '')
          || ' ' || coalesce(fld->>'value', '');
      end loop;
    end if;

  elsif v_type = 'lab_values' then
    v_buf := v_buf || ' ' || coalesce(p_body #>> '{attrs,title}', '');
    if jsonb_typeof(p_body #> '{attrs,columns}') = 'array' then
      for col in select * from jsonb_array_elements(p_body #> '{attrs,columns}') loop
        v_buf := v_buf || ' ' || coalesce(col->>'label', '');
      end loop;
    end if;
    if jsonb_typeof(p_body #> '{attrs,rows}') = 'array' then
      for rw in select * from jsonb_array_elements(p_body #> '{attrs,rows}') loop
        if jsonb_typeof(rw) = 'array' then
          for cell in select * from jsonb_array_elements(rw) loop
            v_buf := v_buf || ' ' || coalesce(cell #>> '{}', '');
          end loop;
        end if;
      end loop;
    end if;
  end if;

  -- Generic: harvest this node's own text leaf (a Tiptap `text` node,
  -- or a legacy bare `{ text }` inline) then recurse into `content`.
  -- This single branch covers paragraph / heading / callout / quote /
  -- bulletList / orderedList / listItem / table / tableRow /
  -- tableCell / doc — every block whose words live in nested text
  -- leaves. (drug_card / lab_values fall through too, contributing
  -- nothing here since they have no `text` / `content`.)
  v_buf := v_buf || ' ' || coalesce(p_body->>'text', '');
  if jsonb_typeof(p_body->'content') = 'array' then
    for child in select * from jsonb_array_elements(p_body->'content') loop
      v_buf := v_buf || ' ' || nclex_extract_body_text(child);
    end loop;
  end if;
  -- Legacy quote/callout `citation` key (harmless when absent).
  v_buf := v_buf || ' ' || coalesce(p_body->>'citation', '');

  return v_buf;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Re-add the generated column (recomputes for ALL existing rows —
--    the retroactive backfill) and rebuild its GIN index.
-- ---------------------------------------------------------------------
alter table nclex_tutor_library_notes
  add column body_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
    setweight(to_tsvector('english', coalesce(subtitle, '')),    'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', nclex_extract_body_text(body)), 'D')
  ) stored;

create index nclex_tutor_library_notes_body_tsv_idx
  on nclex_tutor_library_notes using gin (body_tsv);

-- ---------------------------------------------------------------------
-- 4. Ranked search RPC with a per-field weight mask.
--
-- SECURITY INVOKER (the default) so the caller's RLS — the
-- `_self_select` policy on the notes table — scopes results to the
-- signed-in tutor's own notes automatically. The four booleans drive
-- a ts_rank weight array {D,C,B,A}; a field set to false contributes
-- weight 0, so a note whose ONLY match is in a deselected field ranks
-- 0 and is filtered out. websearch_to_tsquery tolerates free-form
-- input (quotes, OR, -negation) and yields an empty query for
-- all-stopword / punctuation input, which matches nothing.
-- ---------------------------------------------------------------------
create or replace function public.nclex_search_library_notes(
  p_query       text,
  p_title       boolean default true,
  p_subtitle    boolean default true,
  p_description boolean default true,
  p_body        boolean default true
)
returns table (note_id text, rank real)
language sql
stable
security invoker
as $function$
  with q as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as ts
  ),
  w as (
    select array[
      case when p_body        then 1.0 else 0.0 end,  -- D = body
      case when p_description then 1.0 else 0.0 end,  -- C = description
      case when p_subtitle    then 1.0 else 0.0 end,  -- B = subtitle
      case when p_title       then 1.0 else 0.0 end   -- A = title
    ]::real[] as weights
  )
  select
    n.note_id,
    ts_rank((select weights from w), n.body_tsv, (select ts from q)) as rank
  from nclex_tutor_library_notes n, q
  where n.body_tsv @@ q.ts
    and ts_rank((select weights from w), n.body_tsv, q.ts) > 0
  order by rank desc, n.updated_at desc;
$function$;

-- Default grants hand EXECUTE to anon + authenticated. RLS already
-- protects the data (anon sees nothing), but per the project's RPC
-- convention we revoke anon explicitly.
revoke execute on function public.nclex_search_library_notes(
  text, boolean, boolean, boolean, boolean
) from anon;

commit;
