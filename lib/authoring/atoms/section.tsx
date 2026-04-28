// mynclex/lib/authoring/atoms/section.tsx
//
// Accordion container chrome — wraps a labelled group of fields in
// a <details>/<summary> pair. Used by every editor for the three
// canonical sections (Content / Classification / Housekeeping).

interface SectionProps {
  title: string;
  /** Render the section open by default. Defaults to false. */
  open?: boolean;
  children: React.ReactNode;
}

export function Section({ title, open = false, children }: SectionProps) {
  return (
    <details className="auth-section" open={open}>
      <summary className="auth-section-summary">
        <span className="auth-section-icon" aria-hidden="true">▶</span>
        {title}
      </summary>
      <div className="auth-section-body">{children}</div>
    </details>
  );
}
