// mynclex/lib/payments/tutor/csv.ts
//
// Client-side CSV export of the currently-filtered payment rows on the
// global tutor Payments page. Plain string build + a Blob download —
// no server round-trip (the rows are already in the browser).

import { formatMoney } from '@/lib/strategies/format';
import type { TutorPaymentRow } from './types';

const HEADERS = [
  'Date',
  'Payer',
  'Email',
  'Programme',
  'Cohort',
  'Purpose',
  'Installment',
  'Channel',
  'Amount',
  'Currency',
  'Status',
] as const;

// RFC-4180-ish escaping: wrap in quotes and double any embedded quote
// when the value carries a comma, quote, or newline.
function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function isoToDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function toCsv(rows: TutorPaymentRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    const installment =
      r.purpose === 'installment' && r.installmentIndex
        ? `${r.installmentIndex}${r.installmentTotal ? ` of ${r.installmentTotal}` : ''}`
        : '';
    lines.push(
      [
        isoToDay(r.dateIso),
        r.name,
        r.email,
        r.programmeName,
        r.cohortLabel ?? 'Self-paced',
        r.purpose === 'installment' ? 'Installment' : 'Initial',
        installment,
        r.channel === 'online' ? 'Online · Paystack' : 'Off-platform',
        // Bare numeric major units so the cell stays a clean number; the
        // Currency column carries GHS / USD.
        (r.amountMinor / 100).toFixed(2),
        r.currency,
        r.status === 'refunded' ? 'Refunded' : 'Received',
      ]
        .map((v) => cell(String(v)))
        .join(','),
    );
  }
  return lines.join('\n');
}

// formatMoney re-export convenience for callers that want a labelled
// total alongside the export (keeps the import surface in one place).
export { formatMoney };

// Trigger a browser download of the given CSV text.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
