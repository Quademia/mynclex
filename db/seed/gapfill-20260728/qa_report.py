#!/usr/bin/env python3
"""Cross-batch QA the individual authoring agents cannot do for themselves:
answer-key positional bias, and near-duplicate stems ACROSS files.
"""
import json, re, sys, glob, os, collections, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate import value_sections, split_values, unq, COLS

STOP = set('a an the is are was were be been being of to in on at for with and or '
           'nurse client should which what when who how would nursing care '
           'following that this these those has have had by from as it its '
           'most best first priority action take takes taking assess assessment'.split())


def tokens(s):
    return {w for w in re.findall(r'[a-z]{4,}', s.lower()) if w not in STOP}


def main():
    d = sys.argv[1]
    items = []
    for f in sorted(glob.glob(os.path.join(d, 'gap-*.sql'))):
        sql = open(f, encoding='utf-8').read()
        for r in (r for sec in value_sections(sql) for r in split_values(sec)):
            if len(r) != len(COLS):
                continue
            rec = {c: unq(v) for c, v in zip(COLS, r)}
            rec['_file'] = os.path.basename(f)
            items.append(rec)

    print(f'{len(items)} items across {len(set(i["_file"] for i in items))} files\n')

    # --- answer-key positional bias (MCQ only; TF is legitimately 2-way) ---
    print('=== MCQ answer-key distribution ===')
    print(f'{"file":<38}{"A":>4}{"B":>4}{"C":>4}{"D":>4}   flag')
    overall = collections.Counter()
    for f in sorted(set(i['_file'] for i in items)):
        c = collections.Counter()
        for i in items:
            if i['_file'] == f and i['question_type'] == 'MCQ':
                try:
                    c[json.loads(i['correct'])['answer']] += 1
                except Exception:
                    pass
        if not c:
            continue
        overall.update(c)
        n = sum(c.values())
        worst = max(c.values()) / n if n else 0
        missing = [x for x in 'ABCD' if not c[x]]
        flag = ''
        if worst > 0.45:
            flag = f'SKEW {worst:.0%}'
        if missing and n >= 8:
            flag = (flag + ' ' if flag else '') + 'missing ' + ','.join(missing)
        print(f'{f:<38}{c["A"]:>4}{c["B"]:>4}{c["C"]:>4}{c["D"]:>4}   {flag}')
    n = sum(overall.values())
    print(f'{"ALL":<38}{overall["A"]:>4}{overall["B"]:>4}{overall["C"]:>4}{overall["D"]:>4}'
          f'   ({overall["A"]/n:.0%}/{overall["B"]/n:.0%}/{overall["C"]/n:.0%}/{overall["D"]/n:.0%})')

    # --- SATA answer-count spread (guards against "always pick 3") ---
    sata = collections.Counter()
    for i in items:
        if i['question_type'] == 'SATA':
            try:
                sata[len(json.loads(i['correct'])['answers'])] += 1
            except Exception:
                pass
    print('\n=== SATA correct-answer counts ===')
    print('  ' + ', '.join(f'{k} correct: {v}' for k, v in sorted(sata.items())))

    # --- cross-file near-duplicate stems ---
    print('\n=== Near-duplicate stems (Jaccard >= 0.55) ===')
    toks = [(i, tokens(i['stem'])) for i in items]
    hits = []
    for (a, ta), (b, tb) in itertools.combinations(toks, 2):
        if len(ta) < 6 or len(tb) < 6:
            continue
        j = len(ta & tb) / len(ta | tb)
        if j >= 0.55:
            hits.append((j, a, b))
    hits.sort(reverse=True, key=lambda x: x[0])
    if not hits:
        print('  none')
    for j, a, b in hits[:25]:
        same = 'SAME FILE' if a['_file'] == b['_file'] else 'CROSS-FILE'
        print(f'  {j:.2f} {same}  {a["item_id"]} / {b["item_id"]}')
        print(f'        {a["stem"][:100]}')
        print(f'        {b["stem"][:100]}')
    if len(hits) > 25:
        print(f'  ... and {len(hits)-25} more')

    # --- topic concentration ---
    print('\n=== Most-repeated topics ===')
    for t, c in collections.Counter(i['topic'] for i in items).most_common(12):
        print(f'  {c:>3}  {t}')


if __name__ == '__main__':
    main()
