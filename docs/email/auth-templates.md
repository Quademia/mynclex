# Supabase Auth email templates

Copy for the identity emails **Supabase itself sends**, over our custom
SMTP (Resend, as Quademia `<noreply@quademia.com>`).

Last updated: 2026-08-06 — first written. Two templates branded;
see *Deliberately not branded* below for the other four and why.

Paste target: Supabase dashboard → **Authentication → Emails →
Templates**, per project. Dev first, test, then prod — see the standing
rule in [README.md](README.md).

---

## House rules for this copy

- **Text-branded only — no logo.** There isn't one yet. When there is,
  it goes in here first, hosted at a stable public URL (email clients
  cannot read anything from the app bundle).
- **Sender is Quademia, the product named in the body is MyNclex.** The
  company sends; the product is what the reader recognises. Someone who
  registered for NCLEX prep has never heard of "Quademia", so the body
  always says *your MyNclex account* somewhere in the first sentence.
  Sign-off stays **"— The Quademia team"**.
- **No external assets.** No web fonts, no images, no CSS files. All
  styling inline. Anything fetched from a remote host is blocked by
  default in most mail clients and makes the email look broken to the
  people most likely to be cautious about it.
- **Every email states what to do if it wasn't you.** These are account
  security emails; an unexpected one should never feel like a trap.
- **The raw link is always printed as text** under the button. Buttons
  fail in enough clients that a link-less email is a dead end.

### Variables

Supabase substitutes these at send time. Only these are used here:

| Variable | Is |
|---|---|
| `{{ .ConfirmationURL }}` | The action link — carries the token and the redirect |
| `{{ .Email }}` | The recipient's address |

⚠ **The stated expiry is the default, not a reading.** Both templates
say the link expires in **1 hour** — Supabase's documented default OTP
expiry (3600s), which neither project has been changed from. The
setting was **not locatable on the dashboard** on 2026-08-06 and cannot
be read from here (the MCP connection can't see auth config, the same
limit that makes the rate-limit setting unverifiable). So this is
default-backed, not verified.

**If password-reset links ever expire sooner than the email promises,
look here first** — either the copy or the setting has moved. The fix is
a one-word edit in both templates plus a re-paste to both projects.

---

## 1. Reset password

Used by the forgot-password flow. ⚠ **That flow is not built yet** — it
is build-order item 2 (`resetPasswordForEmail` appears nowhere in the
codebase today). Branding it now is deliberate: item 2 depends on it, so
the template is ready when the code lands.

**Subject**

```
Reset your MyNclex password
```

**Message body**

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 12px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:10px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="font-size:19px;font-weight:600;color:#111827;padding-bottom:14px;">
            Reset your password
          </td>
        </tr>
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#374151;padding-bottom:24px;">
            We received a request to reset the password for your MyNclex
            account, <strong>{{ .Email }}</strong>. Choose a new one here:
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:24px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:7px;">
              Set a new password
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:20px;">
            If the button doesn't work, copy this link into your browser:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#374151;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
            This link expires in 1 hour and can be used once.
            <strong>If you didn't ask for this, you can ignore this email</strong>
            — your password stays as it is.
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-top:20px;">
            — The Quademia team<br>
            <span style="color:#9ca3af;">MyNclex · NCLEX-RN preparation</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 2. Confirm signup

Sent when a self-serve `/register` signup needs its email address
proven.

⚠ **Email confirmation is currently OFF.** Branding this template
changes nothing on its own — it only decides what the email says *if*
confirmation is switched on. Turning it on is a separate, deliberate
decision (see `domain-and-identity.md:248` — the policy is to enable it
for self-serve the day delivery is reliable, which as of 2026-08-06 it
now is). Invited flows don't need it: arriving via a link sent to an
address already proves the address.

**Subject**

```
Confirm your email address
```

**Message body**

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 12px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:10px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="font-size:19px;font-weight:600;color:#111827;padding-bottom:14px;">
            Confirm your email address
          </td>
        </tr>
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#374151;padding-bottom:24px;">
            Thanks for creating a MyNclex account with
            <strong>{{ .Email }}</strong>. Confirm this address to finish
            setting up and get into your dashboard.
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:24px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:7px;">
              Confirm my email
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:20px;">
            If the button doesn't work, copy this link into your browser:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#374151;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
            This link expires in 1 hour.
            <strong>If you didn't create a MyNclex account, ignore this email</strong>
            — nothing will be set up.
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-top:20px;">
            — The Quademia team<br>
            <span style="color:#9ca3af;">MyNclex · NCLEX-RN preparation</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## Deliberately not branded

| Template | Why not |
|---|---|
| **Invite** | Going custom. An invite always arrives attached to something — a programme, bank access — so the email worth sending is the one that says *what you've been given*, not *you have an account*. Branding the generic body is work we'd delete. Replaced in the transactional arc by `enrolment.confirmed` / `enrolment.tutor_added`, minted with `generateLink({ type: 'invite' })` so our layer sends the only email. Until then it keeps sending Supabase's default body — already **from** Quademia since the 2026-08-06 SMTP switch, so it reads unstyled rather than untrustworthy. |
| **Magic link** | Build-order item 3 rewrites it as a code-only email in code. Branding the link version now is thrown-away work. |
| **Change email** | Unreachable — nothing in the codebase calls `updateUser({ email })`. Brand it the day a change-email surface exists. |
| **Reauthentication** | Unused. |
