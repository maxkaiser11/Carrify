'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '../../lib/api';
import { useMe } from '../../lib/use-me';

type ConfigRow = { key: string; label: string; value: string };

type Order = {
  id: string;
  status: string;
  configDisplay: ConfigRow[];
  priceCents: number;
  currency: string;
  createdAt: string;
  service: { name: string; category: string; game: { slug: string; name: string } };
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  PAID: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  AWAITING_BOOSTER: { label: 'Finding a booster', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  ASSIGNED: { label: 'Booster assigned', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  DELIVERED: { label: 'Delivered — confirm?', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  DISPUTED: { label: 'Disputed', cls: 'bg-red-100 text-red-700 border-red-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
  REFUNDED: { label: 'Refunded', cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function summary(rows: ConfigRow[]) {
  if (!rows?.length) return '';
  return rows.map((r) => `${r.label}: ${r.value}`).join(' · ');
}

export default function MyOrdersPage() {
  const api = useApi();
  const { me, loading: meLoading } = useMe();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api<Order[]>('/orders')
      .then((o) => { setOrders(o); setError(null); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [api, me]);

  if (meLoading) {
    return <div className="max-w-3xl mx-auto p-10 text-center text-zinc-500">Loading…</div>;
  }
  if (!me) {
    return <div className="max-w-3xl mx-auto p-10 text-center text-zinc-500">Sign in to see your orders.</div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-6">My orders</h1>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {!orders ? (
          <p className="text-zinc-500">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="text-center text-zinc-500 py-16">
            <p>You haven’t placed any orders yet.</p>
            <Link href="/" className="text-brand-600 text-sm mt-3 inline-block">Browse services →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const meta = STATUS_META[o.status] ?? { label: o.status, cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' };
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:border-brand-300 dark:hover:border-brand-800 p-5 transition"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                      {o.service.game.name} · {o.service.category}
                    </div>
                    <h3 className="font-semibold">{o.service.name}</h3>
                    <p className="text-sm text-zinc-500 truncate">{summary(o.configDisplay)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold">{dollars(o.priceCents)}</div>
                    <span className={`inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
