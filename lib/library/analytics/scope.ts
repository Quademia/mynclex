// mynclex/lib/library/analytics/scope.ts
//
// The scope switcher (slice 11.11c, Slice 3c) — All readers / each cohort
// / Self-paced. Given the resolved reader segments + the ?scope= param,
// it produces the switcher options + the in-scope reader set every read
// filters by. Cohorts are the universe of cohorts with ≥1 reader; the
// Self-paced option only appears when there are cohortless readers.

import type { ReaderSegment } from './readers';
import type { EmbedScopeMeta, ScopeOption } from './types';

export interface ResolvedScope {
  meta: EmbedScopeMeta;
  /** null = all readers (no filter applied). */
  inScope: Set<string> | null;
}

export function buildScope(
  byId: Map<string, ReaderSegment>,
  cohorts: Array<{ id: string; name: string }>,
  scopeParam: string | null,
): ResolvedScope {
  const hasSelf = [...byId.values()].some((s) => s.cohortId == null);
  const options: ScopeOption[] = [{ key: 'all', label: 'All readers' }];
  for (const c of cohorts) options.push({ key: c.id, label: c.name });
  if (hasSelf) options.push({ key: 'self', label: 'Self-paced' });

  const active =
    scopeParam && options.some((o) => o.key === scopeParam)
      ? scopeParam
      : 'all';

  let inScope: Set<string> | null = null;
  if (active === 'self') {
    inScope = new Set(
      [...byId.entries()].filter(([, s]) => s.cohortId == null).map(([id]) => id),
    );
  } else if (active !== 'all') {
    inScope = new Set(
      [...byId.entries()]
        .filter(([, s]) => s.cohortId === active)
        .map(([id]) => id),
    );
  }

  return { meta: { options, activeKey: active }, inScope };
}
