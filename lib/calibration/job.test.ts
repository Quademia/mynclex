// mynclex/lib/calibration/job.test.ts
//
// The job is mostly I/O and is proved by running it. The one piece of
// judgement it carries is turning a stored answer into a response the model
// can use — where a wrong call silently distorts every difficulty the item
// touches — so that part is pure and tested here.

import { describe, it, expect } from 'vitest';
import { toCalibrationResponse } from './job';

const row = (over: Record<string, unknown> = {}) => ({
  student_id: 'stu-1',
  score_awarded: 3,
  nclex_attempt_items: {
    item_id: 'NCLEX_SATA_00001',
    marks_snapshot: 5,
    parent_case_id: null,
  },
  ...over,
});

describe('toCalibrationResponse', () => {
  it('reads a partial answer as a fraction (§4.5)', () => {
    // 3 of 5 is 0.6, not "wrong". This is the whole of Option 2.
    expect(toCalibrationResponse(row())).toEqual({
      studentId: 'stu-1',
      itemId: 'NCLEX_SATA_00001',
      score: 0.6,
      weight: 1,
    });
  });

  it('reads a plain right/wrong item as 1 or 0', () => {
    const right = toCalibrationResponse(
      row({ score_awarded: 1, nclex_attempt_items: { item_id: 'M', marks_snapshot: 1, parent_case_id: null } }),
    );
    const wrong = toCalibrationResponse(
      row({ score_awarded: 0, nclex_attempt_items: { item_id: 'M', marks_snapshot: 1, parent_case_id: null } }),
    );
    expect(right?.score).toBe(1);
    expect(wrong?.score).toBe(0);
  });

  it('halves the weight of a case child (§7.4)', () => {
    const r = toCalibrationResponse(
      row({
        nclex_attempt_items: { item_id: 'C1', marks_snapshot: 4, parent_case_id: 'NCLEX_CS_00001' },
      }),
    );
    expect(r?.weight).toBe(0.5);
  });

  it('drops an answer whose mark total is missing or zero', () => {
    // score/0 is not 0, it is undefined. Scoring it as a failure would invent
    // evidence and push the item's difficulty up for nobody's reason.
    for (const marks of [0, null]) {
      const r = toCalibrationResponse(
        row({ nclex_attempt_items: { item_id: 'X', marks_snapshot: marks, parent_case_id: null } }),
      );
      expect(r).toBeNull();
    }
  });

  it('drops an answer with no score recorded', () => {
    expect(toCalibrationResponse(row({ score_awarded: null }))).toBeNull();
  });

  it('reads the joined item whether it arrives as an object or an array', () => {
    // A many-to-one embed comes back as an object, but the client types it as
    // an array when it has no generated schema to check against. Reading the
    // wrong one drops every response and leaves a green run that measured
    // nothing — indistinguishable from a bank nobody has used yet.
    const asArray = toCalibrationResponse(
      row({
        nclex_attempt_items: [{ item_id: 'A', marks_snapshot: 2, parent_case_id: null }],
      }),
    );
    expect(asArray).toMatchObject({ itemId: 'A', score: 1 });
    expect(toCalibrationResponse(row({ nclex_attempt_items: [] }))).toBeNull();
  });

  it('drops a row whose join came back empty', () => {
    expect(toCalibrationResponse(row({ nclex_attempt_items: null }))).toBeNull();
    expect(
      toCalibrationResponse(
        row({ nclex_attempt_items: { item_id: null, marks_snapshot: 5, parent_case_id: null } }),
      ),
    ).toBeNull();
  });

  it('drops an answer with no student', () => {
    expect(toCalibrationResponse(row({ student_id: null }))).toBeNull();
  });

  it('clamps a score outside its own mark total', () => {
    // A scoring bug awarding 7 of 5 would feed the model a probability above
    // 1, which it cannot represent — so it is clamped rather than trusted.
    expect(toCalibrationResponse(row({ score_awarded: 7 }))?.score).toBe(1);
    expect(toCalibrationResponse(row({ score_awarded: -2 }))?.score).toBe(0);
  });
});
