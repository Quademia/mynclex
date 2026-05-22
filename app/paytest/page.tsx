// mynclex/app/paytest/page.tsx
//
// THROWAWAY test harness for slice 5.2. Fires the payment plumbing
// (startPaymentAction + checkEmail) so we can prove the Paystack
// round-trip works before slice 5.4 builds the real checkout page.
// DELETE this route once 5.4 lands.

'use client';

import { useState, useTransition } from 'react';
import { startPaymentAction, checkEmail } from '@/lib/payments/actions';

const BANK_PRODUCTS = [
  { id: 'BANK_30D', label: '30 days' },
  { id: 'BANK_60D', label: '60 days' },
  { id: 'BANK_90D', label: '90 days' },
  { id: 'BANK_180D', label: '180 days' },
  { id: 'BANK_365D', label: '365 days' },
];

export default function PayTestPage() {
  const [email, setEmail] = useState('');
  const [productId, setProductId] = useState('BANK_30D');
  const [currency, setCurrency] = useState<'GHS' | 'USD'>('GHS');
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();

  // Safety: this dev-only harness never renders in a production build.
  if (process.env.NODE_ENV === 'production') return null;

  function onCheckEmail() {
    setMsg('Checking…');
    startTransition(async () => {
      const r = await checkEmail(email);
      setMsg(r.exists ? 'Email HAS an account (checkout would pause to log in).' : 'Email is new (checkout would proceed).');
    });
  }

  function onPay() {
    setMsg('Starting payment…');
    startTransition(async () => {
      const r = await startPaymentAction({
        email,
        target: { kind: 'BANK', productId, currency },
      });
      if (r.ok) {
        window.location.href = r.authorizationUrl;
      } else {
        setMsg(`Error: ${r.error}`);
      }
    });
  }

  return (
    <main style={{ maxWidth: 460, margin: '64px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20 }}>Paystack test harness (5.2)</h1>
      <p style={{ color: '#667', fontSize: 13 }}>Throwaway page — deleted when 5.4 ships.</p>

      <label style={{ display: 'block', marginTop: 18, fontSize: 13 }}>Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ width: '100%', padding: 8, marginTop: 4 }}
      />

      <label style={{ display: 'block', marginTop: 14, fontSize: 13 }}>Bank product</label>
      <select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ width: '100%', padding: 8, marginTop: 4 }}>
        {BANK_PRODUCTS.map((p) => (
          <option key={p.id} value={p.id}>{p.label} ({p.id})</option>
        ))}
      </select>

      <label style={{ display: 'block', marginTop: 14, fontSize: 13 }}>Currency</label>
      <select value={currency} onChange={(e) => setCurrency(e.target.value as 'GHS' | 'USD')} style={{ width: '100%', padding: 8, marginTop: 4 }}>
        <option value="GHS">GHS</option>
        <option value="USD">USD</option>
      </select>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onCheckEmail} disabled={pending || !email} style={{ padding: '8px 14px' }}>
          Check email
        </button>
        <button onClick={onPay} disabled={pending || !email} style={{ padding: '8px 14px', fontWeight: 600 }}>
          Pay with Paystack →
        </button>
      </div>

      {msg && <p style={{ marginTop: 16, fontSize: 13 }}>{msg}</p>}
    </main>
  );
}
