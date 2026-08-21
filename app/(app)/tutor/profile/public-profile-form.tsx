// mynclex/app/(app)/tutor/profile/public-profile-form.tsx
//
// The "Public profile" editor — the section of the tutor profile page
// that edits nclex_tutors.public_profile (slice 3.5; the bag moved off
// nclex_users in tutor-onboarding slice 1a). Single-use, lives next to
// its only caller (page.tsx).
//
// This component is storage-agnostic: it takes the bag as a prop and
// hands it back to savePublicProfileAction, so the 1a move needed no
// change here beyond this comment.
//
// One explicit Save (not inline auto-save), so save-safety here is:
// dirty-tracking to gate the button + a beforeunload guard against
// losing unsaved edits + toast feedback (UI convention #1). Person and
// business fields sit in two sections; a live preview mirrors the
// attribution rule so the tutor sees the effect before saving.
//
// Logo: a URL field for now ("mechanism"); direct image upload wiring
// is deferred (per the slice plan).

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { initials, tutorAttribution, yearsTutoringLabel } from '@/lib/discovery/format';
import type { PublicProfile } from '@/lib/discovery/types';
import { savePublicProfileAction } from './actions';

export function PublicProfileForm({
  tutorName,
  avatarUrl,
  initial,
}: {
  tutorName: string;
  avatarUrl: string | null;
  initial: PublicProfile;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // In-app navigation guard: the href the tutor tried to leave to while
  // there were unsaved edits. Non-null = the discard overlay is shown.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const [headline, setHeadline] = useState(initial.headline ?? '');
  const [speciality, setSpeciality] = useState(initial.speciality ?? '');
  const [years, setYears] = useState(
    initial.years_experience != null ? String(initial.years_experience) : ''
  );
  const [bio, setBio] = useState(initial.bio ?? '');
  const [businessName, setBusinessName] = useState(initial.business_name ?? '');
  const [businessLogoUrl, setBusinessLogoUrl] = useState(
    initial.business_logo_url ?? ''
  );
  const [businessBio, setBusinessBio] = useState(initial.business_bio ?? '');

  // Current form values folded into a PublicProfile shape (for both the
  // preview and the save payload).
  const draft: PublicProfile = {
    headline: headline.trim() || undefined,
    speciality: speciality.trim() || undefined,
    years_experience: years.trim() === '' ? undefined : Number(years),
    bio: bio.trim() || undefined,
    business_name: businessName.trim() || undefined,
    business_logo_url: businessLogoUrl.trim() || undefined,
    business_bio: businessBio.trim() || undefined,
  };

  const isDirty =
    (headline.trim() || '') !== (initial.headline ?? '') ||
    (speciality.trim() || '') !== (initial.speciality ?? '') ||
    years.trim() !==
      (initial.years_experience != null ? String(initial.years_experience) : '') ||
    (bio.trim() || '') !== (initial.bio ?? '') ||
    (businessName.trim() || '') !== (initial.business_name ?? '') ||
    (businessLogoUrl.trim() || '') !== (initial.business_logo_url ?? '') ||
    (businessBio.trim() || '') !== (initial.business_bio ?? '');

  const yearsValid =
    years.trim() === '' ||
    (Number.isInteger(Number(years)) && Number(years) >= 0);

  // Auto-dismiss the "saved" toast after 5s.
  useEffect(() => {
    if (!saved) return;
    const id = window.setTimeout(() => setSaved(false), 5000);
    return () => window.clearTimeout(id);
  }, [saved]);

  // beforeunload guard — protects unsaved edits on a HARD exit (refresh,
  // tab close, URL change). Does not cover in-app navigation; the click
  // interceptor below handles that.
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // In-app navigation guard — Next.js client navigations never fire
  // beforeunload, so we intercept clicks on in-app links (the sidebar,
  // etc.) during the capture phase while there are unsaved edits. A
  // plain left-click on a same-origin path is cancelled and routed
  // through the discard overlay instead.
  useEffect(() => {
    if (!isDirty) return;
    function onClickCapture(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!href || !href.startsWith('/')) return; // external / hash / non-link
      if (anchor!.target && anchor!.target !== '_self') return; // new tab
      if (href === window.location.pathname) return; // same page
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [isDirty]);

  function handleSave(navigateTo?: string) {
    if (!yearsValid) {
      setError('Years tutoring must be a whole number.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await savePublicProfileAction(draft);
      if (result.ok) {
        setSaved(true);
        if (navigateTo) {
          setPendingHref(null);
          router.push(navigateTo);
        } else {
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  // Live preview attribution (mirrors the card/detail rule).
  const attr = tutorAttribution(draft, tutorName, avatarUrl);
  const yearsLabel = yearsTutoringLabel(draft.years_experience);

  return (
    <>
      <div className="pf-grid">
        <form
          className="pf-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {/* ABOUT YOU */}
          <section className="pf-section">
            <h2 className="pf-section-title">About you</h2>
            <p className="pf-section-note">
              Shown on your programme cards and detail pages.
            </p>

            <label className="prog-field">
              <span className="prog-field-label">Current role / title</span>
              <input
                type="text"
                className="prog-input"
                placeholder="e.g. Pediatric ICU nurse"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                disabled={isPending}
              />
            </label>

            <div className="prog-field-row">
              <label className="prog-field">
                <span className="prog-field-label">Speciality / field</span>
                <input
                  type="text"
                  className="prog-input"
                  placeholder="e.g. Pharmacology, Med-Surg"
                  value={speciality}
                  onChange={(e) => setSpeciality(e.target.value)}
                  disabled={isPending}
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Years tutoring</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="prog-input"
                  placeholder="e.g. 6"
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  disabled={isPending}
                />
              </label>
            </div>

            <label className="prog-field">
              <span className="prog-field-label">About you</span>
              <textarea
                className="prog-textarea"
                rows={5}
                placeholder="A short paragraph students will read on your programme page."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={isPending}
              />
            </label>
          </section>

          {/* BUSINESS BRANDING */}
          <section className="pf-section">
            <h2 className="pf-section-title">Business branding (optional)</h2>
            <p className="pf-section-note">
              If you teach under a business name, fill these in. Your
              programmes will show the business <strong>and</strong> your own
              name together — never one instead of the other.
            </p>

            <label className="prog-field">
              <span className="prog-field-label">Business name</span>
              <input
                type="text"
                className="prog-input"
                placeholder="e.g. NCLEX ProSolutions"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                disabled={isPending}
              />
            </label>

            <label className="prog-field">
              <span className="prog-field-label">Business logo</span>
              <input
                type="url"
                className="prog-input"
                placeholder="https://…/logo.png"
                value={businessLogoUrl}
                onChange={(e) => setBusinessLogoUrl(e.target.value)}
                disabled={isPending}
              />
              <span className="prog-field-help">
                Paste an image URL for now — direct upload is coming soon.
              </span>
            </label>

            <label className="prog-field">
              <span className="prog-field-label">About the business</span>
              <textarea
                className="prog-textarea"
                rows={4}
                placeholder="A short paragraph about your business."
                value={businessBio}
                onChange={(e) => setBusinessBio(e.target.value)}
                disabled={isPending}
              />
            </label>
          </section>
        </form>

        {/* LIVE PREVIEW */}
        <aside className="pf-preview-rail">
          <div className="pf-preview-label">Preview</div>
          <div className="pf-preview-card">
            <div className="pf-preview-tutor">
              <div className="pf-preview-avatar">
                {attr.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attr.imageUrl} alt="" />
                ) : (
                  initials(attr.initialsSeed)
                )}
              </div>
              <div className="pf-preview-who">
                <div className="pf-preview-name">
                  By <strong>{attr.primaryName}</strong>
                  {attr.secondaryName && (
                    <span className="pf-preview-with"> · with {attr.secondaryName}</span>
                  )}
                </div>
                {(draft.headline || yearsLabel) && (
                  <div className="pf-preview-sub">
                    {[draft.headline, yearsLabel].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {draft.bio && <p className="pf-preview-bio">{draft.bio}</p>}
            {attr.isBusiness && draft.business_bio && (
              <p className="pf-preview-bio pf-preview-bizbio">
                {draft.business_bio}
              </p>
            )}
            {!draft.headline &&
              !yearsLabel &&
              !draft.bio &&
              !draft.business_name && (
                <p className="pf-preview-empty">
                  Fill in the fields to see how your profile will appear.
                </p>
              )}
          </div>
        </aside>
      </div>

      <div className="pf-actions">
        <span className="pf-actions-hint">
          {isDirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button
          type="button"
          className="prog-btn prog-btn-primary"
          onClick={() => handleSave()}
          disabled={isPending || !isDirty || !yearsValid}
        >
          {isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      {pendingHref && (
        <DiscardConfirm
          pending={isPending}
          onKeepEditing={() => setPendingHref(null)}
          onDiscard={() => {
            const href = pendingHref;
            setPendingHref(null);
            router.push(href);
          }}
          onSaveAndClose={() => handleSave(pendingHref)}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
      {saved && (
        <div className="auth-toast auth-toast-success" role="status" aria-live="polite">
          <span className="auth-toast-icon" aria-hidden="true">✓</span>
          <span className="auth-toast-message">Profile saved.</span>
          <button
            type="button"
            className="auth-toast-close"
            aria-label="Dismiss"
            onClick={() => setSaved(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
