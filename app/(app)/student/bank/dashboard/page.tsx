import { Placeholder } from '@/components/nav/shared/placeholder';
import { requireActiveBankSubscription } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Per-page bank gate: the layout now admits readiness-only students, so
// each bank-consumption page re-asserts bank access (→ /no-access?need=bank).
export default async function BankDashboardPage() {
  await requireActiveBankSubscription();
  return (
    <Placeholder
      title="Dashboard"
      subtitle="Your bank subscription overview"
      description="Bank 90-day · 42 days left. Recent practice sessions, readiness score, quick links."
    />
  );
}
