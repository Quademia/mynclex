'use client';

// mynclex/app/(public)/programmes/scroll-reveal.tsx
//
// Reveals [.prc-reveal] sections as they scroll into view on the cinematic
// /programmes page. Renders nothing. Progressive enhancement: the
// hide-until-revealed CSS is gated on a `.prc-js` class this adds on mount,
// so with JS off every section is visible. Copy, not share, of the
// /bank-access + /readiness ScrollReveal (CLAUDE.md folder convention #11).

import { useEffect } from 'react';

export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector('.prc');
    if (!root) return;
    root.classList.add('prc-js');

    const els = Array.from(root.querySelectorAll<HTMLElement>('.prc-reveal'));
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
