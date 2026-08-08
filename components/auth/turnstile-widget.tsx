// mynclex/components/auth/turnstile-widget.tsx
//
// The browser half of Cloudflare Turnstile — build-order item 2, slice 2d.
// Mounted by /login, /register and /forgot-password; the server half that
// checks what this produces is lib/auth/turnstile.ts.
//
// Shared rather than single-use (folder convention #3): three callers in
// three routes, so it is chrome, not a page part.
//
// ⭐ A PASS IS SINGLE-USE, WHICH IS THE ONLY HARD PART OF THIS WHOLE
// SLICE. Cloudflare spends the token the moment we check it. So a student
// who mistypes her password has ALREADY spent hers by the time the screen
// says "Invalid login credentials" — and her second attempt, with the
// right password, would be refused with a message that describes the
// wrong problem entirely. Hence `resetTurnstile()` below, called by every
// form on every failed submit. Without it this slice would turn one typo
// into a locked door, on the exact surface we are trying to make kinder.
//
// ⭐ A PASS ALSO EXPIRES (Cloudflare's window is a few minutes). Someone
// who opens the page, is interrupted, and comes back would hit the same
// wall for a different reason. `refresh-expired: 'auto'` is set
// explicitly rather than left to the default — it is load-bearing here,
// and a default that changes upstream should not quietly change our
// behaviour.
//
// ⓘ NO SITE KEY MEANS NO WIDGET, and that is deliberately the same
// condition the server uses to switch the check off. Both halves read
// NEXT_PUBLIC_TURNSTILE_SITE_KEY, so they cannot disagree about whether
// Turnstile is on — see the header of lib/auth/turnstile.ts.

'use client';

import { useEffect, useRef } from 'react';

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * The mounted widget's readiness reporter, module-level for the same
 * reason resetTurnstile takes no widget id: there is exactly one widget
 * per auth screen. It lets reset() below flip the form back to "not ready"
 * without the three forms each having to remember to do it themselves.
 */
let notifyReady: ((ready: boolean) => void) | null = null;

/**
 * ⚠ HOW LONG A FORM MAY STAY LOCKED WAITING FOR A PASS THAT NEVER COMES.
 *
 * Every path to readiness runs through a Cloudflare callback, so a widget
 * that never calls back — script blocked by an extension, a filtering
 * proxy, a corporate network — would leave the submit button dead forever
 * with nothing on screen to explain it. That is a worse failure than the
 * one this whole feature is guarding against.
 *
 * After this long we unlock anyway. The submit then reaches the server
 * with no token, is refused, and the student gets a sentence telling her
 * to refresh — which is a bad outcome, but a legible one.
 *
 * Generous on purpose: the students this matters most for are on slow
 * mobile connections, and unlocking early would hand them the refusal
 * while their pass was still on its way.
 */
const READY_FALLBACK_MS = 10_000;

/**
 * Throw away the spent pass and fetch a fresh one. Call after EVERY failed
 * submit — see the single-use note in the header.
 *
 * No widget id is passed on purpose: Cloudflare's reset() with no argument
 * resets every widget on the page, and there is exactly one per auth
 * screen. Threading an id through a ref, up to the form, and back down
 * would buy nothing and give the forms a handle they could forget to use.
 *
 * ⭐ It locks the form again first. Between the reset and the new pass
 * arriving the hidden field is EMPTY, so a fast second submit in that gap
 * would be refused for "no pass" — the very bug this readiness work
 * exists to remove, reintroduced at the one moment the student is most
 * likely to be clicking quickly.
 */
export function resetTurnstile(): void {
  try {
    notifyReady?.(false);
    window.turnstile?.reset();
  } catch {
    // Script still loading, or the widget is already gone. Either way
    // there is no spent token to clear, so there is nothing to report.
  }
}

export function TurnstileWidget({
  onReadyChange,
}: {
  /**
   * Called with true once a pass is in hand, false while there isn't one.
   * The three forms use it to hold their submit button.
   */
  onReadyChange?: (ready: boolean) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  // Held in a ref so the render effect below does not re-run — and tear
  // the widget down — every time the parent re-renders. Kept in step from
  // an effect rather than assigned during render, which React forbids;
  // declared FIRST so it runs before the render effect that reads it.
  const report = useRef(onReadyChange);
  useEffect(() => {
    report.current = onReadyChange;
  });

  useEffect(() => {
    // ⭐ NO SITE KEY MEANS READY IMMEDIATELY, and this branch is the whole
    // reason the fallback below is not the only safety net. Turnstile is
    // switched off here, no widget will render, no callback will ever
    // fire — so waiting for one would leave every auth form on the site
    // permanently un-submittable. Same fail-open rule as the server:
    // not configured must never mean not usable.
    if (!siteKey) {
      report.current?.(true);
      return;
    }

    let cancelled = false;
    notifyReady = (ready) => report.current?.(ready);

    // The backstop for a widget that never speaks at all — see
    // READY_FALLBACK_MS.
    const fallback = setTimeout(() => {
      if (!cancelled) report.current?.(true);
    }, READY_FALLBACK_MS);

    function render() {
      // widgetId guards against a double render: React 19 runs effects
      // twice in dev StrictMode, and two widgets in one form means two
      // hidden fields with the same name — the server would read
      // whichever the browser serialised first.
      if (cancelled || !holder.current || widgetId.current) return;

      const api = window.turnstile;
      if (!api) return;

      widgetId.current = api.render(holder.current, {
        sitekey: siteKey,
        // Fills the card rather than sitting at Cloudflare's fixed 300px,
        // which overflows a phone-width auth card (UI convention #3 —
        // student surfaces are the priority and they are phone-first).
        size: 'flexible',
        // The auth pages have no dark variant, so 'auto' would follow the
        // student's OS and drop a dark widget onto a light card.
        theme: 'light',
        'refresh-expired': 'auto',

        // A pass is in hand — this is the only path that unlocks the form
        // on its merits rather than by giving up.
        callback: () => report.current?.(true),

        // Expired: 'refresh-expired: auto' above will fetch another and
        // fire callback again, so locking here is a brief pause rather
        // than a dead end. Worth doing — the alternative is a form that
        // looks submittable while holding a pass Cloudflare has retired.
        'expired-callback': () => report.current?.(false),

        // ⭐ ERRORS UNLOCK RATHER THAN LOCK, which reads backwards and is
        // the kinder failure. An errored widget will never produce a pass
        // (this is what the 110200 "domain not authorised" state looked
        // like), so holding the button means a dead form with no
        // explanation anywhere on the page. Letting the submit through
        // gets her a sentence from the server telling her to refresh.
        // Neither is good; only one of them tells her anything.
        'error-callback': () => report.current?.(true),
        'timeout-callback': () => report.current?.(true),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      // One script tag for the whole app, even though three routes mount
      // this. Appending a second would re-execute the API and orphan the
      // first widget.
      const existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        existing.addEventListener('load', render);
      } else {
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener('load', render);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      notifyReady = null;
      const id = widgetId.current;
      widgetId.current = null;
      if (id) {
        try {
          window.turnstile?.remove(id);
        } catch {
          // Already torn down by a navigation. Nothing to clean up.
        }
      }
    };
  }, [siteKey]);

  // Nothing to show, and nothing to reserve space for — the server is
  // switched off under exactly this condition, so the form still works.
  if (!siteKey) return null;

  return <div className="auth-turnstile" ref={holder} />;
}
