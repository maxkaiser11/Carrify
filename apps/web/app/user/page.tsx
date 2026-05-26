'use client';

import { useEffect, useState } from 'react';
import { useApi } from '../../lib/api';

type DbUser = {
  id: number;
  clerkId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export default function UserPage() {
  const api = useApi();
  const [user, setUser] = useState<DbUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DbUser>('/auth/me')
      .then(setUser)
      .catch((e) => setError(String(e)));
  }, [api]);

  if (error) return <pre style={{ color: 'red' }}>{error}</pre>;
  if (!user) return <p>Loading…</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>DB user row</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}
