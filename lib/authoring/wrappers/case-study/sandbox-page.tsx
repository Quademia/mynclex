// mynclex/lib/authoring/wrappers/case-study/sandbox-page.tsx
//
// Slice 12 working sandbox — visual-only two-mode case-study wrapper.
//
// Geometry (settled in design-pass 2026-04-30):
//   - Right column: combined preview (chart context + active question
//     preview). Always visible. Tracks activeSlot.
//   - Left column: TWO MODES, toggled by clicking a slot card.
//       * Wrapper mode (default): wrapper-edit pane — Content/Chart
//         tabs, visibility section, slot rail, Save case study + Validate
//         + Delete + Cancel buttons in header.
//       * Editor mode: editor body for the active slot, slot strip at
//         top for switching, "× Close" returns to wrapper mode.
//
// Hardcoded data, no DB reads, no DB writes. Buttons are no-ops except
// for the mode-toggling and active-slot mechanics.
//
// Lifespan: this file gets renamed/folded into the real wrapper page in
// sub-slice 12b. Do not extend with side effects or persistence.

'use client';

import { useState, useMemo } from 'react';

type WrapperTab = 'content' | 'chart';
type PreviewPos = 'off' | 1 | 2 | 3 | 4 | 5 | 6;
type QuestionMode = 'student' | 'answer-key';

interface ChartTab {
  key:           string;
  title:         string;
  shape:         'narrative' | 'structured';
}

interface VitalsRow {
  visible_from: number;
  time:         string;
  bp:           string;
  hr:           string;
  rr:           string;
  spo2:         string;
  temp:         string;
  hr_flag?:     'high' | 'low';
  bp_flag?:     'high' | 'low';
  rr_flag?:     'high' | 'low';
}

interface Slot {
  position:    number;
  type:        'MCQ' | 'TF' | 'SATA' | 'MATRIX' | 'CLOZE' | null;
  cjmm:        'RC' | 'AC' | 'PH' | 'GS' | 'TA' | 'EO' | null;
  summary:     string;
  status:      'ok' | 'warn' | 'error' | 'draft';
  dirty?:      boolean;
}

const CHART_TABS: ChartTab[] = [
  { key: 'nurses_notes', title: 'Nurses notes',       shape: 'narrative'  },
  { key: 'vital_signs',  title: 'Vital signs',        shape: 'structured' },
  { key: 'lab_results',  title: 'Lab results',        shape: 'structured' },
  { key: 'orders',       title: 'Orders',             shape: 'narrative'  },
  { key: 'history',      title: 'History & physical', shape: 'narrative'  },
  { key: 'diagnostics',  title: 'Diagnostics',        shape: 'narrative'  },
];

const VITALS_ROWS: VitalsRow[] = [
  { visible_from: 1, time: '13:00', bp: '124/80', hr: '78',  rr: '16', spo2: '98%', temp: '98.6 °F' },
  { visible_from: 2, time: '13:30', bp: '110/72', hr: '92',  rr: '18', spo2: '97%', temp: '98.4 °F' },
  { visible_from: 3, time: '14:00', bp: '96/64',  hr: '110', rr: '22', spo2: '96%', temp: '98.6 °F',
    bp_flag: 'low', hr_flag: 'high', rr_flag: 'high' },
];

const SLOTS: Slot[] = [
  { position: 1, type: 'MCQ',    cjmm: 'RC', summary: 'Which finding at 14:00 is most concerning?',                    status: 'ok' },
  { position: 2, type: 'SATA',   cjmm: 'TA', summary: 'Select all the priority nursing actions for this patient at 14:00.', status: 'warn', dirty: true },
  { position: 3, type: 'MATRIX', cjmm: 'AC', summary: 'Categorise each finding as expected or unexpected for postpartum.',  status: 'ok' },
  { position: 4, type: null,     cjmm: null, summary: '',                                                               status: 'draft' },
  { position: 5, type: null,     cjmm: null, summary: '',                                                               status: 'draft' },
  { position: 6, type: null,     cjmm: null, summary: '',                                                               status: 'draft' },
];

export function CaseStudyWrapperSandbox() {
  // Mode toggle: false = wrapper mode (default), true = editor mode.
  const [editorMode, setEditorMode] = useState(false);

  // activeSlot drives the combined preview always — even in wrapper
  // mode the preview shows what the student would see at that position.
  const [activeSlot, setActiveSlot] = useState<number>(2);

  // Wrapper-mode-only state.
  const [activeTab, setActiveTab] = useState<WrapperTab>('chart');
  const [previewPos, setPreviewPos] = useState<PreviewPos>('off');
  const [activeChartTab, setActiveChartTab] = useState<string>('vital_signs');

  // Combined-preview question-pane toggle.
  const [questionMode, setQuestionMode] = useState<QuestionMode>('student');

  const visibleVitalsRows = useMemo(() => {
    if (previewPos === 'off') return VITALS_ROWS.map((r) => ({ row: r, hidden: false }));
    return VITALS_ROWS.map((r) => ({ row: r, hidden: r.visible_from > previewPos }));
  }, [previewPos]);

  const studentVitalsRows = useMemo(() => {
    return VITALS_ROWS.filter((r) => r.visible_from <= activeSlot);
  }, [activeSlot]);

  const populated = SLOTS.filter((s) => s.type !== null).length;
  const activeSlotData = SLOTS[activeSlot - 1] ?? null;

  function onSlotClick(pos: number) {
    setActiveSlot(pos);
    setEditorMode(true);
  }

  function onCloseEditor() {
    setEditorMode(false);
  }

  function onSlotStripClick(pos: number) {
    // In a real build this would fire a discard / save-first prompt
    // when the active question is dirty. Sandbox just switches.
    setActiveSlot(pos);
  }

  return (
    <div className="auth-cs-sandbox-wrap">
      <div className="auth-cs-page-topbar">
        <span>Bank</span><span className="auth-cs-crumb-sep">›</span>
        <span>Case Studies (v2)</span><span className="auth-cs-crumb-sep">›</span>
        <span className="auth-cs-crumb-current">Postpartum hemorrhage assessment</span>
        <span className="auth-cs-mode-pill">
          {editorMode ? `Editor mode · Q${activeSlot}` : 'Wrapper mode'}
        </span>
        <span className="auth-cs-sandbox-pill">SANDBOX</span>
      </div>

      <div className="auth-cs-grid">

        {!editorMode && (
          <div className="auth-cs-pane auth-cs-pane-left">
            <div className="auth-cs-pane-label">
              <span>Wrapper edit</span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="auth-cs-btn subtle tiny" type="button">Cancel</button>
                <button className="auth-cs-btn tiny" type="button" style={{ color: 'var(--danger)', borderColor: '#fecaca', background: '#fef2f2' }}>Delete</button>
                <button className="auth-cs-btn tiny" type="button">Validate</button>
                <button className="auth-cs-btn primary tiny" type="button">Save case study</button>
              </span>
            </div>

            <div className="auth-cs-pane-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'content'}
                className={`auth-cs-pane-tab${activeTab === 'content' ? ' active' : ''}`}
                onClick={() => setActiveTab('content')}
              >
                Content
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'chart'}
                className={`auth-cs-pane-tab${activeTab === 'chart' ? ' active' : ''}`}
                onClick={() => setActiveTab('chart')}
              >
                Chart
                <span className="auth-cs-tab-dot" title="Unsaved changes on this tab" />
              </button>
            </div>

            {activeTab === 'content' && (
              <div className="auth-cs-tabbody">
                <div className="auth-cs-field">
                  <label className="auth-cs-field-label">Title</label>
                  <input
                    className="auth-cs-field-input"
                    defaultValue="Postpartum hemorrhage assessment"
                  />
                </div>
                <div className="auth-cs-field">
                  <label className="auth-cs-field-label">Scenario</label>
                  <textarea
                    className="auth-cs-field-textarea"
                    rows={4}
                    defaultValue={
                      'A 28-year-old G3P3 patient is 2 hours postpartum following a vaginal ' +
                      'delivery. The patient is alert and oriented. You are conducting your ' +
                      'shift assessment and review the chart below.'
                    }
                  />
                </div>

                <div className="auth-cs-visibility" role="group" aria-label="Visibility flags">
                  <div className="auth-cs-visibility-title">Visibility</div>
                  <VisibilityRow
                    label="Published"
                    help="Live to students. Requires all 6 slots populated."
                    defaultOn={false}
                  />
                  <VisibilityRow
                    label="Free sample"
                    help="Available without subscription."
                    defaultOn={false}
                  />
                  <VisibilityRow
                    label="Visible in builder"
                    help="Show in tutor programme builders."
                    defaultOn={true}
                  />
                </div>
              </div>
            )}

            {activeTab === 'chart' && (
              <div className="auth-cs-tabbody">
                <div className="auth-cs-chart-toolbar">
                  <span className="auth-cs-field-label" style={{ margin: 0 }}>
                    {CHART_TABS.find((t) => t.key === activeChartTab)?.title}
                  </span>
                  <span className="auth-cs-preview-pos" role="group" aria-label="Preview chart at position">
                    <span className="auth-cs-preview-pos-label">Preview at</span>
                    {(['off', 1, 2, 3, 4, 5, 6] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        className={`auth-cs-preview-pos-btn${previewPos === v ? ' active' : ''}`}
                        onClick={() => setPreviewPos(v)}
                      >
                        {v === 'off' ? 'Off' : v}
                      </button>
                    ))}
                  </span>
                </div>

                <div className="auth-cs-chart-tabs" role="tablist">
                  {CHART_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={activeChartTab === t.key}
                      className={`auth-cs-chart-tab${activeChartTab === t.key ? ' active' : ''}`}
                      onClick={() => setActiveChartTab(t.key)}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>

                <div className="auth-cs-chart-content">
                  {activeChartTab === 'vital_signs' ? (
                    <table className="auth-cs-vs-table">
                      <thead>
                        <tr>
                          <th>Visible</th><th>Time</th><th>BP</th><th>HR</th>
                          <th>RR</th><th>SpO₂</th><th>Temp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleVitalsRows.map(({ row, hidden }) => (
                          <tr key={row.time} className={hidden ? 'auth-cs-vf-hidden' : ''}>
                            <td>
                              <span className="auth-cs-vf-chip">Q{row.visible_from}</span>
                            </td>
                            <td>{row.time}</td>
                            <td className={row.bp_flag === 'low' ? 'auth-cs-flag-low' : ''}>{row.bp}</td>
                            <td className={row.hr_flag === 'high' ? 'auth-cs-flag-high' : ''}>{row.hr}</td>
                            <td className={row.rr_flag === 'high' ? 'auth-cs-flag-high' : ''}>{row.rr}</td>
                            <td>{row.spo2}</td>
                            <td>{row.temp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="auth-cs-empty-msg">
                      {CHART_TABS.find((t) => t.key === activeChartTab)?.title} —
                      sandbox shows the Vital signs tab only. Other tabs render as empty here.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="auth-cs-slot-rail-header">
              <span className="auth-cs-slot-rail-title">Question slots · {populated} of 6</span>
              <button className="auth-cs-btn subtle tiny" type="button">Reorder</button>
            </div>
            <div className="auth-cs-slot-rail">
              {SLOTS.map((s) => (
                <SlotCard
                  key={s.position}
                  slot={s}
                  active={s.position === activeSlot}
                  onClick={() => onSlotClick(s.position)}
                />
              ))}
            </div>
            <button className="auth-cs-slot-add" type="button">+ Add question</button>
          </div>
        )}

        {editorMode && (
          <div className="auth-cs-pane auth-cs-pane-left auth-cs-editor-pane">
            <div className="auth-cs-editor-header">
              <button
                type="button"
                className="auth-cs-btn subtle tiny"
                onClick={onCloseEditor}
                aria-label="Close editor and return to wrapper view"
              >
                ← Wrapper view
              </button>
              <div className="auth-cs-slot-strip" role="tablist" aria-label="Switch question slot">
                {SLOTS.map((s) => (
                  <button
                    key={s.position}
                    type="button"
                    role="tab"
                    aria-selected={s.position === activeSlot}
                    className={
                      'auth-cs-slot-pip' +
                      (s.position === activeSlot ? ' active' : '') +
                      (s.type === null ? ' empty' : '') +
                      (s.dirty ? ' dirty' : '')
                    }
                    onClick={() => onSlotStripClick(s.position)}
                    title={s.type ? `Q${s.position} · ${s.type}` : `Q${s.position} · empty`}
                  >
                    Q{s.position}
                    <span className={`auth-cs-slot-pip-status auth-cs-slot-status-${s.status}`} />
                  </button>
                ))}
                <button
                  type="button"
                  className="auth-cs-slot-pip auth-cs-slot-pip-add"
                  title="Add question"
                >
                  +
                </button>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="auth-cs-btn tiny" type="button">Discard</button>
                <button className="auth-cs-btn primary tiny" type="button">Save question</button>
              </span>
            </div>

            <div className="auth-cs-editor-title">
              Q{activeSlot}
              {activeSlotData?.type && (
                <span className="auth-cs-editor-mounted-label" style={{ marginLeft: 8 }}>
                  {activeSlotData.type} editor
                </span>
              )}
            </div>

            {activeSlotData?.type === null ? (
              <div className="auth-cs-empty-msg" style={{ padding: 22, textAlign: 'center' }}>
                Slot Q{activeSlot} is empty. In the real build, the type-picker
                would have opened first; the chosen editor body would mount here in
                create mode.
              </div>
            ) : (
              <div className="auth-cs-editor-body-stub">
                <p className="auth-cs-stub-line">
                  <strong>{activeSlotData?.type} editor body would mount here</strong>,
                  filling the full left column. Same component the standalone bank
                  list uses — imported by name based on the active slot's question type.
                </p>
                <p className="auth-cs-stub-line auth-cs-stub-muted">
                  For Q{activeSlot} ({activeSlotData?.type}), the body provides:
                  stem, options, feedback, classification + housekeeping tabs. Saving
                  here updates only the question — wrapper-level state (title,
                  scenario, visibility, chart tabs) is untouched.
                </p>
                <p className="auth-cs-stub-line auth-cs-stub-muted">
                  The right column's combined preview tracks Q{activeSlot} as the
                  curator types — chart shows what the student would see at this
                  position; question subsection updates with the latest stem/options.
                </p>
              </div>
            )}
          </div>
        )}

        {/* RIGHT — combined preview, always visible */}
        <div className="auth-cs-pane auth-cs-pane-preview">
          <div className="auth-cs-pane-label">
            <span>Combined preview</span>
            <span className="auth-cs-preview-meta">
              As student at <strong>Q{activeSlot}</strong> · tracks active slot
            </span>
          </div>

          <div className="auth-cs-preview-section">
            <div className="auth-cs-preview-section-label">
              Chart context · what the student sees at Q{activeSlot}
            </div>
            <p className="auth-cs-preview-scenario">
              A 28-year-old G3P3 patient is 2 hours postpartum following a vaginal delivery.
              The patient is alert and oriented. You are conducting your shift assessment and
              review the chart below.
            </p>
            <div className="auth-cs-chart-tabs">
              {CHART_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`auth-cs-chart-tab${activeChartTab === t.key ? ' active' : ''}`}
                  onClick={() => setActiveChartTab(t.key)}
                >
                  {t.title.length > 12 ? t.title.split(' ')[0] : t.title}
                </button>
              ))}
            </div>
            <div className="auth-cs-chart-content auth-cs-preview-chart">
              {activeChartTab === 'vital_signs' ? (
                <>
                  <table className="auth-cs-vs-table">
                    <thead>
                      <tr><th>Time</th><th>BP</th><th>HR</th><th>RR</th><th>SpO₂</th><th>Temp</th></tr>
                    </thead>
                    <tbody>
                      {studentVitalsRows.map((row) => (
                        <tr key={row.time}>
                          <td>{row.time}</td>
                          <td className={row.bp_flag === 'low' ? 'auth-cs-flag-low' : ''}>{row.bp}</td>
                          <td className={row.hr_flag === 'high' ? 'auth-cs-flag-high' : ''}>{row.hr}</td>
                          <td className={row.rr_flag === 'high' ? 'auth-cs-flag-high' : ''}>{row.rr}</td>
                          <td>{row.spo2}</td>
                          <td>{row.temp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {studentVitalsRows.length < VITALS_ROWS.length && (
                    <p className="auth-cs-preview-hidden-note">
                      {VITALS_ROWS.length - studentVitalsRows.length} row(s) hidden — visible_from {'>'} Q{activeSlot}
                    </p>
                  )}
                </>
              ) : (
                <p className="auth-cs-empty-msg">
                  {CHART_TABS.find((t) => t.key === activeChartTab)?.title} — sandbox renders Vital signs only.
                </p>
              )}
            </div>
          </div>

          <div className="auth-cs-preview-section">
            <div className="auth-cs-preview-question-header">
              <div className="auth-cs-preview-section-label" style={{ marginBottom: 0 }}>
                Active question · Q{activeSlot}{activeSlotData?.type ? ` (${activeSlotData.type})` : ''}
              </div>
              <span className="auth-cs-preview-toggle">
                <button
                  type="button"
                  className={`auth-cs-pill${questionMode === 'student' ? ' active' : ''}`}
                  onClick={() => setQuestionMode('student')}
                >
                  Student
                </button>
                <button
                  type="button"
                  className={`auth-cs-pill${questionMode === 'answer-key' ? ' active' : ''}`}
                  onClick={() => setQuestionMode('answer-key')}
                >
                  Answer key
                </button>
              </span>
            </div>

            {activeSlotData?.type === null ? (
              <p className="auth-cs-empty-msg">Slot is empty — nothing to preview.</p>
            ) : (
              <div className="auth-cs-preview-question">
                <p className="auth-cs-student-stem">
                  {activeSlotData?.summary || 'Active question stem.'}
                </p>
                <p className="auth-cs-stub-muted">
                  ({questionMode === 'student'
                    ? 'Student view'
                    : 'Answer-key view — correct options highlighted in real editor'}{' '}
                  · sandbox stub.)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VisibilityRow({
  label,
  help,
  defaultOn,
}: {
  label:     string;
  help:      string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="auth-cs-vrow">
      <span className="auth-cs-vrow-label">
        {label}
        <span className="auth-cs-vrow-help">{help}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`auth-cs-vswitch${on ? ' on' : ''}`}
        onClick={() => setOn(!on)}
      />
    </div>
  );
}

function SlotCard({
  slot,
  active,
  onClick,
}: {
  slot:    Slot;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        'auth-cs-slot-card' +
        (active ? ' active' : '') +
        (slot.dirty ? ' dirty' : '')
      }
      onClick={onClick}
    >
      <span className="auth-cs-slot-num">Q{slot.position}</span>
      <span className="auth-cs-slot-summary">
        {slot.type && <span className="auth-cs-type-chip">{slot.type}</span>}
        {slot.summary || (
          <span className="auth-cs-stub-muted">Empty slot</span>
        )}
      </span>
      {slot.cjmm && <span className="auth-cs-slot-cjmm">{slot.cjmm}</span>}
      <span className={`auth-cs-slot-status auth-cs-slot-status-${slot.status}`} />
    </button>
  );
}
