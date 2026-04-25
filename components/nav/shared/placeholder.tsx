// mynclex/components/nav/shared/placeholder.tsx
//
// "Coming soon" page body for any unbuilt feature page. Used by every
// placeholder route in the nav scaffold (student today; tutor + admin
// when their slices land) so the look stays consistent. Server Component
// — no interactivity.

export function Placeholder({
  title,
  subtitle,
  description,
}: {
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{title}</div>
      <div className="placeholder-subtitle">{subtitle}</div>
      <div className="placeholder-body">
        <strong>Coming soon.</strong> {description}
      </div>
    </div>
  );
}
