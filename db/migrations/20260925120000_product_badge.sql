-- 20260925120000_product_badge.sql
-- The card badge becomes a field (settled with Sam 2026-09-05).
--
-- ⚠ WHAT THIS REPLACES. The public bank page decided which plan to
-- promote with `const popular = p.days === 90` in a component — a
-- marketing decision encoded as a magic number, and a fragile one: change
-- that tier's length by ANY route (a direct UPDATE, or retire-and-
-- recreate) and the "Most popular" ribbon silently disappears from the
-- page with no error anywhere.
--
-- ⭐ TEXT, NOT A BOOLEAN, deliberately. A boolean would have moved WHICH
-- product wears the badge while leaving WHAT IT SAYS in code, so every
-- product would still have claimed "Most popular". Text moves both — and
-- that matters, because "Most popular" is a factual claim about what
-- customers choose, and pre-launch there is no such fact. The same
-- honesty rule already settled for struck-through "was" prices
-- (readiness-packs.md §7): a decorative claim has to be true. With the
-- words in a field, "Best value" can stand there until sales support
-- something stronger, and changing it takes seconds instead of a deploy.
--
-- ⓘ NO CONSTRAINT ON HOW MANY PRODUCTS CARRY ONE. Two badges with
-- different words ("Best value" · "Longest access") is a legitimate
-- layout; a unique index would forbid it to prevent something merely
-- untidy. Advise-don't-block is the standing rule here, and an advisory
-- can be added the day two badges actually collide.
--
-- ⓘ Both product families, from the start. The column is on the shared
-- table and both public grids render it; readiness was NOT deferred (Sam:
-- "no need to do it later").

ALTER TABLE nclex_products
  ADD COLUMN badge TEXT
             CHECK (badge IS NULL OR length(trim(badge)) BETWEEN 1 AND 24);

COMMENT ON COLUMN nclex_products.badge IS
  'Ribbon text on the public pricing card, e.g. "Best value". NULL = no '
  'badge and no highlight. Free text so the CLAIM is editable, not just '
  'which product wears it. Capped at 24 characters: the ribbon is one '
  'non-wrapping line on a 375px card.';

-- NULL is the default for every existing row, so nothing is badged until
-- someone chooses one — the page loses its hardcoded ribbon on deploy and
-- gains it back the moment a product is given words. Stated plainly
-- because it is a visible change to a public page, not a silent no-op.
