#!/usr/bin/env python3
"""Independent validator for the gap-fill authoring SQL.

Parses the INSERT statements without executing them, and checks every
constraint the database will enforce plus the ones it will not.
"""
import json, re, sys, glob, os, collections

SUBJECTS = {'Fundamentals of Nursing','Medical-Surgical','Maternity','Pediatrics',
            'Mental Health','Pharmacology','Community Health','Leadership and Management'}
BODY = {'Cardiovascular','Respiratory','Gastrointestinal','Genitourinary','Musculoskeletal',
        'Neurological','Endocrine','Hematologic','Immune','Integumentary','Reproductive',
        'Sensory','Psychiatric/Mental Health','Multisystem','Not applicable'}
DIFF = {'Very easy','Easy','Medium','Hard','Very hard'}
BLOOM = {'Remember','Understand','Apply','Analyze','Evaluate','Create'}
QTYPE = {'MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR','HIGHLIGHT','CLOZE',
         'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'}
PAIRS = {
 'Safe and Effective Care Environment': {'Management of Care','Safety and Infection Control'},
 'Health Promotion and Maintenance': {'Health Promotion and Maintenance'},
 'Psychosocial Integrity': {'Psychosocial Integrity'},
 'Physiological Integrity': {'Basic Care and Comfort','Pharmacological and Parenteral Therapies',
                             'Reduction of Risk Potential','Physiological Adaptation'},
}
COLS = ['item_id','question_type','stem','rationale','content','correct',
        'client_needs_category','client_needs_subcategory','nursing_subject','body_system',
        'topic','subtopic','difficulty','difficulty_source','bloom_level','tags',
        'instruction','marks','is_published','is_builder_visible','is_free_sample',
        'cat_pool','batch_id']

# Types whose `instruction` carries a load-bearing action cue (how many to
# pick / how to interact). MCQ and TF are excluded on purpose: their stem
# asks a single direct question.
CUE_TYPES = {'SATA','SELECT_N','MATRIX','MATRIX_MR','CLOZE','DRAG_CLOZE','DRAG_ORDER','HIGHLIGHT','BOWTIE'}


def expected_marks(qt, correct):
    """Max partial-credit score for an item — mirrors computeMarksFromKey()
    in lib/scoring/dispatch.ts. `marks` MUST equal this: the submit RPC
    raises 'score_awarded out of range [0, marks]' otherwise, which makes
    the question impossible to submit for any student who scores above it."""
    if qt in ('MCQ', 'TF'):
        return 1
    if qt == 'BOWTIE':
        return 5
    if qt in ('SATA', 'SELECT_N'):
        return len(correct.get('answers', []))
    if qt == 'HIGHLIGHT':
        return len(correct.get('correct_ids', []))
    if qt == 'MATRIX':
        return len(correct.get('cells', {}))
    if qt == 'MATRIX_MR':
        return sum(len(v) for v in correct.get('cells', {}).values())
    if qt == 'CLOZE':
        return len(correct.get('answers', {}))
    if qt in ('DRAG_CLOZE', 'DRAG_ORDER'):
        return len(correct.get('slots', {}))
    return None


def value_sections(sql):
    """Return only the substrings that follow a VALUES keyword.

    Without this the parenthesised column list in each INSERT header is
    parsed as if it were a data row.
    """
    # Anchor on the ")" that closes the column list. A bare \bVALUES\b also
    # matches the word inside stems ("lab values", "therapeutic values"),
    # which produces overlapping sections and phantom duplicate ids.
    out = []
    for m in re.finditer(r'\)\s*VALUES\b', sql, re.IGNORECASE):
        nxt = re.search(r'\bINSERT\s+INTO\b', sql[m.end():], re.IGNORECASE)
        end = m.end() + (nxt.start() if nxt else len(sql) - m.end())
        out.append(sql[m.end():end])
    return out


def split_values(sql):
    """Yield each VALUES tuple as a list of raw field strings."""
    rows, i, n = [], 0, len(sql)
    while i < n:
        if sql[i] != '(':
            i += 1
            continue
        depth, j, fields, cur, instr = 0, i, [], '', False
        while j < n:
            c = sql[j]
            if instr:
                if c == "'":
                    if j + 1 < n and sql[j+1] == "'":
                        cur += "''"; j += 2; continue
                    instr = False; cur += c; j += 1; continue
                cur += c; j += 1; continue
            if c == "'":
                instr = True; cur += c; j += 1; continue
            if c == '(':
                depth += 1
                if depth == 1:
                    j += 1; continue
            elif c == ')':
                depth -= 1
                if depth == 0:
                    fields.append(cur.strip()); break
            elif c == ',' and depth == 1:
                fields.append(cur.strip()); cur = ''; j += 1; continue
            cur += c; j += 1
        if len(fields) >= 20:
            rows.append(fields)
        i = j + 1
    return rows


def unq(f):
    f = f.strip()
    if f.endswith('::jsonb'):
        f = f[:-len('::jsonb')].strip()
    if f.startswith("'") and f.endswith("'"):
        return f[1:-1].replace("''", "'")
    return f


def check_item(row, errs, ctx):
    if len(row) != len(COLS):
        errs.append(f'{ctx}: expected {len(COLS)} columns, got {len(row)}')
        return None
    d = {c: unq(v) for c, v in zip(COLS, row)}
    iid = d['item_id']
    qt = d['question_type']
    if qt not in QTYPE:
        errs.append(f'{iid}: bad question_type {qt!r}')
    for col, allowed in (('nursing_subject', SUBJECTS), ('body_system', BODY),
                         ('difficulty', DIFF), ('bloom_level', BLOOM)):
        if d[col] not in allowed:
            errs.append(f'{iid}: bad {col} {d[col]!r}')
    cat, sub = d['client_needs_category'], d['client_needs_subcategory']
    if cat not in PAIRS:
        errs.append(f'{iid}: bad client_needs_category {cat!r}')
    elif sub not in PAIRS[cat]:
        errs.append(f'{iid}: {sub!r} is not a subcategory of {cat!r}')
    if d['difficulty_source'] != 'CURATOR_LABEL':
        errs.append(f'{iid}: difficulty_source {d["difficulty_source"]!r}')
    if d['cat_pool'].upper() != 'FALSE':
        errs.append(f'{iid}: cat_pool must be FALSE, got {d["cat_pool"]!r}')
    if d['batch_id'] != 'gapfill-20260728':
        errs.append(f'{iid}: batch_id {d["batch_id"]!r}')

    try:
        content = json.loads(d['content'])
        correct = json.loads(d['correct'])
    except Exception as e:
        errs.append(f'{iid}: JSON parse failure: {e}')
        return d

    # marks must equal the item's max partial-credit score. Unchecked in the
    # original run, which is how 312 items loaded with a flat marks=1 and
    # would have failed to submit for any student scoring above 1.
    want = expected_marks(qt, correct)
    if want is not None:
        try:
            got = int(d['marks'])
        except (TypeError, ValueError):
            got = None
        if got != want:
            errs.append(f'{iid}: marks={d["marks"]!r} but the answer key gives {want} '
                        f'- submit fails with "score_awarded out of range [0, {d["marks"]}]"')

    instr = '' if d['instruction'] == 'NULL' else (d['instruction'] or '').strip()
    if qt in CUE_TYPES and not instr:
        errs.append(f'{iid}: {qt} needs an instruction - the action cue '
                    f'(how many to pick / how to interact)')

    if qt in ('MCQ', 'TF'):
        ids = {o['id'] for o in content.get('options', [])}
        if correct.get('answer') not in ids:
            errs.append(f'{iid}: answer {correct.get("answer")!r} not in options')
        missing = ids - set(correct.get('feedback', {}))
        if missing:
            errs.append(f'{iid}: missing feedback for {sorted(missing)}')
    elif qt in ('SATA', 'SELECT_N'):
        ids = {o['id'] for o in content.get('options', [])}
        ans = correct.get('answers', [])
        bad = set(ans) - ids
        if bad:
            errs.append(f'{iid}: answers {sorted(bad)} not in options')
        if not ans:
            errs.append(f'{iid}: no answers')
        if qt == 'SELECT_N':
            sc = content.get('select_count')
            if sc != len(ans):
                errs.append(f'{iid}: select_count {sc} != {len(ans)} answers')
    elif qt in ('MATRIX', 'MATRIX_MR'):
        rids = {r['id'] for r in content.get('rows', [])}
        cids = {c['id'] for c in content.get('columns', [])}
        cells = correct.get('cells', {})
        if set(cells) != rids:
            errs.append(f'{iid}: cells cover {sorted(cells)} but rows are {sorted(rids)}')
        for r, v in cells.items():
            vals = v if isinstance(v, list) else [v]
            if not vals:
                errs.append(f'{iid}: row {r} has no selection')
            bad = set(vals) - cids
            if bad:
                errs.append(f'{iid}: row {r} references unknown columns {sorted(bad)}')
            if qt == 'MATRIX' and isinstance(v, list):
                errs.append(f'{iid}: MATRIX row {r} must be a single string, not a list')
    elif qt == 'CLOZE':
        bl = {b['id']: {c['id'] for c in b.get('choices', [])} for b in content.get('blanks', [])}
        ans = correct.get('answers', {})
        if set(ans) != set(bl):
            errs.append(f'{iid}: cloze answers {sorted(ans)} vs blanks {sorted(bl)}')
        for b, c in ans.items():
            if b in bl and c not in bl[b]:
                errs.append(f'{iid}: blank {b} answer {c!r} not among its choices')
        for m in range(1, len(bl) + 1):
            if '{%d}' % m not in d['stem']:
                errs.append(f'{iid}: stem missing marker {{{m}}}')
    elif qt == 'DRAG_ORDER':
        sids = {s['id'] for s in content.get('slots', [])}
        tids = {t['id'] for t in content.get('tokens', [])}
        slots = correct.get('slots', {})
        if set(slots) != sids:
            errs.append(f'{iid}: slot answers {sorted(slots)} vs slots {sorted(sids)}')
        bad = set(slots.values()) - tids
        if bad:
            errs.append(f'{iid}: unknown tokens {sorted(bad)}')
        if len(set(slots.values())) != len(slots):
            errs.append(f'{iid}: a token is used in more than one slot')
    return d


def main():
    files = sorted(glob.glob(os.path.join(sys.argv[1], 'gap-*.sql')))
    grand, all_ids, errs = 0, {}, []
    print(f'{"file":<38}{"items":>6}  {"status"}')
    print('-' * 72)
    for f in files:
        sql = open(f, encoding='utf-8').read()
        rows = [r for sec in value_sections(sql) for r in split_values(sec)]
        ferrs = []
        for r in rows:
            d = check_item(r, ferrs, os.path.basename(f))
            if d:
                iid = d['item_id']
                if iid in all_ids:
                    ferrs.append(f'{iid}: duplicate id (also in {all_ids[iid]})')
                all_ids[iid] = os.path.basename(f)
        if sql.count('INSERT INTO') == 0:
            ferrs.append('no INSERT statements found')
        grand += len(rows)
        status = 'OK' if not ferrs else f'{len(ferrs)} ERROR(S)'
        print(f'{os.path.basename(f):<38}{len(rows):>6}  {status}')
        errs.extend(ferrs)
    print('-' * 72)
    print(f'{"TOTAL":<38}{grand:>6}')
    if errs:
        print(f'\n{len(errs)} error(s):')
        for e in errs[:60]:
            print('  -', e)
        if len(errs) > 60:
            print(f'  ... and {len(errs)-60} more')
        return 1
    print('\nAll checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
