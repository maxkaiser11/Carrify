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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.message ?? `${res.status} ${res.statusText}`;
        const err = new Error(Array.isArray(msg) ? msg.join('; ') : String(msg)) as Error & {
          status?: number;
          body?: unknown;
        };
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return res.json() as Promise<T>;
    },
    [getToken],
  );
}
