// mynclex/lib/library/analytics/reader-report.tsx
//
// One reader's full picture on a note (slice 11.11c, Slice 3b) — reached
// by clicking a reader in the Roster / Readers tab. Per block, per
// question: their first-attempt pick vs the key, and whether they
// recovered on re-practice. Concept from the CD "student report" view,
// rebuilt in the app shell.

import Link from 'next/link';
import type { EmbedReaderReport, ReportOption } from './types';

export function EmbedReaderReportView({
  data,
}: {
  data: EmbedReaderReport;
}) {
  return (
    <div className="eqa-rep">
      <Link
        href={`/tutor/library/analytics/note/${data.noteId}?tab=${data.fromTab}`}
        className="eqa-crumb-back"
      >
        ← Back to {data.noteTitle}
      </Link>

      <div className="eqa-rep-head">
        <span
          className="eqa-reader-avatar eqa-rep-avatar"
          data-kind={data.isCohort ? 'cohort' : 'self'}
          aria-hidden="true"
        >
          {data.initials}
        </span>
        <div>
          <h1 className="eqa-title eqa-rep-name">{data.name}</h1>
          <div className="eqa-rep-sub">
            <span
              className="eqa-reader-badge"
              data-kind={data.isCohort ? 'cohort' : 'self'}
            >
              {data.segmentLabel}
            </span>
            <span className="eqa-rep-on">on “{data.noteTitle}”</span>
          </div>
        </div>
      </div>

      <div className="eqa-rep-stats">
        <div className="eqa-rep-stat">
          <div className="eqa-rep-stat-lbl">First-try score</div>
          <div
            className="eqa-rep-stat-val"
            data-tier={data.firstTier ?? 'holding'}
          >
            {data.firstScoreLabel}
          </div>
        </div>
        <div className="eqa-rep-stat">
          <div className="eqa-rep-stat-lbl">After re-practice</div>
          <div className="eqa-rep-stat-val eqa-rep-stat-val--ok">
            {data.latestAccPct === null ? '—' : `${data.latestAccPct}%`}
          </div>
        </div>
      </div>

      <div className="eqa-rep-blocks">
        {data.blocks.map((b, bi) => (
          <section key={bi} className="eqa-rep-block">
            <div className="eqa-rep-block-head">
              <span className="eqa-block-tag">{b.tag}</span>
              <h3 className="eqa-block-title">{b.title}</h3>
            </div>
            {b.questions.map((q, qi) => (
              <div key={qi} className="eqa-rep-q" data-tone={q.edgeTone}>
                <span className="eqa-rep-mark" data-tone={q.edgeTone}>
                  {q.mark}
                </span>
                <div className="eqa-rep-qmain">
                  <div className="eqa-rep-stem">{q.stem}</div>
                  <div className="eqa-rep-opts">
                    {q.options.map((o, oi) => (
                      <ReportOpt key={oi} o={o} />
                    ))}
                  </div>
                  <div className="eqa-rep-note">{q.note}</div>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ReportOpt({ o }: { o: ReportOption }) {
  const kind = o.isKey
    ? o.isYou
      ? 'keyyou'
      : 'key'
    : o.isYou
      ? 'youwrong'
      : 'plain';
  const tag = o.isKey ? '✓' : o.isYou ? '✗' : '';
  return (
    <div className="eqa-rep-opt" data-kind={kind}>
      <span className="eqa-rep-opt-letter">{o.letter}</span>
      <span className="eqa-rep-opt-text">{o.text}</span>
      {tag && <span className="eqa-rep-opt-tag">{tag}</span>}
    </div>
  );
}
