import { Placeholder } from '@/components/nav/shared/placeholder';
import { requireActiveBankSubscription } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Per-page bank gate (see dashboard) — the layout admits readiness-only
// students; this page requires bank access.
export default async function BankProfilePage() {
  await requireActiveBankSubscription();
  return (
    <Placeholder
      title="Profile"
      subtitle="Account and settings"
      description="Email, password, preferences, subscription details."
    />
  );
}
