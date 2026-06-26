// mynclex/lib/strategies/payment-plans-panel.tsx
//
// Client surface for the tutor payment-plans page (Slice 7b). Lists
// the programme's plans as cards and owns the add/edit modal +
// activate/deactivate toggles.
//
// Upfront is shown like any other plan but with no Edit button — its
// amount is the programme's full price, edited via the programme
// price box (Phasing 2). It can still be deactivated here (the
// "installments-only tutor" case). New deposit/installment plans are
// added via the buttons for whichever kinds aren't present yet.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { StrategyFormModal } from './strategy-form-modal';
import { setStrategyActiveAction } from './actions';
import { describePlan, planLabel, systemLabel } from './format';
import type {
  EditableStrategyKind,
  PaymentStrategy,
} from './types';
import type { Currency } from '@/lib/programmes/types';

type ModalState =
  | { mode: 'create'; kind: EditableStrategyKind }
  | { mode: 'edit'; strategy: PaymentStrategy }
  | null;

const ADDABLE_KINDS: EditableStrategyKind[] = [
  'DEPOSIT_BALANCE',
  'EQUAL_INSTALLMENTS',
];

export function PaymentPlansPanel({
  programmeId,
  currency,
  strategies,
  cohortId,
}: {
  programmeId: string;
  currency: Currency;
  strategies: PaymentStrategy[];
  // Per-cohort override: when set, the panel edits a cohort's custom plan
  // set (creates are cohort-scoped; the upfront note points "above" to the
  // cohort full-price box rather than the programme settings).
  cohortId?: string;
}) {
  // Default-Total source for the add/edit modal (slice 7e — replaces the
  // retired nclex_programmes.price_minor). The UPFRONT_FULL plan is the
  // canonical full price; if it doesn't exist yet (very transient case
  // for a freshly-created programme) we fall back to 0.
  const programmePriceMinor =
    strategies.find((s) => s.kind === 'UPFRONT_FULL')?.total_price_minor ?? 0;
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleActive(strategy: PaymentStrategy) {
    if (isPending) return;
    setPendingId(strategy.strategy_id);
    startTransition(async () => {
      const result = await setStrategyActiveAction(
        strategy.strategy_id,
        !strategy.is_active
      );
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const presentKinds = new Set(strategies.map((s) => s.kind));
  const missingKinds = ADDABLE_KINDS.filter((k) => !presentKinds.has(k));

  return (
    <div className="pp-panel">
      <ul className="pp-list">
        {strategies.map((s) => {
          const isUpfront = s.kind === 'UPFRONT_FULL';
          return (
            <li
              key={s.strategy_id}
              className={`pp-card${s.is_active ? '' : ' is-inactive'}`}
            >
              <div className="pp-card-main">
                <div className="pp-card-head">
                  <span className="pp-card-title">{planLabel(s)}</span>
                  <span
                    className={`pp-pill${s.is_active ? ' is-active' : ' is-off'}`}
                  >
                    {s.is_active ? 'Active' : 'Off'}
                  </span>
                </div>
                {/* When the tutor set a custom label, still show the kind. */}
                {planLabel(s) !== systemLabel(s.kind) && (
                  <span className="pp-card-kind">{systemLabel(s.kind)}</span>
                )}
                <p className="pp-card-desc">{describePlan(s, currency)}</p>
                {isUpfront && (
                  <p className="pp-card-note">
                    {cohortId
                      ? 'The full price is set in the box above.'
                      : "The full price is set in the programme's settings."}
                  </p>
                )}
              </div>

              <div className="pp-card-actions">
                {!isUpfront && (
                  <button
                    type="button"
                    className="prog-btn prog-btn-ghost prog-btn-sm"
                    onClick={() => setModal({ mode: 'edit', strategy: s })}
                    disabled={isPending}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="prog-btn prog-btn-ghost prog-btn-sm"
                  onClick={() => toggleActive(s)}
                  disabled={isPending && pendingId === s.strategy_id}
                >
                  {s.is_active ? 'Turn off' : 'Turn on'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {missingKinds.length > 0 && (
        <div className="pp-add-row">
          <span className="pp-add-label">Add a payment plan:</span>
          {missingKinds.map((k) => (
            <button
              key={k}
              type="button"
              className="prog-btn prog-btn-secondary prog-btn-sm"
              onClick={() => setModal({ mode: 'create', kind: k })}
              disabled={isPending}
            >
              + {systemLabel(k)}
            </button>
          ))}
        </div>
      )}

      {modal?.mode === 'create' && (
        <StrategyFormModal
          mode="create"
          programmeId={programmeId}
          cohortId={cohortId}
          kind={modal.kind}
          currency={currency}
          programmePriceMinor={programmePriceMinor}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === 'edit' && (
        <StrategyFormModal
          mode="edit"
          strategy={modal.strategy}
          currency={currency}
          programmePriceMinor={programmePriceMinor}
          onClose={() => setModal(null)}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
