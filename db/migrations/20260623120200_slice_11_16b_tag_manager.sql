-- Slice 11.16b-2 — tag manager bulk operations
--
-- Tags are free-typed per note (no central vocabulary), so drift is
-- inevitable. These three RPCs let a tutor clean up their whole
-- library in one action each:
--   • rename — fix a typo / casing drift everywhere (cardic → cardiac)
--   • delete — drop a tag from every note that carries it
--   • merge  — fold several tags into one canonical tag
--
-- All three are SECURITY INVOKER, so the caller's RLS
-- (`nclex_tutor_library_notes_self_update`) scopes every write to the
-- tutor's own notes — no service role, no cross-tutor reach. Each
-- returns the number of affected notes for the success toast.
--
-- updated_at is intentionally left untouched: re-tagging is metadata
-- housekeeping, not a content edit, so renamed notes shouldn't all
-- jump to "edited just now".

begin;

-- Order-preserving array de-dup. After a rename/merge maps one tag
-- onto another, a note may end up with the target twice; this keeps
-- the first occurrence of each tag and drops later duplicates.
create or replace function public.nclex_dedupe_tags(p_tags text[])
returns text[]
language sql
immutable
as $function$
  select coalesce(array_agg(elem order by ord), '{}'::text[])
  from (
    select elem, min(ord) as ord
    from unnest(p_tags) with ordinality as u(elem, ord)
    group by elem
  ) d;
$function$;

-- Rename p_old → p_new across every note carrying p_old. Dedupes when
-- the note already had p_new (so rename-onto-existing behaves as a
-- 2-tag merge). Returns the count of affected notes.
create or replace function public.nclex_rename_library_tag(
  p_old text,
  p_new text
)
returns integer
language plpgsql
security invoker
as $function$
declare
  v_old   text := btrim(coalesce(p_old, ''));
  v_new   text := lower(btrim(coalesce(p_new, '')));
  v_count integer;
begin
  if v_old = '' or v_new = '' or char_length(v_new) > 40 or v_old = v_new then
    return 0;
  end if;

  update nclex_tutor_library_notes n
  set tags = nclex_dedupe_tags(
    array(select case when t = v_old then v_new else t end
          from unnest(n.tags) as t)
  )
  where v_old = any(n.tags);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Remove p_tag from every note that carries it.
create or replace function public.nclex_delete_library_tag(
  p_tag text
)
returns integer
language plpgsql
security invoker
as $function$
declare
  v_tag   text := btrim(coalesce(p_tag, ''));
  v_count integer;
begin
  if v_tag = '' then
    return 0;
  end if;

  update nclex_tutor_library_notes n
  set tags = array_remove(n.tags, v_tag)
  where v_tag = any(n.tags);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Fold every tag in p_sources into p_target across all notes carrying
-- any source. Dedupes the result. Returns the count of affected notes.
create or replace function public.nclex_merge_library_tags(
  p_sources text[],
  p_target  text
)
returns integer
language plpgsql
security invoker
as $function$
declare
  v_target  text   := lower(btrim(coalesce(p_target, '')));
  v_sources text[] := coalesce(p_sources, '{}'::text[]);
  v_count   integer;
begin
  if v_target = '' or char_length(v_target) > 40
     or array_length(v_sources, 1) is null then
    return 0;
  end if;

  update nclex_tutor_library_notes n
  set tags = nclex_dedupe_tags(
    array(select case when t = any(v_sources) then v_target else t end
          from unnest(n.tags) as t)
  )
  where n.tags && v_sources;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Default grants hand EXECUTE to anon + authenticated; RLS already
-- protects the data, but per convention we revoke anon explicitly on
-- the mutating RPCs.
revoke execute on function public.nclex_rename_library_tag(text, text) from anon;
revoke execute on function public.nclex_delete_library_tag(text) from anon;
revoke execute on function public.nclex_merge_library_tags(text[], text) from anon;

commit;
