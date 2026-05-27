'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';
import type { BoosterApplication, DbUser } from '@repo/types';

type AppWithUser = BoosterApplication & { user: DbUser };
type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_META: Record<Status, { label: string; emoji: string; classes: string; dot: string }> = {
  PENDING: {
    label: 'Pending',
    emoji: '⏳',
    classes:
      'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900/60',
    dot: 'bg-yellow-500',
  },
  APPROVED: {
    label: 'Approved',
    emoji: '✅',
    classes:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900/60',
    dot: 'bg-green-500',
  },
  REJECTED: {
    label: 'Rejected',
    emoji: '⛔',
    classes:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60',
    dot: 'bg-red-500',
  },
};

function initials(name?: string | null, email?: string) {
  const src = (name?.trim() || email || '?').replace(/[^a-z0-9 ]/gi, '');
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function timeAgo(d: string | Date) {
  const t = typeof d === 'string' ? new Date(d) : d;
  const sec = Math.floor((Date.now() - t.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return t.toLocaleDateString();
}

export default function AdminApplicationsPage() {
  const api = useApi();
  const { me, loading } = useMe();
  const [allApps, setAllApps] = useState<Record<Status, AppWithUser[]>>({
    PENDING: [],
    APPROVED: [],
    REJECTED: [],
  });
  const [filter, setFilter] = useState<Status>('PENDING');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    const fetched = await Promise.all(
      (['PENDING', 'APPROVED', 'REJECTED'] as const).map(async (s) => {
        try {
          const data = await api<AppWithUser[]>(`/admin/applications?status=${s}`);
          return [s, data] as const;
        } catch {
          return [s, [] as AppWithUser[]] as const;
        }
      }),
    );
    setAllApps({
      PENDING: fetched.find((f) => f[0] === 'PENDING')?.[1] ?? [],
      APPROVED: fetched.find((f) => f[0] === 'APPROVED')?.[1] ?? [],
      REJECTED: fetched.find((f) => f[0] === 'REJECTED')?.[1] ?? [],
    });
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts = useMemo(
    () => ({
      PENDING: allApps.PENDING.length,
      APPROVED: allApps.APPROVED.length,
      REJECTED: allApps.REJECTED.length,
      total: allApps.PENDING.length + allApps.APPROVED.length + allApps.REJECTED.length,
    }),
    [allApps],
  );

  const visible = useMemo(() => {
    const list = allApps[filter];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (a) =>
        (a.user.name ?? '').toLowerCase().includes(q) ||
        (a.user.email ?? '').toLowerCase().includes(q) ||
        a.games.some((g) => g.toLowerCase().includes(q)),
    );
  }, [allApps, filter, search]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }
  if (!me || me.role !== 'ADMIN') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-3">🚫</div>
          <h1 className="text-2xl font-bold">Forbidden</h1>
          <p className="text-zinc-500 mt-1">You need admin access to view this page.</p>
        </div>
      </div>
    );
  }

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/admin/applications/${id}/approve`, { method: 'POST' });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: number) => {
    const notes = prompt('Rejection notes (optional):') ?? undefined;
    setBusyId(id);
    try {
      await api(`/admin/applications/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
              Admin
            </span>
            <h1 className="mt-1 text-4xl font-bold tracking-tight">Booster Applications</h1>
            <p className="text-zinc-500 mt-2">Review, approve, and manage incoming applications.</p>
          </div>
          <button
            onClick={() => refresh()}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur hover:bg-white dark:hover:bg-zinc-900 transition text-sm font-medium"
          >
            <span>↻</span> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Total" value={counts.total} accent="from-brand-500 to-fuchsia-600" />
          <StatCard label="Pending" value={counts.PENDING} accent="from-yellow-400 to-amber-600" emoji="⏳" />
          <StatCard label="Approved" value={counts.APPROVED} accent="from-green-400 to-emerald-600" emoji="✅" />
          <StatCard label="Rejected" value={counts.REJECTED} accent="from-red-400 to-rose-600" emoji="⛔" />
        </div>

        {/* Filter + search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="inline-flex p-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur">
            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => {
              const active = filter === s;
              const meta = STATUS_META[s];
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`relative px-4 h-9 rounded-full text-sm font-medium transition flex items-center gap-2 ${
                    active
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                  <span
                    className={`text-xs px-1.5 rounded-full ${
                      active ? 'bg-white/20' : 'bg-zinc-100 dark:bg-zinc-800'
                    } tabular-nums`}
                  >
                    {counts[s]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or game…"
              className="w-full h-11 pl-11 pr-4 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition text-sm"
            />
          </div>
        </div>

        {/* List */}
        {visible.length === 0 ? (
          <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl p-16 text-center">
            <div className="text-5xl mb-3">{STATUS_META[filter].emoji}</div>
            <p className="text-zinc-500">
              {search
                ? `No ${filter.toLowerCase()} applications match "${search}".`
                : `No ${filter.toLowerCase()} applications.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((app) => {
              const meta = STATUS_META[app.status as Status];
              const isOpen = expanded.has(app.id);
              return (
                <div
                  key={app.id}
                  className="group bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-800 transition overflow-hidden"
                >
                  {/* Card header */}
                  <div className="p-5 flex items-start gap-4">
                    <div className="h-12 w-12 rounded-full bg-linear-to-br from-brand-500 to-fuchsia-600 text-white font-semibold flex items-center justify-center shadow-md shadow-brand-600/20 shrink-0">
                      {initials(app.user.name, app.user.email)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold truncate">
                            {app.user.name ?? 'Unnamed user'}
                          </h3>
                          <p className="text-sm text-zinc-500 truncate">{app.user.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.classes}`}
                          >
                            {meta.emoji} {meta.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {app.games.map((g) => (
                          <span
                            key={g}
                            className="px-2 py-0.5 rounded-md bg-brand-50 dark:bg-brand-950/40 border border-brand-100 dark:border-brand-900/60 text-xs font-medium text-brand-700 dark:text-brand-300"
                          >
                            {g}
                          </span>
                        ))}
                        <span className="text-xs text-zinc-400 ml-2">
                          {timeAgo(app.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable */}
                  {isOpen && (
                    <div className="px-5 pb-5 -mt-2 grid sm:grid-cols-2 gap-4 text-sm border-t border-zinc-100 dark:border-zinc-800 pt-4">
                      <div>
                        <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1.5">
                          Ranks
                        </div>
                        <div className="space-y-1">
                          {Object.entries(app.ranks).length === 0 ? (
                            <div className="text-zinc-400 italic">No ranks provided</div>
                          ) : (
                            Object.entries(app.ranks).map(([game, rank]) => (
                              <div key={game} className="flex items-center gap-2">
                                <span className="text-zinc-500 capitalize">{game}:</span>
                                <span className="font-medium">{rank}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1.5">
                          Contact
                        </div>
                        {app.discord ? (
                          <div className="font-mono text-sm">@{app.discord}</div>
                        ) : (
                          <div className="text-zinc-400 italic">No Discord</div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1.5">
                          Experience
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{app.experience}</p>
                      </div>
                      {app.notes && (
                        <div className="sm:col-span-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
                          <span className="font-semibold text-red-800 dark:text-red-300">
                            Notes:{' '}
                          </span>
                          <span className="text-red-700 dark:text-red-400">{app.notes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleExpanded(app.id)}
                      className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 transition"
                    >
                      {isOpen ? '▲ Hide details' : '▼ Show details'}
                    </button>

                    {app.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => reject(app.id)}
                          disabled={busyId === app.id}
                          className="bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 text-sm font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          ✕ Reject
                        </button>
                        <button
                          onClick={() => approve(app.id)}
                          disabled={busyId === app.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition disabled:opacity-50 shadow-md shadow-green-600/20"
                        >
                          {busyId === app.id ? '…' : '✓ Approve'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  emoji,
}: {
  label: string;
  value: number;
  accent: string;
  emoji?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-5">
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full bg-linear-to-br ${accent} opacity-20 blur-2xl`} />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
          <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
        </div>
        {emoji && <div className="text-2xl opacity-70">{emoji}</div>}
      </div>
    </div>
  );
}
