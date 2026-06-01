'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useMe } from '../lib/use-me';
import { GAMES } from '../lib/games';

export function Nav() {
  const { me } = useMe();
  const [gamesOpen, setGamesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the games menu on outside click or Escape.
  useEffect(() => {
    if (!gamesOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setGamesOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setGamesOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [gamesOpen]);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2" ref={menuRef}>
          {/* Games hamburger menu */}
          <button
            type="button"
            aria-label="Browse games"
            aria-expanded={gamesOpen}
            onClick={() => setGamesOpen((v) => !v)}
            className="flex items-center gap-2 px-3 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-sm font-medium"
          >
            <span className="flex flex-col gap-0.75">
              <span className="block h-0.5 w-4 bg-current rounded-full" />
              <span className="block h-0.5 w-4 bg-current rounded-full" />
              <span className="block h-0.5 w-4 bg-current rounded-full" />
            </span>
            <span className="hidden sm:inline">Games</span>
          </button>

          {gamesOpen && (
            <div className="absolute left-6 top-14 w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md shadow-xl shadow-black/5 p-2">
              {GAMES.map((g) =>
                g.available ? (
                  <Link
                    key={g.name}
                    href={g.href}
                    onClick={() => setGamesOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="text-sm font-medium">{g.name}</span>
                  </Link>
                ) : (
                  <div
                    key={g.name}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl opacity-60 cursor-not-allowed"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-xl">{g.emoji}</span>
                      <span className="text-sm font-medium">{g.name}</span>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      Soon
                    </span>
                  </div>
                ),
              )}
            </div>
          )}

          <Link href="/" className="font-bold text-lg tracking-tight bg-gradient-to-br from-purple-500 to-purple-800 bg-clip-text text-transparent">
            Carrify
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton>
              <button className="text-sm font-medium px-4 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 h-9 rounded-full transition shadow-md shadow-purple-600/20">
                Sign Up
              </button>
            </SignUpButton>
          </Show>

          <Show when="signed-in">
            {me?.role === 'CUSTOMER' && (
              <Link
                href="/apply"
                className="text-sm font-medium px-4 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center"
              >
                Become a Booster
              </Link>
            )}
            {me?.role === 'BOOSTER' && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900">
                BOOSTER
              </span>
            )}
            {me?.role === 'ADMIN' && (
              <>
                <Link
                  href="/admin/applications"
                  className="text-sm font-medium px-3 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center"
                >
                  🛡️ Applications
                </Link>
                <Link
                  href="/admin/services"
                  className="text-sm font-medium px-3 h-9 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center"
                >
                  🛒 Services
                </Link>
              </>
            )}
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
