// mynclex/lib/bank/packs/basics-card.tsx
//
// "Pack basics" sidebar card (Slice ②a): view → Edit → save/cancel.
// Title, description, time limit (entered in minutes, stored in
// seconds). From the CD prototype (concept-not-source).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { updatePackBasicsAction } from './actions';
import type { PackRow } from './types';

export function PackBasicsCard({ pack }: { pack: PackRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const timeLimitMin = Math.round((pack.time_limit_sec ?? 0) / 60);

  const save = (fd: FormData) => {
    startTransition(async () => {
      const res = await updatePackBasicsAction(fd);
      if (!res.ok) {
        setError(res.error ?? 'Save failed.');
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <section className="rp-card rp-side-card">
      <div className="rp-side-card-head">
        <h3>Pack basics</h3>
        {!editing && (
          <button type="button" className="rp-btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="rp-basics-view">
          <div>
            <span className="rp-field-label">Title</span>
            <span>{pack.title}</span>
          </div>
          <div>
            <span className="rp-field-label">Description</span>
            <span className={pack.description ? '' : 'rp-dim'}>
              {pack.description || 'No description yet — shown to students on the catalogue.'}
            </span>
          </div>
          <div>
            <span className="rp-field-label">Time limit</span>
            <span>{formatTime(timeLimitMin)} · exam pace (2 min / question)</span>
          </div>
        </div>
      ) : (
        <form action={save} className="rp-basics-form">
          <input type="hidden" name="pack_id" value={pack.pack_id} />
          <label>
            Title
            <input name="title" defaultValue={pack.title} required maxLength={120} />
          </label>
          <label>
            Description
            <textarea
              name="description"
              rows={3}
              defaultValue={pack.description ?? ''}
              maxLength={500}
            />
          </label>
          <label>
            Time limit (minutes)
            <input
              name="time_limit_min"
              type="number"
              min={1}
              max={600}
              defaultValue={timeLimitMin || 200}
              className="rp-input-narrow"
            />
          </label>
          <div className="rp-form-actions">
            <button type="submit" className="rp-btn-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="rp-btn-ghost"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}

function formatTime(min: number): string {
  if (!min || min <= 0) return 'Not set';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
