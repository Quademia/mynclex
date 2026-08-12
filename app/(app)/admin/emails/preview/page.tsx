// mynclex/app/(app)/admin/emails/preview/page.tsx
//
// Every variant of every template, rendered against sample data.
//
// ⭐ WHY THIS EXISTS. The receipt branches five ways by line item and
// three ways by how far the purchase got — and on dev, three of those
// purposes have never once appeared in a combined checkout. Without
// this, four branches are untested on any given day and the first person
// to see a broken one is a customer.
//
// ⚠ It goes through the SAME render path a real send does
// (renderOutboxRow), not a parallel one. A preview built on different
// code would prove nothing about the email that actually goes out.
//
// ⭐ A LIST, THEN ONE TEMPLATE'S VARIANTS (Sam, 2026-08-11). Rendering
// everything at once is fine at one template and unusable at twenty-four
// — the receipt alone is seven frames and a ~4,400px scroll. But the
// split is per TEMPLATE, not per variant: within one email you want all
// its variants together, because comparing them is the entire point.
// So a single-variant email costs no wasted click, and adding an email
// later adds a row to a list instead of making a page longer.
//
// A query parameter, not a new route — the same reading as the cohort
// fold's `?cohort=`, where a selection is a context rather than a place.
//
// ⚠ The samples are invented fixtures inside each template file (`Ama`,
// `GHS 350`). Nothing is seeded and nothing is written, so there is no
// preview data anywhere to prune.
//
// Inherits the shell and the COMMS_MANAGE gate is re-applied here — the
// layered rule: never rely on the parent route alone.

import { requireAdminPermission, PERM_COMMS_MANAGE } from '@/lib/access';
import { allPreviews, templateIndex } from '@/lib/email/render';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{ template?: string }>;
};

export default async function AdminEmailPreviewPage({ searchParams }: PageProps) {
  await requireAdminPermission(PERM_COMMS_MANAGE);

  const selectedKey = (await searchParams)?.template;
  const templates = templateIndex();
  // Only ever the selected template's variants — the whole point of the
  // split. With no selection we render none of them.
  const previews = selectedKey ? allPreviews(selectedKey) : [];
  const selected = templates.find((t) => t.eventKey === selectedKey);

  const variantTotal = templates.reduce((n, t) => n + t.variantCount, 0);

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner eml-page">
        <header className="eml-head">
          <div>
            <p className="eml-eyebrow">Communications</p>
            <h1 className="eml-title">{selected ? selected.name : 'Template preview'}</h1>
            <p className="eml-sub">
              {selected ? (
                <>
                  Sample data, real renderer. {selected.variantCount} variant
                  {selected.variantCount === 1 ? '' : 's'} of{' '}
                  <span className="eml-key">{selected.eventKey}</span>.
                </>
              ) : (
                <>
                  Sample data, real renderer. {templates.length} email
                  {templates.length === 1 ? '' : 's'} built, {variantTotal} variant
                  {variantTotal === 1 ? '' : 's'} in total.
                </>
              )}
            </p>
          </div>
          <Link
            href={selected ? '/admin/emails/preview' : '/admin/emails'}
            className="eml-btn-ghost"
          >
            {selected ? '← All templates' : 'Back to queue'}
          </Link>
        </header>

        {/* ── the list ─────────────────────────────────────────────── */}
        {!selected && (
          <ul className="eml-tlist">
            {templates.map((t) => (
              <li key={t.eventKey}>
                <Link className="eml-trow" href={`/admin/emails/preview?template=${t.eventKey}`}>
                  <span className="eml-tname">{t.name}</span>
                  <span className="eml-key">{t.eventKey}</span>
                  <span className="eml-tcount">
                    {t.variantCount} variant{t.variantCount === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* An unknown ?template= — a stale bookmark, or a template that
            was removed. Say so plainly rather than showing an empty page
            that reads as "this email renders nothing". */}
        {selectedKey && !selected && (
          <p className="eml-empty">
            No template built for <span className="eml-key">{selectedKey}</span>.{' '}
            <Link href="/admin/emails/preview">See the ones that are.</Link>
          </p>
        )}

        {/* ── one template's variants, exactly as before ────────────── */}
        {previews.map((p) => (
          <section className="eml-preview" key={`${p.eventKey}:${p.label}`}>
            <div className="eml-preview-head">
              <span className="eml-key">{p.eventKey}</span>
              <span className="eml-preview-label">{p.label}</span>
            </div>
            <p className="eml-preview-subject">
              <span>Subject</span> {p.rendered.subject}
            </p>
            {/* srcDoc, not dangerouslySetInnerHTML: the email carries its
                own <html> and inline styles, and dropping that into the
                admin page's DOM would let it restyle the page around it.
                An iframe is the honest container — it also shows the
                email at the width a mail client gives it. */}
            <iframe
              className="eml-preview-frame"
              title={`${p.eventKey} — ${p.label}`}
              srcDoc={p.rendered.html}
              sandbox=""
            />
          </section>
        ))}
      </div>
    </main>
  );
}
