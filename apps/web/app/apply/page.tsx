'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '../../lib/api';
import { useMe } from '../../lib/use-me';
import type { BoosterApplication } from '@repo/types';

const GAMES = ['valorant', 'league', 'dota2', 'cs2', 'overwatch'];

export default function ApplyPage() {
  const api = useApi();
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { me, loading: loadingMe, error: meError } = useMe();

  const [existing, setExisting] = useState<BoosterApplication | null>(null);
  const [games, setGames] = useState<string[]>([]);
  const [experience, setExperience] = useState('');
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [discord, setDiscord] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    api<BoosterApplication | null>('/applications/me')
      .then(setExisting)
      .catch(() => setExisting(null));
  }, [api, isSignedIn]);

  if (!isLoaded || loadingMe) return <p className="p-6">Loading…</p>;
  if (!isSignedIn) return <p className="p-6">Sign in first.</p>;
  if (!me) return (
    <div className="p-6">
      <p>Could not load your profile.</p>
      {meError && <pre className="mt-2 text-red-600 text-sm">{meError}</pre>}
    </div>
  );
  if (me.role === 'BOOSTER') return <p className="p-6">You&apos;re already a booster ✅</p>;
  if (me.role === 'ADMIN') return <p className="p-6">Admins can&apos;t apply.</p>;

  if (existing?.status === 'PENDING') {
    return <p className="p-6">Application submitted — waiting for review.</p>;
  }

  const toggleGame = (g: string) => {
    setGames((curr) => curr.includes(g) ? curr.filter(x => x !== g) : [...curr, g]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/applications', {
        method: 'POST',
        body: JSON.stringify({ games, experience, ranks, discord: discord || undefined }),
      });
      router.refresh();
      const updated = await api<BoosterApplication>('/applications/me');
      setExisting(updated);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Booster Application</h1>

      {existing?.status === 'REJECTED' && (
        <div className="p-3 bg-red-100 text-red-800 rounded">
          Previous application rejected{existing.notes ? `: ${existing.notes}` : ''}. You may reapply.
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block font-medium mb-2">Games you can boost</label>
          <div className="flex flex-wrap gap-2">
            {GAMES.map(g => (
              <button key={g} type="button" onClick={() => toggleGame(g)}
                className={`px-3 py-1 rounded border ${games.includes(g) ? 'bg-purple-700 text-white' : ''}`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {games.map(g => (
          <div key={g}>
            <label className="block font-medium">{g} rank</label>
            <input className="border p-2 rounded w-full"
              value={ranks[g] ?? ''}
              onChange={(e) => setRanks({ ...ranks, [g]: e.target.value })}
              placeholder="e.g. Immortal 2" />
          </div>
        ))}

        <div>
          <label className="block font-medium">Experience</label>
          <textarea className="border p-2 rounded w-full" rows={4}
            value={experience} onChange={(e) => setExperience(e.target.value)}
            placeholder="Tell us about your boosting/competitive experience" />
        </div>

        <div>
          <label className="block font-medium">Discord (optional)</label>
          <input className="border p-2 rounded w-full"
            value={discord} onChange={(e) => setDiscord(e.target.value)}
            placeholder="username#1234" />
        </div>

        {error && <p className="text-red-600">{error}</p>}

        <button type="submit" disabled={submitting}
          className="bg-purple-700 text-white px-4 py-2 rounded disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </div>
  );
}
