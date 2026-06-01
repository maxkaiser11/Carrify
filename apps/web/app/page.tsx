import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { RoleButtons } from './role-buttons';
import { GAMES } from '../lib/games';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant matching',
    body: 'Get paired with a vetted pro in under 5 minutes. No bidding, no waiting.',
  },
  {
    icon: '🔒',
    title: 'Account safety',
    body: 'VPN-matched logins, encrypted credentials, and zero-log sessions by default.',
  },
  {
    icon: '🏅',
    title: 'Verified boosters',
    body: 'Every booster is rank-verified and reviewed by our admin team before going live.',
  },
  {
    icon: '💸',
    title: 'Pay on completion',
    body: 'Funds are held in escrow and only released once your order is delivered.',
  },
];

const STEPS = [
  { n: '01', title: 'Pick your game', body: 'Choose your title and the rank you want to reach.' },
  { n: '02', title: 'Get matched', body: 'We assign a vetted booster who specializes in your game.' },
  { n: '03', title: 'Climb', body: 'Track progress live and chat with your booster anytime.' },
];

export default async function Home() {
  const user = await currentUser();

  return (
    <div className="relative">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] grid-bg" />
        <div className="absolute -top-20 -left-32 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl animate-blob" />
        <div
          className="absolute top-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl animate-blob"
          style={{ animationDelay: '-4s' }}
        />
      </div>

      {/* Hero */}
      <section className="px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 dark:border-brand-800/60 bg-brand-50/60 dark:bg-brand-950/40 text-xs font-medium text-brand-700 dark:text-brand-300 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-600" />
            </span>
            247 boosters online right now
          </div>

          <h1 className="mt-6 text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
            Climb faster.{' '}
            <span className="bg-linear-to-br from-brand-400 via-brand-600 to-fuchsia-600 bg-clip-text text-transparent">
              Play harder.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Carrify connects you with verified pros to boost your rank, complete placements, and
            coach you to the next tier — across every major competitive title.
          </p>

          {user?.firstName && (
            <p className="mt-6 text-base text-zinc-500">
              Welcome back, <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.firstName}</span>{' '}
              <span className="animate-float inline-block">👋</span>
            </p>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
            {user ? (
              <RoleButtons />
            ) : (
              <>
                <Link
                  href="/apply"
                  className="group relative inline-flex items-center gap-2 px-7 h-12 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/30 transition overflow-hidden"
                >
                  <span className="absolute inset-0 shimmer" />
                  <span className="relative">Get started</span>
                  <span className="relative transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 px-6 h-12 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur hover:bg-white dark:hover:bg-zinc-900 transition font-medium"
                >
                  How it works
                </a>
              </>
            )}
          </div>

          {/* Trust strip */}
          <div className="mt-16 grid grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[
              { stat: '12k+', label: 'Orders completed' },
              { stat: '4.9★', label: 'Avg. rating' },
              { stat: '< 5m', label: 'Match time' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold bg-linear-to-br from-brand-500 to-fuchsia-600 bg-clip-text text-transparent">
                  {s.stat}
                </div>
                <div className="text-xs sm:text-sm text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Supported games</h2>
            <p className="mt-3 text-zinc-500">From tac-shooters to MOBAs — we&apos;ve got pros for every grind.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {GAMES.map((g) => {
              const cardClass =
                'group relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur p-5 text-center transition hover:-translate-y-1 hover:border-brand-400 hover:shadow-lg hover:shadow-brand-500/10';
              const inner = (
                <>
                  <div className={`absolute inset-0 bg-linear-to-br ${g.accent} opacity-0 group-hover:opacity-100 transition`} />
                  <div className="relative">
                    <div className="text-4xl mb-2">{g.emoji}</div>
                    <div className="text-sm font-medium">{g.name}</div>
                    {!g.available && (
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        Coming soon
                      </div>
                    )}
                  </div>
                </>
              );

              return g.available ? (
                <Link key={g.name} href={g.href} className={cardClass}>
                  {inner}
                </Link>
              ) : (
                <div key={g.name} className={`${cardClass} cursor-not-allowed opacity-70`}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
              Why Carrify
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Built for serious climbers</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-6 hover:border-brand-400 transition"
              >
                <div className="h-12 w-12 rounded-xl bg-linear-to-br from-brand-500 to-fuchsia-600 text-white text-2xl flex items-center justify-center shadow-md shadow-brand-600/20">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How it works</h2>
            <p className="mt-3 text-zinc-500">Three steps from queue dodger to ranked terror.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 relative">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-7"
              >
                <div className="text-5xl font-bold bg-linear-to-br from-brand-500/30 to-brand-700/10 bg-clip-text text-transparent">
                  {s.n}
                </div>
                <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{s.body}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 text-brand-400">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24 pt-10">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-600 via-brand-700 to-fuchsia-700 p-10 sm:p-14 text-center text-white shadow-2xl shadow-brand-700/30">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-fuchsia-300/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Got the skill? Get paid.</h2>
              <p className="mt-3 text-brand-100 max-w-xl mx-auto">
                Top boosters on Carrify earn $2k+/month playing the games they already grind. Apply
                in under 3 minutes.
              </p>
              <div className="mt-7">
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-2 px-7 h-12 rounded-full bg-white text-brand-700 hover:bg-brand-50 font-semibold shadow-lg transition"
                >
                  Apply as a booster →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 pb-10">
        <div className="max-w-6xl mx-auto pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
          <div>© {new Date().getFullYear()} Carrify. All rights reserved.</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition">Terms</a>
            <a href="#" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition">Privacy</a>
            <a href="#" className="hover:text-zinc-800 dark:hover:text-zinc-200 transition">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
