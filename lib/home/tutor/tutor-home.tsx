// mynclex/lib/home/tutor/tutor-home.tsx
//
// Tutor Home view (server component). Triage layout from the Claude
// Design "Tutor Home" handoff (Variant B): greeting + stat bar · needs
// your attention (enquiries + lagging cohorts) · this week's live
// sessions · your programmes · your workspace. Brand-new tutors get the
// "getting started" body instead.
//
// All interactions are plain links (Reply → the programme's enquiry
// queue, a cohort → its Analytics tab, etc.), so the whole page renders
// on the server. Styling: styles/tutor-home.css (ported from the CD
// stylesheet; classes keep the `th-` prefix).

import Link from 'next/link';
import type {
  HomeBehindCohort,
  HomeEnquiry,
  HomeProgramme,
  HomeSession,
  HomeStats,
  HomeWorkspaceTile,
  TutorHomeData,
} from './types';

// ── Inline icon set (ported from the CD handoff; only what Home uses) ────
const ICONS: Record<string, string> = {
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  layers:
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  mail:
    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  bell:
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  alert:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  checkCircle:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  video:
    '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  book:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  target:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  tutor:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  compass:
    '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Section head (icon chip + title + optional count + optional action) ──
function SectionHead({
  icon,
  title,
  count,
  desc,
  action,
}: {
  icon: string;
  title: string;
  count?: number | null;
  desc?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className={desc ? 'th-sec-headwrap has-desc' : 'th-sec-headwrap'}>
      <div className="th-sec-head">
        <div className="th-sec-head-l">
          <span className="th-sec-head-icon">
            <Icon name={icon} size={15} />
          </span>
          <h2 className="th-sec-title">{title}</h2>
          {count != null && <span className="th-sec-count">{count}</span>}
        </div>
        {action && (
          <Link className="th-sec-action" href={action.href}>
            {action.label}
          </Link>
        )}
      </div>
      {desc && <p className="th-sec-desc">{desc}</p>}
    </div>
  );
}

// ── KPI strip — four big cards under the greeting ────────────────────────
const STAT_DEFS: Array<{
  key: keyof HomeStats;
  label: string;
  icon: string;
  href?: string;
}> = [
  { key: 'programmes', label: 'Active programmes', icon: 'calendar', href: '/tutor/programmes' },
  { key: 'cohorts', label: 'Active cohorts', icon: 'layers', href: '/tutor/programmes' },
  { key: 'students', label: 'Enrolled students', icon: 'users', href: '/tutor/students' },
  { key: 'enquiries', label: 'Open enquiries', icon: 'mail' },
];

function KpiStrip({ stats }: { stats: HomeStats }) {
  return (
    <div className="th-kpi-strip">
      {STAT_DEFS.map((def) => {
        const value = stats[def.key];
        const alert = def.key === 'enquiries' && value > 0;
        const cls = 'th-kpi' + (alert ? ' is-alert' : '');
        const inner = (
          <>
            <span className="th-kpi-icon">
              <Icon name={def.icon} size={18} />
            </span>
            <span className="th-kpi-num">{value}</span>
            <span className="th-kpi-label">{def.label}</span>
            {def.href && (
              <span className="th-kpi-go">
                <Icon name="arrowRight" size={14} />
              </span>
            )}
          </>
        );
        return def.href ? (
          <Link key={def.key} href={def.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={def.key} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// ── Needs your attention ─────────────────────────────────────────────────
function EnquiryRow({ e }: { e: HomeEnquiry }) {
  return (
    <div className="th-attn-item th-enq">
      <span className="th-attn-dot th-enq-dot" />
      <div className="th-attn-body">
        <div className="th-attn-line1">
          <span className="th-attn-name">{e.name}</span>
          {e.fresh && <span className="th-tag th-tag-new">New</span>}
        </div>
        <div className="th-attn-line2">
          {e.programme} · {e.ago}
        </div>
      </div>
      <Link className="th-attn-cta" href={`/tutor/programme/${e.programmeId}/enquiries`}>
        Reply
      </Link>
    </div>
  );
}

function CohortRow({ c }: { c: HomeBehindCohort }) {
  return (
    <Link className={`th-attn-item th-coh sev-${c.sev}`} href={`/tutor/cohort/${c.cohortId}/analytics`}>
      <span className={`th-attn-dot th-coh-dot sev-${c.sev}`} />
      <div className="th-attn-body">
        <div className="th-attn-line1">
          <span className="th-attn-name">{c.cohort}</span>
          <span className="th-attn-prog">{c.programme}</span>
        </div>
        <div className="th-attn-line2">{c.signal}</div>
        <div className="th-coh-bar">
          <span className={`th-coh-bar-fill sev-${c.sev}`} style={{ width: `${c.avg}%` }} />
        </div>
      </div>
      <span className="th-attn-chev">
        <Icon name="chevronRight" size={16} />
      </span>
    </Link>
  );
}

function NeedsAttention({
  enquiries,
  behind,
}: {
  enquiries: HomeEnquiry[];
  behind: HomeBehindCohort[];
}) {
  if (enquiries.length === 0 && behind.length === 0) {
    return (
      <div className="th-caughtup">
        <span className="th-caughtup-icon">
          <Icon name="checkCircle" size={30} />
        </span>
        <div>
          <div className="th-caughtup-title">You&rsquo;re all caught up</div>
          <div className="th-caughtup-sub">
            No new enquiries and every cohort is on track. Nice work.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="th-attn-stack">
      {enquiries.length > 0 && (
        <div className="th-attn-group">
          <div className="th-attn-grouphead">
            <Icon name="mail" size={13} />
            <span>New enquiries</span>
            <span className="th-attn-groupcount">{enquiries.length}</span>
          </div>
          {enquiries.map((e) => (
            <EnquiryRow key={e.enquiryId} e={e} />
          ))}
        </div>
      )}
      {behind.length > 0 && (
        <div className="th-attn-group">
          <div className="th-attn-grouphead">
            <Icon name="alert" size={13} />
            <span>Cohorts falling behind</span>
            <span className="th-attn-groupcount">{behind.length}</span>
          </div>
          {behind.map((c) => (
            <CohortRow key={c.cohortId} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── This week (7-day live-session timeline) ──────────────────────────────
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function WeekTimeline({ sessions }: { sessions: HomeSession[] }) {
  if (sessions.length === 0) {
    return (
      <div className="th-empty-rail">
        <Icon name="video" size={20} />
        <span>No sessions scheduled this week.</span>
      </div>
    );
  }
  const today = new Date();
  const todayMid = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayMid + i * 86_400_000);
    return { offset: i, dow: DOW[d.getUTCDay()], date: d.getUTCDate(), today: i === 0 };
  });
  const byOffset = new Map<number, HomeSession[]>();
  for (const s of sessions) {
    const arr = byOffset.get(s.offset) ?? [];
    arr.push(s);
    byOffset.set(s.offset, arr);
  }
  return (
    <div className="th-timeline">
      {days.map((d) => (
        <div key={d.offset} className={'th-tl-day' + (d.today ? ' is-today' : '')}>
          <div className="th-tl-head">
            <span className="th-tl-dow">{d.dow}</span>
            <span className="th-tl-date">{d.date}</span>
          </div>
          <div className="th-tl-slots">
            {(byOffset.get(d.offset) ?? []).map((s) => (
              // TODO (live-session planner redesign): re-point this to the
              // cohort sessions surface — `/tutor/cohort/${s.cohortId}/sessions`
              // — once sessions move from the programme template to the
              // per-cohort planner. Today HomeSession has no cohortId
              // (sessions are template-level), and the programme `/sessions`
              // route is a placeholder kept alive solely for this link, so it
              // stays here until the planner lands and getUpcomingSessions
              // reads cohort-scoped schedules. See lib/nav/tutor.ts (programme
              // nav declutter note) + the live-session-planner plan doc.
              <Link
                key={s.activityId}
                className="th-tl-chip"
                href={`/tutor/programme/${s.programmeId}/sessions`}
              >
                <span className="th-tl-chip-time">{s.timeLabel}</span>
                <span className="th-tl-chip-title">{s.title}</span>
                <span className="th-tl-chip-cohort">{s.programme}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Programmes ───────────────────────────────────────────────────────────
function ProgrammeCard({ p }: { p: HomeProgramme }) {
  const healthLabel =
    p.health === 'on-track' ? 'On track' : p.health === 'watch' ? 'Needs a look' : '—';
  return (
    <Link className="th-prog" href={`/tutor/programme/${p.programmeId}/overview`}>
      <div className="th-prog-head">
        <h3 className="programme-card-title">{p.title}</h3>
        <span className="programme-pill is-live">Live</span>
      </div>
      {p.tagline && <p className="programme-card-tagline">{p.tagline}</p>}
      <div className="th-prog-meter" title={`${p.avg}% avg completion`}>
        <span className={`th-prog-meter-fill health-${p.health}`} style={{ width: `${p.avg}%` }} />
      </div>
      <div className="th-prog-foot">
        <span className="th-prog-meta">
          {p.cohorts} {p.cohorts === 1 ? 'cohort' : 'cohorts'} · {p.students} students
        </span>
        <span className={`th-prog-health health-${p.health}`}>{healthLabel}</span>
      </div>
    </Link>
  );
}

// ── Workspace band ───────────────────────────────────────────────────────
function WorkspaceCard({
  icon,
  name,
  href,
  tile,
}: {
  icon: string;
  name: string;
  href: string;
  tile: HomeWorkspaceTile;
}) {
  return (
    <Link className="th-ws-card" href={href}>
      <span className="th-ws-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="th-ws-body">
        <span className="th-ws-name">{name}</span>
        <span className="th-ws-count-row">
          <span className="th-ws-count">{tile.count}</span>
          <span className="th-ws-unit">{tile.unit}</span>
        </span>
        <span className="th-ws-signal">
          <span className={'th-ws-dot' + (tile.loose ? ' is-loose' : '')} />
          {tile.signal}
        </span>
      </span>
    </Link>
  );
}

// ── Fresh (brand-new tutor) ──────────────────────────────────────────────
function FreshBody() {
  const steps = [
    { icon: 'calendar', t: 'Create a programme', d: 'Set your curriculum, length and delivery mode.' },
    { icon: 'layers', t: 'Open a cohort', d: 'Pick start dates and seats for your first run.' },
    { icon: 'users', t: 'Invite students', d: 'Share your enrolment link and welcome them in.' },
  ];
  return (
    <div className="th-fresh">
      <div className="th-fresh-hero">
        <span className="th-fresh-badge">
          <Icon name="compass" size={14} /> Getting started
        </span>
        <h2 className="th-fresh-title">Let&rsquo;s set up your first programme</h2>
        <p className="th-fresh-sub">
          This is your home base — once you&rsquo;re running programmes, everything that needs you
          across your cohorts will surface right here.
        </p>
        <Link className="th-fresh-cta" href="/tutor/programmes">
          <Icon name="plus" size={16} /> Create a programme
        </Link>
      </div>
      <div className="th-fresh-steps">
        {steps.map((s, i) => (
          <div key={i} className="th-fresh-step">
            <span className="th-fresh-step-num">{i + 1}</span>
            <span className="th-fresh-step-icon">
              <Icon name={s.icon} size={18} />
            </span>
            <div className="th-fresh-step-t">{s.t}</div>
            <div className="th-fresh-step-d">{s.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export function TutorHome({ data }: { data: TutorHomeData }) {
  const greet = data.firstName ? `Welcome back, ${data.firstName}` : 'Welcome back';

  if (data.isFresh) {
    return (
      <div className="th-home">
        <div className="th-greeting">
          <h1 className="th-greeting-title">{greet}</h1>
          <p className="th-greeting-date">{todayLabel()}</p>
        </div>
        <FreshBody />
      </div>
    );
  }

  const attnCount = data.enquiries.length + data.behind.length;
  const urgent =
    data.behind.filter((c) => c.sev === 'high').length +
    data.enquiries.filter((e) => e.fresh).length;
  const heroDesc =
    attnCount === 0
      ? 'You’re all caught up — nothing needs you right now.'
      : `${attnCount} ${attnCount === 1 ? 'item needs' : 'items need'} you${
          urgent > 0 ? ` · ${urgent} time-sensitive` : ''
        }.`;

  return (
    <div className="th-home">
      <div className="th-greeting">
        <h1 className="th-greeting-title">{greet}</h1>
        <p className="th-greeting-date">{todayLabel()}</p>
      </div>
      <KpiStrip stats={data.stats} />

      <section className={'th-card th-vb-hero' + (attnCount === 0 ? ' is-calm' : '')}>
        <SectionHead icon="bell" title="Needs your attention" count={attnCount || null} desc={heroDesc} />
        <NeedsAttention enquiries={data.enquiries} behind={data.behind} />
      </section>

      <section className="th-card th-vb-week">
        <SectionHead icon="calendar" title="This week" />
        <WeekTimeline sessions={data.sessions} />
      </section>

      <section className="th-prog-section">
        <SectionHead
          icon="calendar"
          title="Your programmes"
          count={data.programmes.length || null}
          action={{ label: '+ New programme', href: '/tutor/programmes' }}
        />
        <div className="th-prog-grid">
          {data.programmes.map((p) => (
            <ProgrammeCard key={p.programmeId} p={p} />
          ))}
        </div>
      </section>

      <section className="th-prog-section">
        <SectionHead icon="book" title="Your workspace" />
        <div className="th-ws-grid">
          <WorkspaceCard icon="book" name="My Bank" href="/tutor/bank/all" tile={data.workspace.bank} />
          <WorkspaceCard icon="target" name="Quizzes" href="/tutor/quizzes" tile={data.workspace.quizzes} />
          <WorkspaceCard icon="tutor" name="Library" href="/tutor/library" tile={data.workspace.library} />
        </div>
      </section>
    </div>
  );
}
