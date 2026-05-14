-- =========================================================
-- MyNclex — Slice 10.7: Activity window (due + close dates)
-- File: mynclex/db/migrations/20260515160000_slice_10_7_activity_window.sql
-- =========================================================
-- Adds two optional per-activity dates to the cohort checklist,
-- completing the activity "window" alongside the existing
-- release_date:
--
--   release_date  — when the activity opens (NOT NULL, trigger-seeded)
--   due_date      — soft target: "do this by" (nullable, tutor-set)
--   close_date    — hard gate: unopenable after this (nullable, tutor-set)
--
-- Decisions (slice 10.7 planning conversation, 2026-05-15):
--   • Both new columns nullable, no default — the tutor sets them
--     at their discretion, per activity. Most activities (readings,
--     PDFs) have neither; quizzes are the typical close_date case.
--   • The cohort-creation trigger is NOT changed — it seeds only
--     release_date; due/close stay null until a tutor sets them.
--   • Ordering (release <= due <= close, where set) is validated in
--     the server actions, NOT as a DB CHECK — a CHECK would block a
--     tutor moving release_date past an existing due/close date.
--     App-layer validation gives a clean error and matches the
--     cohort checklist's existing save-safety pattern.
--   • due_date is SOFT — it does not gate access; the activity
--     stays open ("Due <date>", overdue tint). close_date is the
--     hard gate (the student-side activity locks: "Closed <date>").
--   • No backfill: null is the correct default for existing rows.
--   • No RLS change: the table's existing policies (9.3f ownership
--     chain + 10.1 student-select) already cover all columns.

ALTER TABLE nclex_cohort_checklist_items
  ADD COLUMN due_date   DATE,
  ADD COLUMN close_date DATE;
