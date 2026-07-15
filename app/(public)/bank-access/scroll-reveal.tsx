'use client';

// mynclex/app/(public)/bank-access/scroll-reveal.tsx
//
// Tiny presentational helper for the cinematic /bank-access page: reveals
// [.bkc-reveal] sections as they scroll into view. Renders nothing.
//
// Progressive enhancement: the hide-until-revealed CSS is gated on a
// `.bkc-js` class this component adds to the page root on mount — so with
// JS disabled (or before hydration) every section is visible; the entrance
// is purely additive. Honours prefers-reduced-motion (the CSS unhides).
//
// Copy, not share, of the /readiness ScrollReveal — see CLAUDE.md folder
// convention #11 (public pages copy small presentational helpers rather
// than reach across sibling page folders).

import { useEffect } from 'react';

export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector('.bkc');
    if (!root) return;
    root.classList.add('bkc-js');

    const els = Array.from(root.querySelectorAll<HTMLElement>('.bkc-reveal'));
    if (els.length === 0) return;

    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    els.forEach((el) => {
      // Anything already in view on load reveals immediately (no wait for
      // a scroll that may never come on a short screen).
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add('is-in');
      } else {
        io.observe(el);
      }
    });

    return () => io.disconnect();
  }, []);

  return null;
}
