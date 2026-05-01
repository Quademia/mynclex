// mynclex/app/(app)/admin/bank/trends-v2/new/page.tsx
//
// Slice 13a — kind preset picker for new admin trend datasets.
// Six cards: 5 built-in presets (Vitals / Labs / Intake & Output /
// Neuro / Assessment) + Custom. Each card is its own server-action
// form posting `surface=admin` + `kind=<preset>`. The Custom card
// includes an inline text input for a freeform kind name.
//
// createTrendAction redirects to /admin/bank/trends-v2/<trend_id>
// on success (where the curator lands directly in the wrapper page
// to fill in title / scenario / data table).

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { createTrendAction } from '@/lib/authoring/wrappers/trend/actions';

export const dynamic = 'force-dynamic';

interface PresetCard {
  kind:        string;
  label:       string;
  description: string;
}

const PRESETS: PresetCard[] = [
  { kind: 'vitals',     label: 'Vitals',           description: 'BP, HR, RR, SpO₂, Temp — pre-seeded rows for a typical vitals panel.' },
  { kind: 'labs',       label: 'Labs',             description: 'Common electrolytes / chemistry. Ref-range column on by default.' },
  { kind: 'io',         label: 'Intake & Output',  description: 'IV / PO intake, urine output, net balance.' },
  { kind: 'neuro',      label: 'Neuro',            description: 'GCS, pupils, orientation, motor strength.' },
  { kind: 'assessment', label: 'Assessment',       description: 'Empty scaffold — build rows + timepoints from scratch.' },
];

export default async function AdminTrendsV2NewPage() {
  await requireAdminPermission(PERM_BANK_CURATE);

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">New trend dataset</h1>
            <p className="auth-list-page-subtitle">
              Pick a kind preset to seed the new dataset&apos;s rows + timepoints.
              Everything seeded is editable afterwards — picking is just a
              starting-point convenience. Use Custom to start blank with your
              own kind name.
            </p>
          </div>
          <div className="auth-list-toolbar">
            <Link href="/admin/bank/trends-v2" className="auth-cs-btn subtle">← Cancel</Link>
          </div>
        </header>

        <div className="auth-kind-grid">
          {PRESETS.map((p) => (
            <form
              key={p.kind}
              action={async (fd: FormData) => {
                'use server';
                await createTrendAction(fd);
              }}
              className="auth-kind-card-form"
            >
              <input type="hidden" name="surface" value="admin" />
              <input type="hidden" name="kind" value={p.kind} />
              <button type="submit" className="auth-kind-card">
                <div className="auth-kind-card-label">{p.label}</div>
                <div className="auth-kind-card-desc">{p.description}</div>
              </button>
            </form>
          ))}

          <form
            action={async (fd: FormData) => {
              'use server';
              await createTrendAction(fd);
            }}
            className="auth-kind-card-form auth-kind-card-form-custom"
          >
            <input type="hidden" name="surface" value="admin" />
            <input type="hidden" name="kind" value="custom" />
            <div className="auth-kind-card auth-kind-card-custom">
              <div className="auth-kind-card-label">Custom</div>
              <div className="auth-kind-card-desc">Type your own kind name. Empty rows + timepoints — build from scratch.</div>
              <input
                type="text"
                name="custom_kind_name"
                placeholder="e.g. respiratory rhythm, cardiac telemetry"
                className="auth-kind-card-input"
                required
                minLength={1}
                maxLength={64}
              />
              <button type="submit" className="auth-kind-card-create">Create</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
