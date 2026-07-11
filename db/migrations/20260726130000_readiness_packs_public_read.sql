-- 20260726130000_readiness_packs_public_read.sql
--
-- The public /readiness page (readiness-packs.md §12 → Slice ①.3) lists
-- every PUBLISHED pack with its own question count and time limit — the
-- "What's in a pack" block. That page is reachable logged-out, but the
-- Slice-① policy `nclex_readiness_packs_read_published` was scoped
-- `TO authenticated`, so an anonymous visitor read ZERO packs and the
-- page would have rendered its "packs are being curated" empty state to
-- every logged-out visitor, forever — silently wrong.
--
-- Mirror `nclex_products_public_select` instead: no TO clause, so the
-- policy applies to the `public` role (anon + authenticated). This is
-- what already lets /bank-access price itself to a stranger.
--
-- SAFETY — what this does NOT expose. Pack MEMBERSHIP stays curator-only
-- (`nclex_readiness_pack_items` is untouched), so no question, and no
-- hint of which questions, leaks. What becomes anon-readable is exactly
-- the marketing surface: title, description, n, time_limit_sec.
--
-- The new predicate also adds `status = 'active'`, which the old one
-- lacked. Not a behaviour change in practice — setPackPublishedAction
-- writes `published` and `status` together (published=TRUE ⇒
-- status='active') — it just stops an archived-but-published row from
-- ever surfacing. Strictly narrower for authenticated readers; wider
-- only in that anon now sees what they already could have seen by
-- signing up for a free trial.

DROP POLICY IF EXISTS nclex_readiness_packs_read_published ON nclex_readiness_packs;

CREATE POLICY nclex_readiness_packs_public_select ON nclex_readiness_packs FOR SELECT
  USING (published = TRUE AND status = 'active');
