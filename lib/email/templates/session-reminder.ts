// mynclex/lib/email/templates/session-reminder.ts
//
// "Your class is on Tuesday" — with the class in her calendar.
//
// ⭐⭐ THE FIRST FAN-OUT EMAIL. Every other template has exactly one
// recipient; this one is written once and read by a whole cohort. That
// changes what the copy may assume: nothing here can be about HER
// specifically, because the same words go to twenty-five people whose
// only shared fact is the class.
//
// ⭐ It is also the first to carry an attachment. The .ics is not a
// decoration — it is the reason this design beats sending more email. She
// taps once, her own phone takes over, and no T-1h reminder ever has to
// exist. See lib/email/ics.ts for why, and transactional-email.md →
// Live sessions for the four design revisions that led here.
//
// ⚠ WHAT THIS EMAIL MUST NOT DO: promise a second one. There is exactly
// one reminder per class occurrence from the nightly pass, plus at most
// one deliberate send from the tutor. Anything that says "we'll remind
// you again nearer the time" would be a promise nothing keeps — the trap
// that put an approval email in the catalog a week after its receipt had
// started announcing it.

import type { EmailTemplate, SessionReminderPayload } from '../types';
import { sessionIcsAttachment } from '../ics';
import { BRAND, esc, factRow, button } from './wrapper';

// ─────────────────────────────────────────────────────────────────────
// Time, which is the whole subject of this email and easy to get wrong
// ─────────────────────────────────────────────────────────────────────
// ⚠ EVERY TIME PRINTED HERE IS GMT, AND SAYS SO. `scheduled_at` is a
// timestamptz — an instant, with no opinion about whose clock reads it.
// "Tuesday 19:00" with no zone is simply wrong for the reader in London
// or Toronto, and our audience is nurses migrating precisely there.
//
// ⭐ Ghana is UTC+0 all year (no daylight saving), so for the core
// audience GMT *is* their wall clock and the label costs them nothing.
// For everyone else the label is the difference between arriving and
// missing it — and the .ics carries the true instant, so her phone shows
// her own local time without us having to guess at it.

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

// ⚠ THE COLUMN STORES AN ENUM, NOT A WORD. `platform` arrives as 'ZOOM' /
// 'GOOGLE_MEET' / 'MS_TEAMS', so printing it raw would tell a nurse her
// class is on "GOOGLE_MEET". Caught by reading a real enqueued payload, not
// the code — the sample fixture had been written with a human label already
// in it, which is exactly how a fixture hides the thing it is meant to test.
//
// ⓘ Same map as the tutor planner's (cohort-sessions-client.tsx). Copied
// rather than shared: this file must render from the frozen payload alone,
// and an unknown value falls through to itself so a new platform reads
// oddly rather than vanishing.
const PLATFORM_LABEL: Record<string, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Online',
};

function formatDuration(mins: number | null): string | null {
  if (!mins || mins <= 0) return null;
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = `${h} hour${h === 1 ? '' : 's'}`;
  return m ? `${hours} ${m} min` : hours;
}

// ─────────────────────────────────────────────────────────────────────

function subject(p: SessionReminderPayload): string {
  // ⚠ NO TUTOR-TYPED TITLE IN HERE AT ALL, and that is measured rather than
  // squeamish. The first draft was "Your <programme> class is on Tuesday 25
  // August at 19:00 GMT" — **84 characters** with a real dev programme name,
  // which puts the time, the only fact she needs, past where a phone
  // truncates. The instalment subject fought the same fight and won it by
  // cutting 82 to 57.
  //
  // ⭐ Dropping the title fixes a second thing for free. Programme names here
  // already carry their own em-dashes ("NCLEX-RN Live — The 8-Week Pass
  // Plan"), so any sentence built around one is one bad interpolation away
  // from the double-dash defect that needed three fixes on 2026-08-19 — one
  // of them already live on prod. A subject with nothing interpolated cannot
  // acquire it.
  //
  // ⓘ The cost, stated so it is a choice: a student enrolled in TWO
  // programmes with classes on the same day cannot tell them apart from the
  // subject line. The body's first fact is the class name, and the calendar
  // entry carries it too.
  return `Your class is on ${formatDay(p.scheduledAtISO)} at ${formatTime(p.scheduledAtISO)} GMT`;
}

function body(p: SessionReminderPayload): string {
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName)},` : 'Hi,';
  const day = formatDay(p.scheduledAtISO);
  const time = formatTime(p.scheduledAtISO);
  const duration = formatDuration(p.durationMinutes);

  // Dial: who is speaking. The nightly pass is the product being helpful;
  // a tutor pressing send is a person with something to say, and the two
  // should not read identically or the deliberate one loses its weight.
  const lede =
    p.trigger === 'MANUAL'
      ? `${esc(p.tutorName)} has sent a reminder about your next live class.`
      : `A quick reminder that your next live class with ${esc(p.tutorName)} is coming up.`;

  const facts = [
    factRow('Class', esc(p.sessionTitle)),
    factRow('When', `${esc(day)} at ${esc(time)} GMT`),
    duration ? factRow('Lasts', esc(duration)) : '',
    p.cohortName ? factRow('Cohort', esc(p.cohortName)) : '',
    p.platform ? factRow('Where', esc(PLATFORM_LABEL[p.platform] ?? p.platform)) : '',
    p.meetingId ? factRow('Meeting ID', esc(p.meetingId)) : '',
    p.passcode ? factRow('Passcode', esc(p.passcode)) : '',
  ].join('');

  return `
    <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${greeting}</p>
    <p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;
              line-height:1.6;color:${BRAND.ink};">${lede}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${BRAND.line};border-radius:6px;padding:16px;background:#fbfcfd;">
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${facts}
        </table>
      </td></tr>
    </table>

    ${p.joinUrl ? button(p.joinUrl, 'Join the class') : ''}

    ${
      p.joiningInstructions
        ? `<p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;
                     line-height:1.6;color:${BRAND.ink};">${esc(p.joiningInstructions)}</p>`
        : ''
    }

    <p style="margin:20px 0 0;padding:12px 14px;background:${BRAND.bg};
              border-left:3px solid ${BRAND.accent};border-radius:4px;
              font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;
              color:${BRAND.ink};">
      There is a calendar file attached to this email. Open it once and the
      class goes into your own calendar, so your phone reminds you nearer
      the time — and it updates itself if your tutor moves the class.
    </p>

    ${
      p.joinUrl
        ? ''
        : `<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;
                     line-height:1.6;color:${BRAND.muted};">
             Your tutor has not added a joining link yet. It will be on your
             cohort's Sessions page as soon as they do.
           </p>`
    }

    <p style="margin:20px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;
              line-height:1.6;color:${BRAND.muted};">
      Times are GMT.
    </p>`;
}

// ⭐ Built from the payload at render time, not stored. A reschedule
// re-renders with a higher SEQUENCE and the same UID, which is what makes
// the entry in her calendar move rather than duplicate.
function attachments(p: SessionReminderPayload) {
  const descriptionParts = [
    p.sessionTitle,
    p.cohortName ? `${p.programmeTitle} · ${p.cohortName}` : p.programmeTitle,
    `With ${p.tutorName}`,
    p.meetingId ? `Meeting ID: ${p.meetingId}` : null,
    p.passcode ? `Passcode: ${p.passcode}` : null,
    p.joiningInstructions,
    p.joinUrl,
  ].filter(Boolean);

  return [
    sessionIcsAttachment({
      uid: p.sessionId,
      sequence: p.sequence,
      startISO: p.scheduledAtISO,
      // A class with no stated length still needs an end time, or the
      // event is zero-length and some calendars hide it entirely.
      durationMinutes: p.durationMinutes && p.durationMinutes > 0 ? p.durationMinutes : 60,
      // ⚠ THE CLASS NAME ALONE. Joining it to the programme produced
      // "Week 4 — Cardiac emergencies — NCLEX-RN Live — The 8-Week Pass Plan"
      // — THREE em-dashes, because both halves already contain one. Caught by
      // decoding a real .ics rather than by reading the code. The programme
      // is one line down in DESCRIPTION, where length costs nothing; the
      // SUMMARY is what shows on a phone's lock screen and wants to be short.
      title: p.sessionTitle,
      description: descriptionParts.join('\n'),
      url: p.joinUrl,
    }),
  ];
}

export const SESSION_REMINDER_FOOTER_CONTEXT =
  'You are receiving this because you are enrolled in a MyNclex programme with live classes.';

const BASE: SessionReminderPayload = {
  recipientName: 'Ama',
  programmeTitle: 'NCLEX-RN Live — The 8-Week Pass Plan',
  cohortName: 'Cohort 3',
  tutorName: 'Grace Mensah',
  sessionTitle: 'Week 4 — Cardiac emergencies',
  scheduledAtISO: '2026-08-25T19:00:00.000Z',
  durationMinutes: 90,
  // ⚠ The stored enum, not a label — a fixture that pre-humanises its own
  // input cannot catch a missing label map, and this one did not.
  platform: 'ZOOM',
  joinUrl: 'https://zoom.us/j/91234567890',
  meetingId: '912 3456 7890',
  passcode: '4821',
  joiningInstructions: 'Join five minutes early; we start on time, and bring your notes.',
  sessionId: '7c8915b8-28f3-496a-b889-606f83c2f857',
  sequence: 1755600000,
  trigger: 'NIGHTLY',
};

export const sessionReminderTemplate: EmailTemplate<SessionReminderPayload> = {
  key: 'session.reminder',
  name: 'Live class reminder',
  subject,
  body,
  attachments,
  previews: [
    { label: 'Nightly · full joining details', payload: BASE },
    {
      // ⭐ The tutor pressed send. Same facts, different voice — she should
      // be able to tell that a person did this.
      label: 'Tutor sent it (manual)',
      payload: { ...BASE, trigger: 'MANUAL' },
    },
    {
      // ⚠ The state the planner actually allows: a class can be scheduled
      // before its link exists. 2 of dev's 35 sessions look like this, so
      // it is the normal early case, not a defect — and an email that
      // silently omitted the button would leave her hunting.
      label: 'No joining link yet',
      payload: {
        ...BASE,
        joinUrl: null,
        meetingId: null,
        passcode: null,
        platform: null,
        joiningInstructions: null,
      },
    },
    {
      label: 'Self-paced programme (no cohort name)',
      payload: { ...BASE, cohortName: null, durationMinutes: null },
    },
  ],
};

