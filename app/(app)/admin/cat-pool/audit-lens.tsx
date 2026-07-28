// mynclex/app/(app)/admin/cat-pool/audit-lens.tsx
//
// The Audit lens (Slice 10b2-c). Four ways a reserved set quietly degrades.
//
// None of them block a sitting, which is exactly why they get their own lens
// rather than a red badge on a row: a curator would learn to ignore a badge
// that never stops anything. Here they are counted, explained, and each one
// opens the precise subset it describes.
//
// Server component — every count comes from the same rows the stock pane
// lists, so a card and the list its button opens can never disagree.

import Link from 'next/link';
import { buildStockUrl, type AuditCounts, type StockView, type StockWarning } from '@/lib/bank/cat-pool/stock';

type Card = {
  key: StockWarning;
  icon: string;
  tone: 'warn' | 'danger' | 'muted';
  title: string;
  body: string;
  /** Shown instead of the count when the condition is expected for now. */
  aside?: string;
};

const CARDS: Card[] = [
  {
    key: 'builder',
    icon: '⚠',
    tone: 'warn',
    title: 'Still flagged visible in the student builder',
    body:
      'Reserving clears the builder-visible flag as a second layer of protection, so this should be empty. These rows carry the CAT flag but still say they are practice stock — which means something set the flag back after reservation.',
    aside:
      'Not a live leak: selection excludes reserved stock by the CAT flag itself, so nothing here is reachable in practice today. It is a drift detector — the belt, not the braces.',
  },
  {
    key: 'readiness',
    icon: '!',
    tone: 'danger',
    title: 'Reserved for two purposes at once',
    body:
      'These are readiness-tagged as well as CAT-reserved. A question can only honestly serve one — a pack sitting or an adaptive exam — because whichever comes second is measuring a question the student has already answered. Release one side.',
  },
  {
    key: 'unplaceable',
    icon: '?',
    tone: 'danger',
    title: 'Reserved but impossible to place',
    body:
      'These carry no difficulty band, or no Client Needs subcategory, so the selector has nowhere to put them — it cannot judge who should see them or which part of the blueprint they fill. Every one of these is a case question: a directly-reserved question is held to the rule by the database, but a case child inherits its reservation from the wrapper, and one unplaceable child stops CAT scheduling the WHOLE case.',
  },
  {
    key: 'draft',
    icon: '·',
    tone: 'muted',
    title: 'Reserved but still draft',
    body:
      'Selection only serves published rows, so a draft reservation is stock that is not really there. It counts against your target and never reaches a student — the pool is smaller than the number on the Coverage lens suggests.',
  },
];

export function AuditLens({ counts, view }: { counts: AuditCounts; view: StockView }) {
  return (
    <>
      <p className="cp-lede">
        Four things can go wrong with a reserved set. None of them block a sitting — they quietly
        degrade it, so they get their own lens rather than a badge on a row.
      </p>

      <div className="cp-audit">
        {CARDS.map((c) => {
          const n = counts[c.key];
          const clean = n === 0;

          return (
            <section key={c.key} className={`cp-auditcard is-${c.tone}${clean ? ' is-clean' : ''}`}>
              <span className="cp-auditicon" aria-hidden="true">
                {clean ? '✓' : c.icon}
              </span>

              <div className="cp-auditcard-body">
                <div className="cp-auditcard-title">
                  <h3>{c.title}</h3>
                  <span className="cp-auditcount">
                    {clean ? 'Nothing to fix' : `${n.toLocaleString()} question${n === 1 ? '' : 's'}`}
                  </span>
                </div>

                <p className="cp-auditbody">{c.body}</p>

                {c.aside && !clean && <p className="cp-auditaside">{c.aside}</p>}

                {!clean && (
                  <div className="cp-auditactions">
                    <Link
                      className="cp-auditbtn"
                      href={buildStockUrl('/admin/cat-pool', {
                        ...view,
                        lens: 'stock',
                        // The card's own condition, so each button lands on its
                        // own subset rather than a generic "has a warning" list.
                        warnType: c.key,
                        warnOnly: false,
                        source: 'all',
                        difficulty: 'all',
                        q: '',
                        limit: 50,
                      })}
                    >
                      Review these rows
                    </Link>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
