'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  { id: 'apex', label: 'Apex Legends', emoji: '🏆' },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-6">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

function StatusCard({
  emoji,
  title,
  body,
  cta,
}: {
  emoji: string;
  title: string;
  body?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <Shell>
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-10 text-center shadow-xl shadow-brand-900/5">
        <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative">
          <div className="text-6xl mb-4">{emoji}</div>
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          {body && <p className="text-zinc-500">{body}</p>}
          {cta && (
            <Link
              href={cta.href}
              className="mt-6 inline-flex items-center gap-2 px-6 h-11 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-medium transition shadow-md shadow-brand-600/20"
            >
              {cta.label} →
            </Link>
          )}
        </div>
      </div>
    </Shell>
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

  const progress = useMemo(() => {
    let done = 0;
    if (games.length > 0) done++;
    if (games.length > 0 && games.every((g) => ranks[g]?.trim())) done++;
    if (experience.trim().length >= 30) done++;
    return Math.round((done / 3) * 100);
  }, [games, ranks, experience]);

  if (!isLoaded || loadingMe) {
    return <StatusCard emoji="⏳" title="Loading…" />;
  }
  if (!isSignedIn) {
    return (
      <StatusCard
        emoji="🔒"
        title="Sign in to apply"
        body="You need a Carrify account to submit a booster application."
        cta={{ href: '/', label: 'Back to home' }}
      />
    );
  }
  if (!me) {
    return (
      <Shell>
        <div className="rounded-3xl border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/40 p-8 text-center">
          <p className="text-lg font-medium mb-2">Could not load your profile</p>
          {meError && (
            <pre className="text-red-700 dark:text-red-400 text-sm whitespace-pre-wrap">{meError}</pre>
          )}
        </div>
      </Shell>
    );
  }
  if (me.role === 'BOOSTER') {
    return (
      <StatusCard
        emoji="✅"
        title="You're already a booster"
        body="Head to your dashboard to find jobs."
        cta={{ href: '/', label: 'Go to dashboard' }}
      />
    );
  }
  if (me.role === 'ADMIN') {
    return (
      <StatusCard
        emoji="🛡️"
        title="Admins can't apply"
        body="Use a customer account to submit a booster application."
      />
    );
  }
  if (existing?.status === 'PENDING') {
    return (
      <StatusCard
        emoji="⏳"
        title="Application under review"
        body="We'll notify you once an admin reviews it. Usually within 24 hours."
      />
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

  const canSubmit = games.length > 0 && experience.trim().length >= 30 && !submitting;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
            Booster onboarding
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Become a{' '}
            <span className="bg-linear-to-br from-brand-500 to-fuchsia-600 bg-clip-text text-transparent">
              Carrify pro
            </span>
          </h1>
          <p className="text-zinc-500 mt-3">
            Tell us about your competitive history. Reviews usually take under 24 hours.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs font-medium text-zinc-500 mb-2">
            <span>Application progress</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-brand-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {existing?.status === 'REJECTED' && (
          <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/40 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">
                  Previous application rejected
                </p>
                {existing.notes && (
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    <span className="font-medium">Reviewer notes:</span> {existing.notes}
                  </p>
                )}
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  You may reapply below with updated info.
                </p>
              </div>
            </div>
          </div>
        )}

        <form
          onSubmit={submit}
          className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 space-y-8 shadow-xl shadow-brand-900/5"
        >
          {/* Games */}
          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-lg font-semibold">
                <span className="text-brand-600 dark:text-brand-400">1.</span> Games
              </h2>
              <span className="text-xs text-zinc-500">{games.length} selected</span>
            </div>
            <p className="text-sm text-zinc-500 mb-4">Select every game you can boost in.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GAMES.map((g) => {
                const selected = games.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGame(g.id)}
                    className={`relative flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                      ${
                        selected
                          ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-600/30 scale-[1.02]'
                          : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30'
                      }`}
                  >
                    <span className="text-base">{g.emoji}</span>
                    <span className="truncate">{g.label}</span>
                    {selected && (
                      <span className="absolute top-1.5 right-1.5 text-[10px]">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Ranks */}
          {games.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">
                <span className="text-brand-600 dark:text-brand-400">2.</span> Your ranks
              </h2>
              <p className="text-sm text-zinc-500 -mt-2">Be honest — we verify.</p>
              {games.map((g) => {
                const meta = GAMES.find((x) => x.id === g)!;
                return (
                  <div key={g}>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-700 dark:text-zinc-300">
                      {meta.emoji} {meta.label}
                    </label>
                    <input
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition"
                      value={ranks[g] ?? ''}
                      onChange={(e) => setRanks({ ...ranks, [g]: e.target.value })}
                      placeholder="e.g. Immortal 2, Diamond 1…"
                    />
                  </div>
                );
              })}
            </section>
          )}

          {/* Experience */}
          <section>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-lg font-semibold">
                <span className="text-brand-600 dark:text-brand-400">3.</span> Experience
              </h2>
              <span
                className={`text-xs tabular-nums ${
                  experience.trim().length >= 30 ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'
                }`}
              >
                {experience.trim().length} / 30 min
              </span>
            </div>
            <p className="text-sm text-zinc-500 mb-2">
              Tournaments, peak ranks, hours played — anything that proves you can deliver.
            </p>
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition resize-y"
              rows={5}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Tell us about your competitive history…"
            />
          </section>

          {/* Discord */}
          <section>
            <label className="block text-sm font-semibold mb-1.5">
              <span className="text-brand-600 dark:text-brand-400">4.</span> Discord{' '}
              <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <p className="text-sm text-zinc-500 mb-2">So we can reach out faster.</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">@</span>
              <input
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition"
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="username"
              />
            </div>
          </section>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="relative w-full bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-medium px-6 py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-600/20 overflow-hidden"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Submitting…
              </span>
            ) : (
              <>Submit application →</>
            )}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            By submitting, you agree to our terms and confirm your info is accurate.
          </p>
        </form>
      </div>
    </div>
  );
}
