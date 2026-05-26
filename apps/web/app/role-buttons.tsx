'use client';

import Link from 'next/link';
import { useMe } from '../lib/use-me';

export function RoleButtons() {
  const { me, loading } = useMe();

  if (loading || !me) return null;

  if (me.role === 'ADMIN') {
    return (
      <Link href="/admin/applications"
        className="bg-purple-700 text-white rounded-full font-medium h-12 px-6 flex items-center">
        Admin Panel
      </Link>
    );
  }

  if (me.role === 'CUSTOMER') {
    return (
      <Link href="/apply"
        className="bg-purple-700 text-white rounded-full font-medium h-12 px-6 flex items-center">
        Apply as Booster
      </Link>
    );
  }

  if (me.role === 'BOOSTER') {
    return (
      <span className="text-green-600 font-medium">You&apos;re a booster ✅</span>
    );
  }

  return null;
}
