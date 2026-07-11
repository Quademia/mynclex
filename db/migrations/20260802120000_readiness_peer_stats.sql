-- 20260802120000_readiness_peer_stats.sql
--
-- Readiness report §11.5 — the PEER COMPARATOR (Slice ⑥).
--
-- A student can only read their own attempts under RLS, so they can't compute
-- a pack cohort's distribution client-side. This SECURITY DEFINER function
-- returns AGGREGATES ONLY (never rows) for one sitting's pack: the cohort
-- size, the caller's percentile, and a 10-point score histogram — gated at a
-- minimum N so a comparison only appears once enough nurses have sat the pack.
--
-- Ownership is validated inside the function (auth.uid() must own the
-- attempt, or be SUPER_ADMIN). The "cohort" of a pack = every terminal,
-- scored sitting of it (COMPLETED or TIMED_OUT with a final_score) — the same
-- set the report's cross-pack trend counts, so the two never disagree.

CREATE OR REPLACE FUNCTION public.nclex_readiness_pack_peer_stats(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_owner  UUID;
  v_source TEXT;
  v_status TEXT;
  v_pack   TEXT;
  v_score  NUMERIC;
  v_min_n  INT := 25;          -- comparison stays hidden below this many sittings
  v_n      INT;
  v_below  INT;
  v_pct    INT := NULL;
  v_bucket INT := NULL;
  v_buckets JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, source, status, readiness_pack_id, final_score
    INTO v_owner, v_source, v_status, v_pack, v_score
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;
  IF v_owner <> v_uid AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;
  IF v_source <> 'READINESS_PACK' OR v_pack IS NULL THEN
    RAISE EXCEPTION 'not a readiness attempt';
  END IF;

  -- Cohort size: every terminal scored sitting of this pack.
  SELECT COUNT(*) INTO v_n
  FROM nclex_attempts
  WHERE readiness_pack_id = v_pack
    AND status IN ('COMPLETED', 'TIMED_OUT')
    AND final_score IS NOT NULL;

  -- Min-N gate: below the threshold, return only the count (UI shows locked).
  IF v_n < v_min_n THEN
    RETURN jsonb_build_object('n', v_n, 'unlocked', false);
  END IF;

  -- Caller's percentile (share of takers they scored strictly above),
  -- computed against the same cohort so it matches the histogram.
  IF v_status IN ('COMPLETED', 'TIMED_OUT') AND v_score IS NOT NULL THEN
    SELECT COUNT(*) INTO v_below
    FROM nclex_attempts
    WHERE readiness_pack_id = v_pack
      AND status IN ('COMPLETED', 'TIMED_OUT')
      AND final_score IS NOT NULL
      AND final_score < v_score;
    v_pct := ROUND(100.0 * v_below / v_n);
    v_bucket := LEAST(10, GREATEST(1, FLOOR(v_score * 100 / 10)::int + 1));
  END IF;

  -- 10-point histogram, every bucket present (0 where empty).
  SELECT jsonb_agg(
           jsonb_build_object('lo', (b - 1) * 10, 'hi', b * 10, 'count', COALESCE(g.c, 0))
           ORDER BY b
         )
    INTO v_buckets
  FROM generate_series(1, 10) AS b
  LEFT JOIN (
    SELECT LEAST(10, GREATEST(1, FLOOR(final_score * 100 / 10)::int + 1)) AS bkt, COUNT(*) AS c
    FROM nclex_attempts
    WHERE readiness_pack_id = v_pack
      AND status IN ('COMPLETED', 'TIMED_OUT')
      AND final_score IS NOT NULL
    GROUP BY 1
  ) AS g ON g.bkt = b;

  RETURN jsonb_build_object(
    'n', v_n,
    'unlocked', true,
    'your_percentile', v_pct,
    'your_bucket', v_bucket,
    'buckets', v_buckets
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nclex_readiness_pack_peer_stats(uuid) TO authenticated;
