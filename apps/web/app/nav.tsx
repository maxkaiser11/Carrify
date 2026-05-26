'use client';

import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useMe } from '../lib/use-me';

export function Nav() {
  const { me } = useMe();

  return (
    <header className="flex justify-end items-center p-4 gap-4 h-16">
      <Show when="signed-out">
        <SignInButton />
        <SignUpButton>
          <button className="bg-purple-700 text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer">
            Sign Up
          </button>
        </SignUpButton>
      </Show>

      <Show when="signed-in">
        {me?.role === 'CUSTOMER' && <Link href="/apply">Become a Booster</Link>}
        {me?.role === 'BOOSTER' && <span className="text-green-600">Booster</span>}
        {me?.role === 'ADMIN' && <Link href="/admin/applications">Admin</Link>}
        <UserButton />
      </Show>
    </header>
  );
}
