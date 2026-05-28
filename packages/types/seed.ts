import { z } from 'zod';
import { PricingModel, RankMatrixPricing, PerUnitPricing, TieredPricing, FlatPricing } from './pricing.js';
import { ServiceConfigSchema } from './service-config.js';

export const ServiceCategory = z.enum(['BOOST', 'COACHING', 'FARMING', 'COMPLETION', 'PLACEMENT', 'OTHER']);

export const GameSeed = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  iconUrl: z.string().url().nullish(),
  isActive: z.boolean().default(true),
});
export type GameSeed = z.infer<typeof GameSeed>;

export const RankSeed = z.object({
  tier: z.string().min(1),
  division: z.number().int().positive().nullable(),
  iconUrl: z.string().url().nullish(),
});
export type RankSeed = z.infer<typeof RankSeed>;

export const RanksSeed = z.object({
  // Ordered low → high; `order` is assigned by index at seed time.
  ranks: z.array(RankSeed).min(1),
});
export type RanksSeed = z.infer<typeof RanksSeed>;

// Each service JSON declares its pricing model up-front; we pick the matching
// pricing schema based on it. This is enforced via a discriminated union so a
// service file with `pricingModel: PER_UNIT` but rank-matrix-shaped data fails fast.
const serviceBase = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: ServiceCategory,
  configSchema: ServiceConfigSchema,
  requiredBoosterTags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const ServiceSeed = z.discriminatedUnion('pricingModel', [
  serviceBase.extend({ pricingModel: z.literal('RANK_MATRIX'), pricingData: RankMatrixPricing }),
  serviceBase.extend({ pricingModel: z.literal('PER_UNIT'),    pricingData: PerUnitPricing }),
  serviceBase.extend({ pricingModel: z.literal('TIERED'),      pricingData: TieredPricing }),
  serviceBase.extend({ pricingModel: z.literal('FLAT'),        pricingData: FlatPricing }),
]);
export type ServiceSeed = z.infer<typeof ServiceSeed>;

// Admin form payload — same as ServiceSeed but with gameId.
const adminBase = serviceBase.extend({ gameId: z.string().min(1) });
export const CreateServiceInput = z.discriminatedUnion('pricingModel', [
  adminBase.extend({ pricingModel: z.literal('RANK_MATRIX'), pricingData: RankMatrixPricing }),
  adminBase.extend({ pricingModel: z.literal('PER_UNIT'),    pricingData: PerUnitPricing }),
  adminBase.extend({ pricingModel: z.literal('TIERED'),      pricingData: TieredPricing }),
  adminBase.extend({ pricingModel: z.literal('FLAT'),        pricingData: FlatPricing }),
]);
export type CreateServiceInput = z.infer<typeof CreateServiceInput>;
