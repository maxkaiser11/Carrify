'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useApi } from '../../lib/api';
import { useMe } from '../../lib/use-me';
import type { BoosterApplication } from '@repo/types';

const GAMES: { id: string; label: string; emoji: string }[] = [
  { id: 'valorant', label: 'Valorant', emoji: '🎯' },
  { id: 'league', label: 'League of Legends', emoji: '⚔️' },
  { id: 'dota2', label: 'Dota 2', emoji: '🛡️' },
  { id: 'cs2', label: 'CS2', emoji: '💣' },
  { id: 'overwatch', label: 'Overwatch', emoji: '🦾' },
];

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-8 py-10 shadow-sm text-center max-w-md w-full">
        {children}
      </div>
    </div>
  );
}

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

  if (!isLoaded || loadingMe) {
    return <CenteredCard><p className="text-zinc-500">Loading…</p></CenteredCard>;
  }
  if (!isSignedIn) {
    return <CenteredCard><p>Please sign in first.</p></CenteredCard>;
  }
  if (!me) {
    return (
      <CenteredCard>
        <p className="text-lg font-medium mb-2">Could not load your profile</p>
        {meError && <pre className="text-red-600 text-sm whitespace-pre-wrap">{meError}</pre>}
      </CenteredCard>
    );
  }
  if (me.role === 'BOOSTER') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">✅</div>
        <h1 className="text-2xl font-bold mb-2">You&apos;re already a booster</h1>
        <p className="text-zinc-500">Head to your dashboard to find jobs.</p>
      </CenteredCard>
    );
  }
  if (me.role === 'ADMIN') {
    return (
      <CenteredCard>
        <h1 className="text-xl font-bold">Admins can&apos;t apply</h1>
      </CenteredCard>
    );
  }
  if (existing?.status === 'PENDING') {
    return (
      <CenteredCard>
        <div className="text-5xl mb-3">⏳</div>
        <h1 className="text-2xl font-bold mb-2">Application under review</h1>
        <p className="text-zinc-500">We&apos;ll notify you once an admin reviews it.</p>
      </CenteredCard>
    );
  }

  const toggleGame = (g: string) => {
    setGames((curr) => (curr.includes(g) ? curr.filter((x) => x !== g) : [...curr, g]));
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
    <div className="min-h-[calc(100vh-4rem)] py-12 px-6 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Become a Booster</h1>
          <p className="text-zinc-500 mt-2">
            Tell us about your experience. An admin will review your application.
          </p>
        </div>

        {existing?.status === 'REJECTED' && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <p className="font-semibold text-red-800 dark:text-red-300">
              Previous application rejected
            </p>
            {existing.notes && (
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">{existing.notes}</p>
            )}
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">You may reapply below.</p>
          </div>
        )}

        <form
          onSubmit={submit}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 space-y-8 shadow-sm"
        >
          <section>
            <h2 className="text-lg font-semibold mb-1">Games</h2>
            <p className="text-sm text-zinc-500 mb-4">Select every game you can boost in.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GAMES.map((g) => {
                const selected = games.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGame(g.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-sm font-medium
                      ${
                        selected
                          ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-600/20'
                          : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                      }`}
                  >
                    <span>{g.emoji}</span>
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {games.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Your ranks</h2>
              {games.map((g) => {
                const meta = GAMES.find((x) => x.id === g)!;
                return (
                  <div key={g}>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                      {meta.emoji} {meta.label}
                    </label>
                    <input
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
                      value={ranks[g] ?? ''}
                      onChange={(e) => setRanks({ ...ranks, [g]: e.target.value })}
                      placeholder="e.g. Immortal 2, Diamond 1, etc."
                    />
                  </div>
                );
              })}
            </section>
          )}

          <section>
            <label className="block text-sm font-semibold mb-1.5">Experience</label>
            <p className="text-sm text-zinc-500 mb-2">
              Tournaments, peak ranks, hours played — anything that proves you can deliver.
            </p>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition resize-y"
              rows={5}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Tell us about your competitive history…"
            />
          </section>

          <section>
            <label className="block text-sm font-semibold mb-1.5">Discord (optional)</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="username"
            />
          </section>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || games.length === 0 || !experience.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-medium px-6 py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-purple-600/20"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      </div>
    </div>
  );
}
