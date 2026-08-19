# Supabase Auth email templates

Copy for the identity emails **Supabase itself sends**, over our custom
SMTP (Resend, as Quademia `<noreply@quademia.com>`).

Last updated: 2026-08-09 — magic link rewritten **code-only** for slice 3
(template 3). Three templates branded; see *Deliberately not branded*
below for the other three and why.

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
| `{{ .Token }}` | The 6-digit code. **Putting this in a template is what turns that email from a link into a code** — see template 3 |

⚠ **The stated expiry is the default, not a reading.** All three templates
say **1 hour** — Supabase's documented default OTP expiry (3600s), which
neither project has been changed from. The setting was **not locatable on
the dashboard** on 2026-08-06 and cannot be read from here (the MCP
connection can't see auth config, the same limit that makes the
rate-limit setting unverifiable). So this is default-backed, not verified.

**If password-reset links ever expire sooner than the email promises,
look here first** — either the copy or the setting has moved. The fix is
a one-word edit in the templates plus a re-paste to both projects.

⚠⚠ **THERE IS ONE EXPIRY DIAL, AND IT MOVES ALL THREE OF THESE AT ONCE.**
`Auth → Providers → Email → Email OTP Expiration` governs every email
token this project issues — the login code, the signup confirmation, and
**the password-reset link**. Slice 3 planned to shorten it to 10 minutes
for the login code; that would have cut the reset link to 10 minutes too,
while template 1 went on promising an hour. **Left at 1 hour on purpose**
(2026-08-09). Two reasons:

- The flow that suffers is the one that matters most — a student on slow
  mobile email, locked out, waiting for a reset link. Ten minutes is a
  cruel window for exactly the person the reset flow exists for.
- **The expiry is not what guards the code; the threshold is.** With
  slice 3's rule of 5 wrong codes per 10 minutes per address, an attacker
  gets around 30 guesses an hour against a million combinations. Halving
  or sextupling the validity barely moves that. The earlier claim that a
  short expiry "does more against guessing than any rule we write" was
  true before the rule existed and stopped being true the moment it did.

**Do not shorten this dial for one template's benefit.** If a shorter code
life is ever genuinely wanted, it needs the reset and confirm copy changed
in the same pass, or the emails start lying.

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

## 3. Sign-in code (the "Magic Link" template)

Slice 3's email-code login. ⚠ **Pasted into the template Supabase calls
"Magic Link"** — that is not a mistake. Supabase implements magic links
and email codes as *one thing*, and the template is the only switch
between them: include `{{ .Token }}` and it sends a code, include
`{{ .ConfirmationURL }}` and it sends a link. **This template deliberately
contains no link at all**, which is what takes magic link off the menu.

**Why the link had to go** (settled 2026-08-05, and Supabase's own
troubleshooting guide agrees): one-time links get consumed by email
security scanners that "click" them before the student does, so the token
is spent by the time she taps it; and a link opened from Gmail or WhatsApp
lands in an in-app browser she doesn't otherwise use, so the session
appears in the wrong place and reads as *"the link didn't work"*. A typed
code makes both failure modes structurally impossible — she stays in the
browser she started in, and nothing can consume a code by looking at it.

**Subject**

```
Your MyNclex sign-in code
```

**Message body**

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 12px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:10px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="font-size:19px;font-weight:600;color:#111827;padding-bottom:14px;">
            Your sign-in code
          </td>
        </tr>
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#374151;padding-bottom:20px;">
            Your MyNclex sign-in code is:
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:22px;">
            <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:16px 28px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">{{ .Token }}</div>
          </td>
        </tr>
        <tr>
          <td style="font-size:15px;line-height:1.6;color:#374151;padding-bottom:24px;">
            Enter it on the sign-in page you already have open, for
            <strong>{{ .Email }}</strong>.
          </td>
        </tr>
        <tr>
          <td style="font-size:13px;line-height:1.6;color:#6b7280;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
            This code expires in 1 hour and can be used once.
            <strong>If you didn't try to sign in, you can ignore this email</strong>
            — a code on its own doesn't let anyone in, and your account is
            unchanged.
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

**Four choices in that markup worth keeping**

- **The code sits high in the body, right after one short line.** Phone
  notification previews show the first stretch of an email, so she often
  never has to open it. For a phone-first audience switching apps to read
  this, that is the difference between two taps and six.
- **"Your MyNclex sign-in code is:" immediately precedes the number.**
  iOS and Android detect one-time codes by looking for a number next to
  words like *code*, and offer it as an autofill suggestion. The wording
  is load-bearing, not decorative — it pairs with the `autocomplete`
  attribute on the input in slice 3e.
- **The code is not inside a link.** Some clients auto-linkify anything
  that looks tappable; a linkified code is one a security scanner might
  follow, which is the exact failure this template exists to avoid.
- **Monospace with wide letter-spacing.** She is copying six digits off a
  small screen, and `0`/`O` and `1`/`l` have to be unmistakable.

⚠ **The house rule "the raw link is always printed as text" does not
apply here.** There is no link to print. That rule exists so a broken
button isn't a dead end; this email has no button and no dead end.

---

## Deliberately not branded

| Template | Why not |
|---|---|
| **Invite** | Gone custom — ✅ **fully replaced as of 2026-08-19.** An invite always arrives attached to something, so the email worth sending is the one that says *what you've been given*, not *you have an account*. ✅ **Tutor-add (2026-08-12)**: `lib/enrolments/actions.ts` calls `generateLink({ type: 'invite' })`, Supabase sends nothing, and `enrolment.tutor_added` / `waitlist.converted` carry the link. ✅ **Pay-first (2026-08-19)**: `lib/payments/activate.ts` does the same, and `payment.received` carries the link in its previously-empty CTA slot — closing the two-emails-for-one-action window that had been open since the receipt shipped on 08-11. **There is no remaining `inviteUserByEmail` in the repo.** ⚠ **Do not disable this template until the pay-first swap is on prod** — `main` has it, `prod` does not, so on prod it is still the only way in for a guest who pays. Once released, turning it off is the last act of the arc. ⓘ To check an environment without guessing: `auth.users.confirmation_sent_at` is stamped only when Supabase actually sends, so **null on a freshly invited account means the swap is live** there. |
| ~~**Magic link**~~ | **Done — it is now template 3 above.** The 2026-08-06 note said item 3 would rewrite it code-only and that branding the link version first was work we'd delete; that is what happened on 2026-08-09. Kept here struck through rather than removed, so anyone following the old note lands on the answer. |
| **Change email** | Unreachable — nothing in the codebase calls `updateUser({ email })`. Brand it the day a change-email surface exists. |
| **Reauthentication** | Unused. |
