# Pitch seed — the demo accounts

Everything a prospective tutor sees when they log in and explore. **Dev
only.** These are seeds, not migrations: they live under `db/seed/`, and
`migrate-prod.yml` only reads `db/migrations/`, so nothing here can reach
prod by itself.

Two logins, one per side of the platform.

## The tutor — Steven Harris

| | |
|---|---|
| Login | `mybackpacc+steven@gmail.com` |
| Password | `StevenHarris2026!` |
| Name | Steven Harris — *NCLEX ProSolutions* |

Owns every programme, note, quiz and question in the demo. This is the
account a prospect is handed.

Its password is deliberately not a secret — it goes to strangers by
design. Change it in the UI whenever you like; nothing depends on the
value except a re-run of `06`.

Its email stays on an alias Sam controls rather than an unroutable
address, so password reset works **and** the account actually receives
the enquiry and waitlist notifications the entry-path programmes exist
to demonstrate.

## The student — Miss Claudia Harris

| | |
|---|---|
| Login | `mybackpacc+claudia@gmail.com` |
| Password | unchanged — Sam's existing one for this account |
| Name | Miss Claudia Harris |
| Roles | `STUDENT` only |

Steven briefly stood on both sides via the role switcher. It worked, but
the tutor then appeared in his own Students roster and every screen had
to be qualified — "am I seeing this as the tutor or the student?".
Separate logins are simply easier to show.

Claudia being STUDENT-only also matters: the dual-role listing bug fixed
in `lib/programmes/student-actions.ts` only affects accounts that are
also tutors, so she behaves correctly on dev even before that fix
merges.

She is deliberately the weaker of the two enrolled students — 66% across
three weeks, two of four sessions missed, on the four-instalment plan —
so the tutor screens have someone worth chasing rather than a roster of
high achievers.

## Restoring the demo between pitches

The account is shared and mutable — a prospect can edit or delete demo
content. That is survivable because every file here is idempotent. Run
them in order against dev to reset to a known state:

```
01-flagship-programme.sql    tutor-led, 8 weeks, 2 cohorts, live sessions
02-library-notes.sql         27 library notes
03-crash-course.sql          self-paced, 5 modules, 43 questions, 6 quizzes
04-entry-paths.sql           the enrol / waitlist / enquiry programmes
05-demo-students.sql         18 students + enrolments, results, attendance
06-demo-tutor.sql            the Steven Harris tutor identity
07-demo-student.sql          the Miss Claudia Harris student login
```

Re-running is safe at any time: every statement is an upsert or an
update, and dates that would otherwise rot are rebased on `CURRENT_DATE`.

Two of them are generated — edit the generator, not the `.sql`:

```
python3 db/seed/pitch/build_notes.py         # -> 02
python3 db/seed/pitch/build_crash_course.py  # -> 03
```

## Removing the seeded students

Every seeded student carries `signup_source = 'SEED_DEMO'`. One predicate
takes the whole set out; enrolments, attempts, answers, progress and
attendance all cascade:

```sql
DELETE FROM auth.users WHERE id IN (
  SELECT id FROM nclex_users WHERE signup_source = 'SEED_DEMO'
);
```

They use `@example.com`, reserved by RFC 2606 and therefore unroutable,
and none has a password — the seeded students cannot be logged into.
Steven Harris is the only demo login.

## Known gap

`nclex_config.item_stats_enabled` is `'false'` on dev, so
`nclex_refresh_item_response_stats()` writes nothing and the "how
everyone else answered" strip stays empty even though the answers are
there to aggregate. Flip that row to `'true'` and re-run the refresh if
you want it in the pitch — it changes student-facing behaviour for
everyone on dev, so it is a deliberate call, not a seed concern.
