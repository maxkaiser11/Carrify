'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';
import type { BoosterApplication, DbUser } from '@repo/types';

type AppWithUser = BoosterApplication & { user: DbUser };

export default function AdminApplicationsPage() {
  const api = useApi();
  const { me, loading } = useMe();
  const [apps, setApps] = useState<AppWithUser[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api<AppWithUser[]>(`/admin/applications?status=${filter}`)
      .then(setApps)
      .catch(() => setApps([]));
  }, [api, filter]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <p className="p-6">Loading…</p>;
  if (!me || me.role !== 'ADMIN') return <p className="p-6">Forbidden.</p>;

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
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Booster Applications</h1>

      <div className="flex gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded border ${filter === s ? 'bg-purple-700 text-white' : ''}`}>
            {s}
          </button>
        ))}
      </div>

      {apps.length === 0 && <p>No applications.</p>}

      {apps.map(app => (
        <div key={app.id} className="border rounded p-4 space-y-2">
          <div className="flex justify-between">
            <div>
              <strong>{app.user.name ?? app.user.email}</strong>
              <span className="ml-2 text-gray-500">{app.user.email}</span>
            </div>
            <span className="text-sm">{new Date(app.createdAt).toLocaleString()}</span>
          </div>
          <div><strong>Games:</strong> {app.games.join(', ')}</div>
          <div><strong>Ranks:</strong> {JSON.stringify(app.ranks)}</div>
          <div><strong>Experience:</strong> {app.experience}</div>
          {app.discord && <div><strong>Discord:</strong> {app.discord}</div>}
          {app.notes && <div className="text-red-700"><strong>Notes:</strong> {app.notes}</div>}

          {app.status === 'PENDING' && (
            <div className="flex gap-2 pt-2">
              <button onClick={() => approve(app.id)} disabled={busyId === app.id}
                className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">
                Approve
              </button>
              <button onClick={() => reject(app.id)} disabled={busyId === app.id}
                className="bg-red-600 text-white px-3 py-1 rounded disabled:opacity-50">
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
