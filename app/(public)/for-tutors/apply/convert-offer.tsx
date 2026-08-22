// mynclex/app/(public)/for-tutors/apply/convert-offer.tsx
//
// "Use MyNclex as a student instead" — sub-slice 2c, §8.
//
// ⭐ WHY IT SITS BELOW THE RESUBMIT FORM AND NOT BESIDE IT. These are not
// two equal choices. The person came here to teach, was told no, and the
// first thing they should meet is the reason and a way to fix it — §9
// exists precisely so a rejection is not final. This is the second
// offer, for someone who has read the reason and decided not to try
// again, so it reads as an alternative rather than as us steering them
// away from reapplying.
//
// ⓘ NO CONFIRMATION DIALOG. The house rule reserves those for actions
// that lose work or cannot be undone; this only ADDS a role, changes
// nothing about their application, and the worst case is a student
// account they ignore.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { convertToStudentAction } from '@/lib/tutors/actions';

export function ConvertOffer() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await convertToStudentAction();

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    // Straight to the picker — §8's "drops them at /student/picker". They
    // now have somewhere to be, and landing back on a rejection notice
    // would be a strange reward for accepting the offer.
    router.push('/student/picker');
  }

  return (
    <div className="ft-convert">
      <h2 className="ft-convert-title">Not reapplying?</h2>
      <p className="ft-convert-body">
        You can still study with us. A student account gets you the
        question bank and any tutor&rsquo;s programme — and your
        application stays on file, so you can come back and resubmit
        whenever you want.
      </p>

      {error && <p className="ft-error">{error}</p>}

      <button
        type="button"
        className="ft-convert-btn"
        onClick={() => void convert()}
        disabled={busy}
      >
        {busy ? 'Setting up…' : 'Use MyNclex as a student'}
      </button>
    </div>
  );
}
