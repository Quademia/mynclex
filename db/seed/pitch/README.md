# Pitch seed — the demo tutor account

Everything a prospective tutor sees when they log in and explore. **Dev
only.** These are seeds, not migrations: they live under `db/seed/`, and
`migrate-prod.yml` only reads `db/migrations/`, so nothing here can reach
prod by itself.

## The account

| | |
|---|---|
| Login | `mybackpacc+steven@gmail.com` |
| Password | `StevenHarris2026!` |
| Name | Steven Harris — *NCLEX ProSolutions* |
| Roles | `TUTOR` + `STUDENT` |

One login, both sides. The account carries both roles, so the in-app
switcher moves between the tutor workspace and the student view without
signing out — which is the point: a prospect can build a programme and
then see what their students see, in one session.

The password is deliberately not a secret; it is handed to strangers by
design. Change it in the UI whenever you like — nothing here depends on
the value except a re-run of `06`.

The email stays on an alias Sam controls rather than an unroutable
address, so password reset works **and** the account actually receives
the enquiry and waitlist notifications the entry-path programmes exist to
demonstrate.

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
06-demo-tutor.sql            the Steven Harris identity + his student side
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
