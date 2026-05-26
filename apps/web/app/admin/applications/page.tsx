'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';
import type { BoosterApplication, DbUser } from '@repo/types';

type AppWithUser = BoosterApplication & { user: DbUser };
type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_STYLES: Record<Status, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900',
  APPROVED: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900',
  REJECTED: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900',
};

export default function AdminApplicationsPage() {
  const api = useApi();
  const { me, loading } = useMe();
  const [apps, setApps] = useState<AppWithUser[]>([]);
  const [filter, setFilter] = useState<Status>('PENDING');
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api<AppWithUser[]>(`/admin/applications?status=${filter}`)
      .then(setApps)
      .catch(() => setApps([]));
  }, [api, filter]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return <div className="p-12 text-center text-zinc-500">Loading…</div>;
  }
  if (!me || me.role !== 'ADMIN') {
    return <div className="p-12 text-center text-zinc-500">Forbidden.</div>;
  }

  const approve = async (id: number) => {
    setBusyId(id);
    try { await api(`/admin/applications/${id}/approve`, { method: 'POST' }); refresh(); }
    finally { setBusyId(null); }
  };

  const reject = async (id: number) => {
    const notes = prompt('Rejection notes (optional):') ?? undefined;
    setBusyId(id);
    try {
      await api(`/admin/applications/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      refresh();
    } finally { setBusyId(null); }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50 dark:bg-zinc-950 py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Booster Applications</h1>
          <p className="text-zinc-500 mt-2">Review and approve booster applications.</p>
        </div>

        <div className="flex gap-2 mb-6">
          {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                filter === s
                  ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-purple-400'
              }`}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {apps.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
            No {filter.toLowerCase()} applications.
          </div>
        )}

        <div className="space-y-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{app.user.name ?? 'Unnamed user'}</h3>
                  <p className="text-sm text-zinc-500">{app.user.email}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[app.status]}`}>
                    {app.status}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1">Games</div>
                  <div className="flex flex-wrap gap-1.5">
                    {app.games.map((g) => (
                      <span key={g} className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1">Ranks</div>
                  <div className="space-y-0.5">
                    {Object.entries(app.ranks).map(([game, rank]) => (
                      <div key={game}><span className="text-zinc-500">{game}:</span> <span className="font-medium">{rank}</span></div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-zinc-500 text-xs uppercase tracking-wide font-medium mb-1">Experience</div>
                <p className="text-sm whitespace-pre-wrap">{app.experience}</p>
              </div>

              {app.discord && (
                <div className="mb-4 text-sm">
                  <span className="text-zinc-500">Discord:</span>{' '}
                  <span className="font-mono">{app.discord}</span>
                </div>
              )}

              {app.notes && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm">
                  <span className="font-semibold text-red-800 dark:text-red-300">Notes: </span>
                  <span className="text-red-700 dark:text-red-400">{app.notes}</span>
                </div>
              )}

              {app.status === 'PENDING' && (
                <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-4">
                  <button
                    onClick={() => approve(app.id)}
                    disabled={busyId === app.id}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => reject(app.id)}
                    disabled={busyId === app.id}
                    className="bg-white dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    ✕ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
