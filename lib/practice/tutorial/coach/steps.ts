// mynclex/lib/practice/tutorial/coach/steps.ts
//
// The coach walkthrough — ported from the Claude Design blueprint's STEPS
// array (docs/product-plan/design-handoff/runner-tutorial/tutorial-runner.html),
// concept-not-source. Each step carries the copy, the control it points at
// (`target`), an optional question to switch to first (`gotoKey`, a question
// KEY — order-independent, unlike CD's numeric goto), and an optional gate
// (a must-do before Next unlocks; wired in Slice 2b).
//
// TWO deliberate departures from the CD blueprint:
//   • The Mark-for-review step is DROPPED. The runner's Mark button is a
//     disabled placeholder (BUILD_LIST 4.7 — "toggle wiring lands" later);
//     the tutorial must not teach a control that does nothing. Restore this
//     step when Mark-for-review ships.
//   • `goto` is a question KEY, not an index — so the coach never depends on
//     the item ordering (CD's order differs from ours).

// The named controls the coach can anchor to. Each maps to a
// `data-coach="<target>"` marker on a real runner component.
export type CoachTarget =
  | 'exit'
  | 'title'
  | 'tutpill'
  | 'counter'
  | 'clock'
  | 'calc'
  | 'grid'
  | 'gridfilters'
  | 'legend'
  | 'footer'
  | 'answerarea'
  | 'casepanel'
  | 'casetabs'
  | 'cjmm'
  | 'trendpanel';

export interface CoachStep {
  /** Coach-card heading. */
  title:    string;
  /** Coach-card body copy. */
  body:     string;
  /** Control to anchor the card beside + spotlight. Absent → centred card. */
  target?:  CoachTarget;
  /** Question to switch the runner to before showing this step (a question
   *  key from questions.ts). Absent → stay on the current question. */
  gotoKey?: string;
  /** Ensure the question grid is open for this step. */
  grid?:    boolean;
  /** Must-do before Next unlocks (Slice 2b). Mark is intentionally absent. */
  gate?:    'calc' | 'submit';
  /** Footer hint shown while the gate is unmet. */
  gateMsg?: string;
  /** The final step — the card shows the "you're ready" ending. */
  done?:    boolean;
}

export const COACH_STEPS: CoachStep[] = [
  // ── Chrome & tools ───────────────────────────────────────────────
  { title: 'This is the exam tutorial', body: 'Everything you see here is the real exam screen — same layout, same controls, same behaviour for every question type. Nothing is recorded: no attempt, no answers, no score. Work through it as many times as you like.', gotoKey: 'mcq', grid: true },
  { title: 'Leaving the exam', body: 'Exit sits top-left. In a real sitting it asks you to confirm before it lets go of an attempt in progress. Here it simply ends the tutorial.', target: 'exit' },
  { title: 'What you are sitting', body: 'The title line names the session and its mode, how many questions it holds, and — inside a case study — which case you are in and which clinical-judgment step the question belongs to.', target: 'title' },
  { title: 'Nothing here is recorded', body: 'This badge only appears in the tutorial. When it is gone, you are in a real attempt and your answers count.', target: 'tutpill' },
  { title: 'Where you are', body: 'The counter shows the current question and the total. In an adaptive (CAT) exam there is no total to show, so only the current question appears — the exam ends when it has enough evidence about you.', target: 'counter' },
  { title: 'The clock', body: 'Untimed sittings count up; timed sittings count down and warn you at 30, 15, 5 and 1 minute. Use the button to hide the clock if it distracts you — once a warning fires, the clock locks visible.', target: 'clock' },
  { title: 'The calculator', body: 'An on-screen calculator is available on every question, in every mode — the same tool you get in the real exam. Open and close it from here.', target: 'calc', gate: 'calc', gateMsg: 'Open the calculator to continue.' },
  { title: 'The question grid', body: 'Every question in the sitting, colour-coded. Click any cell to jump to it — where the mode allows going back.', target: 'grid', grid: true },
  // Copy tracks the grid's real labels. Updated when "Marked" became
  // "Flagged" — the tutorial is public and on prod, so leaving it naming
  // a chip that no longer exists would be a live inaccuracy, not a
  // tidy-up to defer. The tutorial's own FLAG STEPS are still to come.
  { title: 'Filtering the grid', body: 'Narrow the grid to what you still owe: All, Flagged, Unanswered, and — where feedback is available — Wrong.', target: 'gridfilters' },
  { title: 'Reading the colours', body: 'White is unanswered, blue is answered, green correct, dark red wrong, amber skipped. An amber border means flagged for review; a teal ring means you are here now.', target: 'legend' },
  { title: 'The footer', body: 'Previous on the left, the mode reminder in the middle, and the action button on the right. The action button is disabled until your answer is complete — hover it to see what is missing.', target: 'footer' },

  // ── Every question type ──────────────────────────────────────────
  { title: 'Multiple choice', body: 'The most common item. Pick one option, then Submit. In this tutorial you see the rationale straight after each submit, the way untimed learning behaves.', gotoKey: 'mcq', target: 'answerarea', gate: 'submit', gateMsg: 'Pick an option and press Submit answer.' },
  { title: 'True / false', body: 'Two locked options and the same rules as multiple choice.', gotoKey: 'tf', target: 'answerarea', gate: 'submit', gateMsg: 'Answer and submit to continue.' },
  { title: 'Select all that apply', body: 'Any number of options may be correct — including, occasionally, only one. There is no partial hint: choose every option you believe is correct. Submit is allowed even with nothing selected, because "none of these" is a real answer.', gotoKey: 'sata', target: 'answerarea', gate: 'submit', gateMsg: 'Answer and submit to continue.' },
  { title: 'Select N', body: 'Like select-all, but the number is fixed. The counter above the list tracks your picks, and once you hit the limit the remaining options dim — deselect one to swap.', gotoKey: 'select_n', target: 'answerarea', gate: 'submit', gateMsg: 'Choose exactly 2, then submit.' },
  { title: 'Matrix', body: 'One choice per row. Every row must be answered before you can submit. In feedback each row is marked on its own and carries its own note.', gotoKey: 'matrix', target: 'answerarea', gate: 'submit', gateMsg: 'Answer every row, then submit.' },
  { title: 'Matrix — multiple response', body: 'Same grid, square boxes: a row can need more than one answer. Every row still needs at least one.', gotoKey: 'matrix_mr', target: 'answerarea', gate: 'submit', gateMsg: 'Give every row at least one answer, then submit.' },
  { title: 'Highlight', body: 'The passage itself is the answer space. Clickable phrases are not marked in advance — finding them is part of the question. Click to highlight, click again to undo.', gotoKey: 'highlight', target: 'answerarea', gate: 'submit', gateMsg: 'Highlight what needs follow-up, then submit.' },
  { title: 'Cloze (drop-down)', body: 'Sentences with numbered blanks. Each blank is a drop-down and each is scored on its own, so a wrong first blank does not cost you the rest.', gotoKey: 'cloze', target: 'answerarea', gate: 'submit', gateMsg: 'Fill both blanks, then submit.' },
  { title: 'Drag-and-drop cloze', body: 'Same idea, tokens instead of drop-downs — and it works by tapping, not dragging. Select a token, then select the box. Select a filled box to send its token back to the pool.', gotoKey: 'drag_cloze', target: 'answerarea', gate: 'submit', gateMsg: 'Fill both boxes, then submit.' },
  { title: 'Drag to order', body: 'Put the actions in sequence with the same tap-to-place interaction. Every position must be filled before you can submit.', gotoKey: 'drag_order', target: 'answerarea', gate: 'submit', gateMsg: 'Fill all four positions, then submit.' },
  { title: 'Bow-tie', body: 'The hardest shape: one condition in the centre, the actions it demands on the left, the parameters you would monitor on the right. All five boxes must be filled. Each wing has its own token pool.', gotoKey: 'bowtie', target: 'answerarea', gate: 'submit', gateMsg: 'Fill all five boxes, then submit.' },

  // ── Case & trend ─────────────────────────────────────────────────
  { title: 'Case studies', body: 'A case is six linked questions about one client. The chart stays beside the question the whole way through — this is the part of the exam most students meet cold.', gotoKey: 'case_recognise', target: 'casepanel' },
  { title: 'The chart unfolds as you go', body: 'Tabs appear as the case progresses: later observations arrive at later questions. Move through the tabs freely — nothing is hidden from you that the case has already given.', target: 'casetabs' },
  { title: 'The six clinical-judgment steps', body: 'Each question maps to one step: recognise cues, analyse cues, prioritise hypotheses, generate solutions, take action, evaluate outcomes. The strip shows where you are in that reasoning chain.', target: 'cjmm', gate: 'submit', gateMsg: 'Answer this question and submit to move through the case.' },
  { title: 'Working the case', body: 'The rest of the case behaves exactly the same way. Answer this one and the tutorial will step you toward the last question of the case.', gotoKey: 'case_analyse', target: 'answerarea', gate: 'submit', gateMsg: 'Answer and submit to continue.' },
  { title: 'The end of a case', body: 'The final step asks whether what you did worked. The counter pill at the top of the chart tracks how many of the six you have answered.', gotoKey: 'case_evaluate', target: 'answerarea', gate: 'submit', gateMsg: 'Answer and submit to continue.' },
  { title: 'Trend items', body: 'A trend gives you one dataset over time. Unlike a case there is no progressive disclosure — everything is visible from the start, and the answer lives in the direction of travel, not in any single value.', gotoKey: 'trend_neuro', target: 'trendpanel' },
  { title: 'Reading a trend', body: 'Read across the row for change over time and down the column for the picture at one moment. Then answer.', target: 'answerarea', gate: 'submit', gateMsg: 'Answer and submit to continue.' },

  // ── Close ────────────────────────────────────────────────────────
  { title: 'One last thing: modes', body: 'This tutorial behaves like untimed learning — rationale after every submit, free navigation. A test-style sitting saves your answers as drafts and holds all rationales until you finish. A sequential or adaptive sitting submits you forward one question at a time with no way back. The screen is identical; only the footer message and the buttons change.', target: 'footer' },
  { title: 'That is the whole exam interface', body: 'Nothing you did here was recorded. When you start a real sitting the tutorial badge disappears and everything else stays exactly as you have just seen it.', done: true },
];

// Jump-to-section index (Slice 2c). `start` is the COACH_STEPS index the
// section opens on. `sub: true` entries are the individual question types,
// shown indented under "Question types" so a returning student can drop
// straight onto the shape they came to practise. Indices are recomputed
// against our 31-step array (CD's numbering shifted by the dropped Mark step).
export interface CoachSection {
  label: string;
  start: number;
  sub?:  boolean;
}

export const COACH_SECTIONS: CoachSection[] = [
  { label: 'Welcome',                     start: 0 },
  { label: 'The exam screen',             start: 1 },
  { label: 'Calculator',                  start: 6 },
  { label: 'Question grid',               start: 7 },
  { label: 'The footer',                  start: 10 },
  { label: 'Question types',              start: 11 },
  { label: 'Multiple choice',             start: 11, sub: true },
  { label: 'True / false',                start: 12, sub: true },
  { label: 'Select all that apply',       start: 13, sub: true },
  { label: 'Select N',                    start: 14, sub: true },
  { label: 'Matrix',                      start: 15, sub: true },
  { label: 'Matrix — multiple response',  start: 16, sub: true },
  { label: 'Highlight',                   start: 17, sub: true },
  { label: 'Cloze',                       start: 18, sub: true },
  { label: 'Drag-and-drop cloze',         start: 19, sub: true },
  { label: 'Drag to order',               start: 20, sub: true },
  { label: 'Bow-tie',                     start: 21, sub: true },
  { label: 'Case studies',                start: 22 },
  { label: 'Trend items',                 start: 27 },
  { label: 'Modes & finish',              start: 29 },
];

// Closing recap (shown on the final step). Static content lifted from the
// CD blueprint's RECAP array, with the Mark row folded into the topbar line
// unchanged (Mark is described but not gated).
export const COACH_RECAP: { k: string; v: string }[] = [
  { k: 'Topbar',        v: 'counter, clock and hide toggle, calculator, grid toggle' },
  { k: 'Question grid', v: 'jump, filter by marked / unanswered / wrong, colour legend' },
  { k: 'Item types',    v: 'MCQ, true-false, SATA, select N, matrix, matrix multi-response, highlight, cloze, drag cloze, ordering, bow-tie' },
  { k: 'Case studies',  v: 'six linked questions, chart tabs that unfold, the six clinical-judgment steps' },
  { k: 'Trend items',   v: 'one dataset over time, fully visible from the start' },
  { k: 'Modes',         v: 'untimed learning, batched test, sequential and adaptive' },
];
