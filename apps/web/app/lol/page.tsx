'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConfigField, ServiceConfigSchema } from '@repo/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type Rank = { id: string; tier: string; division: number | null; order: number };
type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  configSchema: ServiceConfigSchema;
  pricingModel: string;
  requiredBoosterTags: string[];
};
type Game = {
  id: string;
  slug: string;
  name: string;
  ranks: Rank[];
  services: Service[];
};
type PriceResp = {
  priceCents: number;
  platformFeeCents: number;
  boosterPayoutCents: number;
  currency: string;
  detail: any;
};

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  BOOST: { emoji: '🚀', label: 'Boost' },
  COACHING: { emoji: '🎓', label: 'Coaching' },
  PLACEMENT: { emoji: '🎯', label: 'Placement' },
  FARMING: { emoji: '⛏️', label: 'Farming' },
  COMPLETION: { emoji: '✅', label: 'Completion' },
  OTHER: { emoji: '🔧', label: 'Other' },
};

function rankLabel(r: Rank) {
  return r.division == null ? r.tier : `${r.tier} ${r.division}`;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function defaultConfig(fields: ConfigField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if ('default' in f && f.default !== undefined) out[f.key] = f.default;
    else if (f.type === 'boolean') out[f.key] = false;
    else if (f.type === 'number' && f.min !== undefined) out[f.key] = f.min;
  }
  return out;
}

export default function LolPage() {
  const [game, setGame] = useState<Game | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/games/lol`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setGame)
      .catch((e) => setLoadError(String(e.message ?? e)));
  }, []);

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto p-10 text-center">
        <p className="text-red-600">Failed to load catalog: {loadError}</p>
      </div>
    );
  }
  if (!game) {
    return <div className="max-w-3xl mx-auto p-10 text-center text-zinc-500">Loading…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-6 py-12">
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="mb-10">
          <div className="text-5xl mb-2">⚔️</div>
          <h1 className="text-4xl font-bold tracking-tight">
            {game.name}{' '}
            <span className="bg-linear-to-br from-brand-500 to-fuchsia-600 bg-clip-text text-transparent">
              services
            </span>
          </h1>
          <p className="text-zinc-500 mt-2">
            Pick a service, configure it, and see your price update live.
          </p>
        </div>

        {/* Service grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {game.services.map((s) => {
            const meta = CATEGORY_META[s.category] ?? CATEGORY_META.OTHER;
            const isSelected = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(isSelected ? null : s.id)}
                className={`text-left rounded-2xl border p-5 transition shadow-sm ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 shadow-md shadow-brand-600/10'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:border-brand-300 dark:hover:border-brand-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{meta!.emoji}</span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500">
                    {meta!.label}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-1">{s.name}</h3>
                <p className="text-sm text-zinc-500 line-clamp-2">{s.description}</p>
              </button>
            );
          })}
        </div>

        {/* Configurator */}
        {selectedId && (
          <ServiceConfigurator
            service={game.services.find((s) => s.id === selectedId)!}
            ranks={game.ranks}
          />
        )}
      </div>
    </div>
  );
}

function ServiceConfigurator({ service, ranks }: { service: Service; ranks: Rank[] }) {
  const [config, setConfig] = useState<Record<string, unknown>>(() =>
    defaultConfig(service.configSchema.fields),
  );
  const [price, setPrice] = useState<PriceResp | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricing, setPricing] = useState(false);

  // Reset when service changes
  useEffect(() => {
    setConfig(defaultConfig(service.configSchema.fields));
    setPrice(null);
    setPriceError(null);
  }, [service.id]);

  // Debounced price preview
  useEffect(() => {
    const handle = setTimeout(async () => {
      setPricing(true);
      setPriceError(null);
      try {
        const res = await fetch(`${API_URL}/pricing/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId: service.id, config }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message ?? `${res.status} ${res.statusText}`);
        }
        setPrice(await res.json());
      } catch (e: any) {
        setPriceError(String(e.message ?? e));
        setPrice(null);
      } finally {
        setPricing(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [service.id, JSON.stringify(config)]);

  const update = (key: string, value: unknown) => setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="grid md:grid-cols-[1fr_320px] gap-6">
      {/* Form */}
      <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <h2 className="text-xl font-semibold mb-4">{service.name}</h2>
        <div className="space-y-4">
          {service.configSchema.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={config[field.key]}
              ranks={ranks}
              onChange={(v) => update(field.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Price card */}
      <aside className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 h-fit md:sticky md:top-20">
        <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Price</div>
        {priceError ? (
          <p className="text-sm text-red-600">{priceError}</p>
        ) : price ? (
          <>
            <div className="text-4xl font-bold tracking-tight">
              {dollars(price.priceCents)}
              {pricing && <span className="text-xs text-zinc-400 ml-2 align-middle">updating…</span>}
            </div>
            <p className="text-xs text-zinc-500 mt-1">USD, price snapshot at order time.</p>
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-1 text-xs text-zinc-500">
              <div className="flex justify-between">
                <span>Booster payout</span>
                <span>{dollars(price.boosterPayoutCents)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform fee</span>
                <span>{dollars(price.platformFeeCents)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Fill in the form to see a price.</p>
        )}
        <button
          disabled
          className="mt-5 w-full bg-brand-600/60 text-white font-medium px-4 py-2.5 rounded-xl cursor-not-allowed"
          title="Checkout not wired yet"
        >
          Place Order (coming soon)
        </button>
      </aside>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  ranks,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  ranks: Rank[];
}) {
  const baseInput =
    'w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition';

  if (field.type === 'rank') {
    return (
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">{field.label}</span>
        <select
          className={baseInput}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Select…</option>
          {ranks.map((r) => (
            <option key={r.id} value={r.id}>
              {rankLabel(r)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500/40"
        />
        <span className="text-sm font-medium">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'number') {
    return (
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">{field.label}</span>
        <input
          type="number"
          className={baseInput}
          min={field.min}
          max={field.max}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
    );
  }

  if (field.type === 'enum') {
    return (
      <label className="block">
        <span className="block text-sm font-medium mb-1.5">{field.label}</span>
        <select
          className={baseInput}
          value={(value as string) ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // string
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{field.label}</span>
      <textarea
        className={`${baseInput} min-h-[80px] resize-y`}
        maxLength={field.maxLength}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
