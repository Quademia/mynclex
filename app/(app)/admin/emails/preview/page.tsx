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
// Inherits the shell and the COMMS_MANAGE gate is re-applied here — the
// layered rule: never rely on the parent route alone.

import { requireAdminPermission, PERM_COMMS_MANAGE } from '@/lib/access';
import { allPreviews } from '@/lib/email/render';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminEmailPreviewPage() {
  await requireAdminPermission(PERM_COMMS_MANAGE);

  const previews = allPreviews();

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner eml-page">
        <header className="eml-head">
          <div>
            <p className="eml-eyebrow">Communications</p>
            <h1 className="eml-title">Template preview</h1>
            <p className="eml-sub">
              Sample data, real renderer. {previews.length} variants across{' '}
              {new Set(previews.map((p) => p.eventKey)).size} email
              {new Set(previews.map((p) => p.eventKey)).size === 1 ? '' : 's'}.
            </p>
          </div>
          <Link href="/admin/emails" className="eml-btn-ghost">
            Back to queue
          </Link>
        </header>

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
