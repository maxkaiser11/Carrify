'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    },
    [getToken],
  );
}
