'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';
import { GAMES } from '../../../lib/games';

type ConfigRow = { key: string; label: string; value: string };

type QueueOrder = {
  id: string;
  configDisplay: ConfigRow[];
  priceCents: number;
  boosterPayoutCents: number;
  currency: string;
  createdAt: string;
  status: string;
  assignedAt: string | null;
  service: { name: string; category: string; game: { slug: string; name: string } };
};

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
};

function dollars(cents: number) {
  return `CHF ${(cents / 100).toFixed(2)}`;
}

function configSummary(rows: ConfigRow[]) {
  if (!rows || rows.length === 0) return 'No config';
  return rows.map((r) => `${r.label}: ${r.value}`).join(' · ');
}

// Game slugs that have a live page, e.g. "valorant".
const GAME_OPTIONS = GAMES.filter((g) => g.available).map((g) => ({
  slug: g.href.replace('/', ''),
  name: g.name,
}));

export default function BoosterOrdersPage() {
  const api = useApi();
  const { me, loading: meLoading } = useMe();

  const [available, setAvailable] = useState<QueueOrder[]>([]);
  const [mine, setMine] = useState<QueueOrder[]>([]);
  const [gameFilter, setGameFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const isBooster = me?.role === 'BOOSTER';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = gameFilter ? `?game=${gameFilter}` : '';
      const [queue, assigned] = await Promise.all([
        api<QueueOrder[]>(`/orders/booster/available${qs}`),
        api<QueueOrder[]>(`/orders/booster/mine`),
      ]);
      setAvailable(queue);
      setMine(assigned);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [api, gameFilter]);

  useEffect(() => {
    if (isBooster) load();
  }, [isBooster, load]);

  async function claim(id: string) {
    setClaimingId(id);
    setError(null);
    try {
      await api(`/orders/${id}/claim`, { method: 'POST' });
      setAvailable((prev) => prev.filter((o) => o.id !== id)); // optimistic remove
      await load(); // refresh both lists (moves it into "my orders")
    } catch (e: any) {
      // Likely a 409 — someone else claimed it first. Refresh to reflect reality.
      setError(String(e?.message ?? e));
      await load();
    } finally {
      setClaimingId(null);
    }
  }

  if (meLoading) {
    return <div className="max-w-4xl mx-auto p-10 text-center text-zinc-500">Loading…</div>;
  }
  if (!isBooster) {
    return (
      <div className="max-w-4xl mx-auto p-10 text-center text-zinc-500">
        <p>This page is for approved boosters only.</p>
        <Link href="/apply" className="text-brand-600 text-sm mt-4 inline-block">
          Apply to become a booster →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Order queue</h1>
          <div className="flex items-center gap-2">
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="">All my games</option>
              {GAME_OPTIONS.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {/* Available queue */}
        {loading ? (
          <p className="text-zinc-500">Loading queue…</p>
        ) : available.length === 0 ? (
          <p className="text-zinc-500">No orders available right now. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {available.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-5"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                    {o.service.game.name} · {o.service.category}
                  </div>
                  <h3 className="font-semibold">{o.service.name}</h3>
                  <p className="text-sm text-zinc-500 truncate">{configSummary(o.configDisplay)}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold">{dollars(o.boosterPayoutCents)}</div>
                  <div className="text-xs text-zinc-500">your payout</div>
                  <button
                    onClick={() => claim(o.id)}
                    disabled={claimingId === o.id}
                    className="mt-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-xl transition"
                  >
                    {claimingId === o.id ? 'Claiming…' : 'Claim'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* My active orders */}
        {mine.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-3">Your active orders</h2>
            <div className="space-y-3">
              {mine.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 hover:border-brand-300 dark:hover:border-brand-800 p-5 transition"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                      {o.service.game.name} · {o.service.category}
                    </div>
                    <h3 className="font-semibold">{o.service.name}</h3>
                    <p className="text-sm text-zinc-500 truncate">{configSummary(o.configDisplay)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold">{dollars(o.boosterPayoutCents)}</div>
                    <span className="text-xs font-semibold text-brand-600">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
