'use client';

import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useMe } from '../lib/use-me';

export function Nav() {
  const { me } = useMe();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight bg-gradient-to-br from-purple-500 to-purple-800 bg-clip-text text-transparent">
          Carrify
        </Link>

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
