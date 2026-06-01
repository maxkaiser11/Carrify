'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';

type Status = { connected: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean };

export default function PayoutsPage() {
  const api = useApi();
  const { me, loading: meLoading } = useMe();
  const params = useSearchParams();
  const justReturned = params.get('done') === '1';

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBooster = me?.role === 'BOOSTER';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api<Status>('/connect/status'));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isBooster) loadStatus();
  }, [isBooster, loadStatus, justReturned]);

  async function startOnboarding() {
    setStarting(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/connect/onboarding-link', { method: 'POST' });
      window.location.href = url; // hand off to Stripe-hosted onboarding
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStarting(false);
    }
  }

  if (meLoading) return <div className="max-w-2xl mx-auto p-10 text-center text-zinc-500">Loading…</div>;
  if (!isBooster) {
    return <div className="max-w-2xl mx-auto p-10 text-center text-zinc-500">This page is for approved boosters only.</div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Payouts</h1>
        <p className="text-zinc-500 mb-6">
          Set up payouts so we can pay you for completed orders. Stripe handles your bank details and KYC securely.
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
          {loading ? (
            <p className="text-zinc-500">Checking status…</p>
          ) : status?.payoutsEnabled ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                  ✓ Payouts enabled
                </span>
              </div>
              <p className="text-sm text-zinc-500 mt-3">
                You’re all set. Payouts for completed orders are transferred automatically, and any that were waiting on
                your onboarding have now been released.
              </p>
              <button onClick={loadStatus} className="mt-4 text-sm text-brand-600 hover:underline">
                Refresh status
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {status?.connected
                  ? 'Your payout account needs a few more details before you can be paid.'
                  : 'You haven’t set up payouts yet.'}
              </p>
              <button
                onClick={startOnboarding}
                disabled={starting}
                className="mt-4 w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/60 disabled:cursor-not-allowed text-white font-medium px-4 py-2.5 rounded-xl transition"
              >
                {starting ? 'Redirecting…' : status?.connected ? 'Finish payout setup' : 'Set up payouts'}
              </button>
              {justReturned && (
                <p className="mt-3 text-xs text-zinc-400">
                  Back from Stripe? It can take a moment to process — hit{' '}
                  <button onClick={loadStatus} className="text-brand-600 hover:underline">refresh</button>.
                </p>
              )}
            </div>
          )}
        </div>

        <Link href="/booster/orders" className="text-sm text-brand-600 hover:underline mt-6 inline-block">
          ← Back to order queue
        </Link>
      </div>
    </div>
  );
}
