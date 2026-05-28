'use client';

import { useEffect, useState } from 'react';
import { useApi } from '../../../lib/api';
import { useMe } from '../../../lib/use-me';

type GameSummary = { id: string; slug: string; name: string };
type AdminService = {
  id: string;
  slug: string;
  name: string;
  category: string;
  pricingModel: string;
  isActive: boolean;
  game: { slug: string; name: string };
};

const PRICING_MODELS = ['RANK_MATRIX', 'PER_UNIT', 'TIERED', 'FLAT'] as const;
const CATEGORIES = ['BOOST', 'COACHING', 'FARMING', 'COMPLETION', 'PLACEMENT', 'OTHER'] as const;

const PRICING_TEMPLATES: Record<(typeof PRICING_MODELS)[number], string> = {
  RANK_MATRIX: JSON.stringify(
    {
      basePriceCents: 200,
      perDivisionCents: 250,
      tierMultipliers: { Bronze: 1.0, Silver: 1.2, Gold: 1.6 },
      modifiers: { soloOnly: 1.4 },
    },
    null,
    2,
  ),
  PER_UNIT: JSON.stringify(
    { pricePerUnitCents: 3500, unitName: 'hour', minUnits: 1, maxUnits: 20 },
    null,
    2,
  ),
  TIERED: JSON.stringify(
    { tiers: [{ upTo: 5, perUnitCents: 1500 }, { upTo: 10, perUnitCents: 1200 }] },
    null,
    2,
  ),
  FLAT: JSON.stringify({ priceCents: 4999 }, null, 2),
};

const CONFIG_TEMPLATE = JSON.stringify(
  {
    fields: [
      { key: 'fromRankId', label: 'Current rank', type: 'rank', required: true },
      { key: 'toRankId', label: 'Target rank', type: 'rank', required: true },
    ],
  },
  null,
  2,
);

export default function AdminServicesPage() {
  const api = useApi();
  const { me, loading: loadingMe } = useMe();

  const [games, setGames] = useState<GameSummary[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [g, s] = await Promise.all([
        api<GameSummary[]>('/games'),
        api<AdminService[]>('/admin/services'),
      ]);
      setGames(g);
      setServices(s);
      setLoaded(true);
    } catch (e: any) {
      setListError(String(e.message ?? e));
    }
  };

  useEffect(() => {
    if (me?.role === 'ADMIN') refresh();
  }, [me?.role]);

  if (loadingMe) return <div className="p-10 text-center text-zinc-500">Loading…</div>;
  if (me?.role !== 'ADMIN') {
    return (
      <div className="p-10 text-center">
        <p className="text-zinc-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="text-zinc-500 mt-1">Carrify defines what's for sale. Boosters claim, never create.</p>
        </div>

        <CreateServiceForm games={games} onCreated={refresh} />

        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-3">All services</h2>
          {listError && <p className="text-sm text-red-600 mb-3">{listError}</p>}
          {!loaded ? (
            <p className="text-zinc-500 text-sm">Loading…</p>
          ) : services.length === 0 ? (
            <p className="text-zinc-500 text-sm">No services yet.</p>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-2">Game</th>
                    <th className="text-left px-4 py-2">Slug</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Category</th>
                    <th className="text-left px-4 py-2">Pricing</th>
                    <th className="text-left px-4 py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-2">{s.game.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s.slug}</td>
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2">{s.category}</td>
                      <td className="px-4 py-2">{s.pricingModel}</td>
                      <td className="px-4 py-2">{s.isActive ? '✅' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateServiceForm({ games, onCreated }: { games: GameSummary[]; onCreated: () => void }) {
  const api = useApi();

  const [gameId, setGameId] = useState('');
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('BOOST');
  const [pricingModel, setPricingModel] = useState<(typeof PRICING_MODELS)[number]>('RANK_MATRIX');
  const [pricingDataText, setPricingDataText] = useState(PRICING_TEMPLATES.RANK_MATRIX);
  const [configSchemaText, setConfigSchemaText] = useState(CONFIG_TEMPLATE);
  const [requiredTags, setRequiredTags] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: (string | number)[]; message: string }[]>([]);

  // Swap pricingData template when model changes (only if user hasn't started editing)
  useEffect(() => {
    setPricingDataText(PRICING_TEMPLATES[pricingModel]);
  }, [pricingModel]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIssues([]);

    let configSchema: unknown;
    let pricingData: unknown;
    try {
      configSchema = JSON.parse(configSchemaText);
    } catch (err: any) {
      setError(`configSchema is not valid JSON: ${err.message}`);
      return;
    }
    try {
      pricingData = JSON.parse(pricingDataText);
    } catch (err: any) {
      setError(`pricingData is not valid JSON: ${err.message}`);
      return;
    }

    setSubmitting(true);
    try {
      await api('/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          slug,
          name,
          description,
          category,
          pricingModel,
          pricingData,
          configSchema,
          requiredBoosterTags: requiredTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          isActive,
        }),
      });
      setSuccess(`Created “${name}”`);
      setSlug('');
      setName('');
      setDescription('');
      onCreated();
    } catch (err: any) {
      // Try to extract Zod issues from the error body — useApi throws a plain Error with status text.
      // For richer feedback we'd return the body; keeping it simple for now.
      setError(String(err.message ?? err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 space-y-5"
    >
      <h2 className="text-lg font-semibold">Create new service</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <Labeled label="Game">
          <select
            required
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select a game…</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Slug (URL-safe id)">
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="rank-boost"
            className={inputCls}
          />
        </Labeled>
        <Labeled label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Labeled>
        <Labeled label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className={inputCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Pricing model" className="sm:col-span-1">
          <select
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as any)}
            className={inputCls}
          >
            {PRICING_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Required booster tags (comma-separated)">
          <input
            value={requiredTags}
            onChange={(e) => setRequiredTags(e.target.value)}
            placeholder="dota2, coach"
            className={inputCls}
          />
        </Labeled>
      </div>

      <Labeled label="Description">
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </Labeled>

      <Labeled label="configSchema (JSON)">
        <textarea
          value={configSchemaText}
          onChange={(e) => setConfigSchemaText(e.target.value)}
          rows={10}
          className={`${inputCls} font-mono text-xs resize-y`}
          spellCheck={false}
        />
      </Labeled>

      <Labeled label={`pricingData (JSON for ${pricingModel})`}>
        <textarea
          value={pricingDataText}
          onChange={(e) => setPricingDataText(e.target.value)}
          rows={10}
          className={`${inputCls} font-mono text-xs resize-y`}
          spellCheck={false}
        />
      </Labeled>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500/40"
        />
        Active (visible to buyers)
      </label>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {issues.length > 0 && (
        <ul className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm space-y-1">
          {issues.map((i, idx) => (
            <li key={idx}>
              <span className="font-mono text-xs">{i.path.join('.')}</span> — {i.message}
            </li>
          ))}
        </ul>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3 rounded-xl transition disabled:opacity-50 shadow-md shadow-brand-600/20"
      >
        {submitting ? 'Creating…' : 'Create service'}
      </button>
    </form>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition';

function Labeled({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
    </label>
  );
}
