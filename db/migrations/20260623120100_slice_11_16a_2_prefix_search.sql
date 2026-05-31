-- Slice 11.16a-2 — prefix ("starts-with") search
--
-- Follow-on to 11.16a. The first cut used websearch_to_tsquery, which
-- matches whole words only: a tutor had to type the full term
-- ("furosemide") before anything matched — "furos" found nothing.
-- This rewrites the search RPC to build a PREFIX tsquery so partial
-- words match ("furos" → furosemide, "card" → cardiac), which is what
-- a search-as-you-type box needs.
--
-- How: sanitise the raw input to alphanumerics + spaces (so stray
-- punctuation can't break to_tsquery), split into tokens, append `:*`
-- to each, and AND them — e.g. `heart fail` → `heart:* & fail:*`.
--
-- We build TWO prefix queries from the same tokens and match on either:
--   • `english`  — stemmed. Needed so a FULL word matches the stored
--                  stem (typing "furosemide" must find the stored stem
--                  "furosemid").
--   • `simple`   — literal, no stemming. Needed so a SHORT fragment
--                  matches even when the stemmer would rewrite it
--                  ("brady" stems to "bradi", which no longer prefixes
--                  the stored "bradycardia"; the literal "brady:*"
--                  does).
-- A note matches if either query hits; rank = the higher of the two
-- (so the per-field weight mask still applies). Empty / all-stopword
-- input yields no tokens → no match.
--
-- Only the function body changes — the per-field ts_rank weight mask
-- (title/subtitle/description/body) and SECURITY INVOKER RLS scoping
-- are unchanged from 11.16a.

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
  with sanitized as (
    -- Drop anything that isn't a letter / digit / whitespace so the
    -- tokens we feed to to_tsquery are always well-formed.
    select lower(regexp_replace(coalesce(p_query, ''), '[^a-zA-Z0-9\s]', ' ', 'g')) as s
  ),
  built as (
    -- One `token:*` per word, ANDed together.
    select string_agg(tok || ':*', ' & ') as qstr
    from sanitized, regexp_split_to_table(btrim(sanitized.s), '\s+') as tok
    where tok <> ''
  ),
  q as (
    select
      case when qstr is null or qstr = '' then null
           else to_tsquery('english', qstr) end as ts_eng,
      case when qstr is null or qstr = '' then null
           else to_tsquery('simple', qstr) end  as ts_simple
    from built
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
    greatest(
      coalesce(ts_rank((select weights from w), n.body_tsv, (select ts_eng from q)), 0),
      coalesce(ts_rank((select weights from w), n.body_tsv, (select ts_simple from q)), 0)
    ) as rank
  from nclex_tutor_library_notes n, q
  where (
      (q.ts_eng is not null and n.body_tsv @@ q.ts_eng)
      or (q.ts_simple is not null and n.body_tsv @@ q.ts_simple)
    )
    and greatest(
      coalesce(ts_rank((select weights from w), n.body_tsv, q.ts_eng), 0),
      coalesce(ts_rank((select weights from w), n.body_tsv, q.ts_simple), 0)
    ) > 0
  order by rank desc, n.updated_at desc;
$function$;

revoke execute on function public.nclex_search_library_notes(
  text, boolean, boolean, boolean, boolean
) from anon;
