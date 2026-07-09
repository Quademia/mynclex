import { Placeholder } from '@/components/nav/shared/placeholder';
import { requireActiveBankSubscription } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Per-page bank gate (see dashboard) — the layout admits readiness-only
// students; this page requires bank access.
export default async function BankJourneyPage() {
  await requireActiveBankSubscription();
  return (
    <Placeholder
      title="Journey Tracker"
      subtitle="7-phase migration prep"
      description="Credential evaluation → English → state board → ATT → exam booking."
    />
  );
}
