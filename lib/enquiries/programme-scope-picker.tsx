// mynclex/lib/enquiries/programme-scope-picker.tsx
//
// The programme SCOPE selector for the global /tutor/enquiries header. It's
// a page-scope control (not a list filter), so it drives the URL — picking
// a programme navigates to ?programme=<id>, which the server re-reads to
// refocus BOTH the summary cards and the list to that programme. "All
// programmes" clears the param. Deep-linkable: /tutor/enquiries?programme=<id>
// opens pre-scoped (used by in-context entry points).

'use client';

import { useRouter, usePathname } from 'next/navigation';

export function ProgrammeScopePicker({
  current,
  programmes,
}: {
  current: string; // a programme id, or 'ALL'
  programmes: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function onChange(value: string) {
    const params = new URLSearchParams();
    if (value !== 'ALL') params.set('programme', value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="ti-scope">
      <span className="ti-scope-label">Programme</span>
      <select
        className="ti-scope-select"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Choose programme"
      >
        <option value="ALL">All programmes</option>
        {programmes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}
