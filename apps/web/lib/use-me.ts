'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useApi } from './api';
import type { DbUser } from '@repo/types';

export function useMe() {
  const { isSignedIn, isLoaded } = useAuth();
  const api = useApi();
  const [me, setMe] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setMe(null); setLoading(false); return; }
    setLoading(true);
    api<DbUser>('/auth/me')
      .then((u) => { setMe(u); setError(null); })
      .catch((e) => { setMe(null); setError(String(e?.message ?? e)); })
      .finally(() => setLoading(false));
  }, [api, isSignedIn, isLoaded]);

  return { me, loading, error };
}
