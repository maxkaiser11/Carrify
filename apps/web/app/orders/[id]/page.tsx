'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';

type ConfigRow = { key: string; label: string; value: string };

type Order = {
  id: string;
  status: string;
  buyerId: string;
  boosterId: string | null;
  configDisplay: ConfigRow[];
  priceCents: number;
  platformFeeCents: number;
  boosterPayoutCents: number;
  currency: string;
  createdAt: string;
  assignedAt: string | null;
  service: { name: string; category: string; game: { slug: string; name: string } };
};

type Credentials = { username: string; password: string; country: string; updatedAt: string } | null;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  AWAITING_BOOSTER: { label: 'Finding a booster', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  ASSIGNED: { label: 'Booster assigned', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  DELIVERED: { label: 'Delivered', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPUTED: { label: 'Disputed', cls: 'bg-red-100 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
  REFUNDED: { label: 'Refunded', cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
};

// Statuses where account credentials are relevant (post-payment, pre-close).
const CREDENTIALS_VISIBLE = ['PAID', 'AWAITING_BOOSTER', 'ASSIGNED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function OrderPage() {
  const api = useApi();
  const { me } = useMe();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const justPaid = params.get('paid') === '1';
  const cancelled = params.get('cancelled') === '1';

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(justPaid); // poll while webhook catches up

  const fetchOrder = useCallback(() => api<Order>(`/orders/${id}`), [api, id]);

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(path: 'complete' | 'start' | 'deliver') {
    setActing(true);
    setActionError(null);
    try {
      await api(`/orders/${id}/${path}`, { method: 'POST' });
      setOrder(await fetchOrder());
    } catch (e: any) {
      setActionError(String(e?.message ?? e));
    } finally {
      setActing(false);
    }
  }

  // Initial load
  useEffect(() => {
    fetchOrder()
      .then((o) => { setOrder(o); setError(null); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [fetchOrder]);

  // After checkout, the Stripe webhook flips PENDING_PAYMENT -> AWAITING_BOOSTER
  // asynchronously. Poll a few times until it lands so the buyer sees confirmation.
  useEffect(() => {
    if (!justPaid) return;
    if (order && order.status !== 'PENDING_PAYMENT') { setWaiting(false); return; }

    let tries = 0;
    const handle = setInterval(async () => {
      tries += 1;
      try {
        const o = await fetchOrder();
        setOrder(o);
        if (o.status !== 'PENDING_PAYMENT') { setWaiting(false); clearInterval(handle); }
      } catch {
        /* transient — keep polling */
      }
      if (tries >= 8) { setWaiting(false); clearInterval(handle); }
    }, 1500);
    return () => clearInterval(handle);
  }, [justPaid, order?.status, fetchOrder]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-10 text-center">
        <p className="text-red-600">Couldn’t load this order: {error}</p>
        <Link href="/" className="text-brand-600 text-sm mt-4 inline-block">← Back home</Link>
      </div>
    );
  }
  if (!order) {
    return <div className="max-w-2xl mx-auto p-10 text-center text-zinc-500">Loading…</div>;
  }

  const meta = STATUS_META[order.status] ?? { label: order.status, cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' };
  const isBuyer = me?.id === order.buyerId;
  const isBooster = !!order.boosterId && me?.id === order.boosterId;
  const showCredentials = CREDENTIALS_VISIBLE.includes(order.status);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Banner */}
        {justPaid && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">🎉 Payment received — thank you!</p>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80 mt-1">
              {waiting
                ? 'Confirming your payment…'
                : 'Your order is now in the queue. A booster will pick it up shortly.'}
            </p>
          </div>
        )}
        {cancelled && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Checkout cancelled</p>
            <p className="text-sm text-amber-700/80 dark:text-amber-400/80 mt-1">
              No payment was taken. You can place the order again whenever you’re ready.
            </p>
          </div>
        )}

        <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                {order.service.game.name} · {order.service.category}
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{order.service.name}</h1>
              <p className="text-xs text-zinc-500 mt-1">Order {order.id}</p>
            </div>
            <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${meta.cls}`}>
              {meta.label}
            </span>
          </div>

          {/* Config summary — labelled, ranks resolved to names */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4">
            <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Configuration</div>
            <dl className="text-sm space-y-1">
              {order.configDisplay.length === 0 ? (
                <p className="text-zinc-500">No configuration.</p>
              ) : (
                order.configDisplay.map((row) => (
                  <div key={row.key} className="flex justify-between gap-4">
                    <dt className="text-zinc-500">{row.label}</dt>
                    <dd className="font-medium text-right">{row.value}</dd>
                  </div>
                ))
              )}
            </dl>
          </div>

          {/* Totals */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Total paid</div>
              <div className="text-3xl font-bold tracking-tight">{dollars(order.priceCents)}</div>
              <div className="text-xs text-zinc-500">{order.currency}</div>
            </div>
            <Link href={`/${order.service.game.slug}`} className="text-sm text-brand-600 hover:underline">
              Order more →
            </Link>
          </div>
        </div>

        {/* Actions */}
        {(isBuyer && order.status === 'DELIVERED') ||
        (isBooster && (order.status === 'ASSIGNED' || order.status === 'IN_PROGRESS')) ? (
          <div className="mt-6 bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
            {isBuyer && order.status === 'DELIVERED' && (
              <>
                <h2 className="text-lg font-semibold">Your booster marked this delivered</h2>
                <p className="text-sm text-zinc-500 mt-1 mb-4">
                  Check your account, then confirm completion to release payment to your booster.
                </p>
                <button
                  onClick={() => act('complete')}
                  disabled={acting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/60 disabled:cursor-not-allowed text-white font-medium px-4 py-2.5 rounded-xl transition"
                >
                  {acting ? 'Confirming…' : 'Confirm completion'}
                </button>
              </>
            )}

            {isBooster && order.status === 'ASSIGNED' && (
              <>
                <h2 className="text-lg font-semibold">Ready to start?</h2>
                <p className="text-sm text-zinc-500 mt-1 mb-4">Mark the order in progress once you begin.</p>
                <button
                  onClick={() => act('start')}
                  disabled={acting}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/60 disabled:cursor-not-allowed text-white font-medium px-4 py-2.5 rounded-xl transition"
                >
                  {acting ? 'Starting…' : 'Start work'}
                </button>
              </>
            )}

            {isBooster && order.status === 'IN_PROGRESS' && (
              <>
                <h2 className="text-lg font-semibold">Finished the job?</h2>
                <p className="text-sm text-zinc-500 mt-1 mb-4">
                  Mark it delivered — the buyer then confirms to release your payout.
                </p>
                <button
                  onClick={() => act('deliver')}
                  disabled={acting}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/60 disabled:cursor-not-allowed text-white font-medium px-4 py-2.5 rounded-xl transition"
                >
                  {acting ? 'Submitting…' : 'Mark as delivered'}
                </button>
              </>
            )}

            {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
          </div>
        ) : null}

        {/* Account access */}
        {showCredentials && isBuyer && <BuyerCredentials orderId={order.id} />}
        {showCredentials && isBooster && <BoosterCredentials orderId={order.id} />}
      </div>
    </div>
  );
}

/** Buyer-facing form to submit/update the account the booster will log into. */
function BuyerCredentials({ orderId }: { orderId: string }) {
  const api = useApi();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Credentials>(`/orders/${orderId}/credentials`)
      .then((c) => {
        if (c) { setUsername(c.username); setPassword(c.password); setCountry(c.country); setSaved(true); }
      })
      .catch(() => { /* none yet */ })
      .finally(() => setLoading(false));
  }, [api, orderId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/orders/${orderId}/credentials`, {
        method: 'PUT',
        body: JSON.stringify({ username, password, country }),
      });
      setSaved(true);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  const input =
    'w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition';

  return (
    <div className="mt-6 bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
      <h2 className="text-lg font-semibold">Account access</h2>
      <p className="text-sm text-zinc-500 mt-1">
        Your booster signs into this account to complete the order. They’ll use a VPN in your country to avoid login flags.
        {saved && <span className="text-emerald-600 font-medium"> Saved — you can update it any time.</span>}
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500 mt-4">Loading…</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Account username / email</span>
            <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Account password</span>
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Country (for VPN)</span>
            <input className={input} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Germany" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving || !username.trim() || !password || !country.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/60 disabled:cursor-not-allowed text-white font-medium px-4 py-2.5 rounded-xl transition"
          >
            {saving ? 'Saving…' : saved ? 'Update account details' : 'Save account details'}
          </button>
          <p className="text-[11px] text-zinc-400">
            Shared only with your assigned booster. Change your password again once the order is complete.
          </p>
        </form>
      )}
    </div>
  );
}

/** Booster-facing read-only view of the buyer's account details. */
function BoosterCredentials({ orderId }: { orderId: string }) {
  const api = useApi();
  const [creds, setCreds] = useState<Credentials>(null);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    api<Credentials>(`/orders/${orderId}/credentials`)
      .then(setCreds)
      .catch(() => setCreds(null))
      .finally(() => setLoading(false));
  }, [api, orderId]);

  const row = 'flex justify-between gap-4 text-sm py-1';

  return (
    <div className="mt-6 bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
      <h2 className="text-lg font-semibold">Account access</h2>
      {loading ? (
        <p className="text-sm text-zinc-500 mt-2">Loading…</p>
      ) : !creds ? (
        <p className="text-sm text-zinc-500 mt-2">
          The buyer hasn’t provided account details yet. Check back shortly.
        </p>
      ) : (
        <div className="mt-3">
          <div className={row}>
            <span className="text-zinc-500">Username</span>
            <span className="font-medium font-mono">{creds.username}</span>
          </div>
          <div className={row}>
            <span className="text-zinc-500">Password</span>
            <span className="font-medium font-mono">{reveal ? creds.password : '••••••••'}</span>
          </div>
          <div className={row}>
            <span className="text-zinc-500">Country (VPN)</span>
            <span className="font-medium">{creds.country}</span>
          </div>
          <button
            onClick={() => setReveal((v) => !v)}
            className="mt-3 text-sm text-brand-600 hover:underline"
          >
            {reveal ? 'Hide password' : 'Reveal password'}
          </button>
        </div>
      )}
    </div>
  );
}
