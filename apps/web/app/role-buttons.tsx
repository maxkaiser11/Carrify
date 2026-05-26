'use client';

import Link from 'next/link';
import { useMe } from '../lib/use-me';

const buttonBase =
  'inline-flex items-center gap-2 px-6 h-12 rounded-full font-medium transition shadow-md';

export function RoleButtons() {
  const { me, loading } = useMe();

  if (loading || !me) return null;

  if (me.role === 'ADMIN') {
    return (
      <Link
        href="/admin/applications"
        className={`${buttonBase} bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/30`}
      >
        🛡️ Admin Panel
      </Link>
    );
  }

  if (me.role === 'CUSTOMER') {
    return (
      <Link
        href="/apply"
        className={`${buttonBase} bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/30`}
      >
        🚀 Apply as Booster
      </Link>
    );
  }

  if (me.role === 'BOOSTER') {
    return (
      <span className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900 font-medium">
        ✅ You&apos;re a booster
      </span>
    );
  }

  return null;
}
