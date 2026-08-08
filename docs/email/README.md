# Product email copy

Canonical text for **every email MyNclex sends**. Created 2026-08-06.

This folder is not a plan — the plans live in
[`../product-plan/transactional-email.md`](../product-plan/transactional-email.md)
(the trigger registry: *what* should send and *when*) and
[`../product-plan/domain-and-identity.md`](../product-plan/domain-and-identity.md)
(the sending infrastructure). This folder is the **copy itself**.

## The standing rule

**The repo is the source. A dashboard is a copy.**

Auth email templates live in the Supabase dashboard, and the dashboard is
the only place they actually execute — which makes it very easy for the
real wording to drift somewhere nobody can review, diff, or recover. So:

1. Change the copy **here** first.
2. Paste into Supabase **dev**, send yourself a real one, read it.
3. Paste into Supabase **prod**.
4. Commit.

Never the other way round. If you find the dashboard and the repo
disagree, the dashboard is the thing that's wrong — but check *why*
before overwriting it, because a dashboard edit means someone changed
copy under pressure and the reason is worth keeping.

## What's here

| File | Covers |
|---|---|
| [`auth-templates.md`](auth-templates.md) | Supabase Auth identity emails — the ones Supabase itself sends |

## What will be here later

When the transactional email arc is built (build order item 6 in
`domain-and-identity.md`), the app's own emails — enrolment, payments,
live sessions, enquiries — get their copy here too, sent through the
Resend worker rather than by Supabase.

That arc is also where the **invite** email gets fixed. Today an invited
student receives Supabase's generic "confirm your account" body, because
an invite is currently created with `inviteUserByEmail`, which sends as a
side effect. It is deliberately left unbranded: an invite is never just
an invite — it always arrives attached to a programme or to bank access,
so the useful email is the one that says *what you've been given*, not
the one that says *you have an account*. Replacing it means minting the
same link with `generateLink({ type: 'invite' })` (which sends nothing)
and letting our own layer send one email carrying both the context and
the set-password link.
