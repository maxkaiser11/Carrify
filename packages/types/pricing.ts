import { z } from 'zod';

export const PricingModel = z.enum(['RANK_MATRIX', 'PER_UNIT', 'TIERED', 'FLAT']);
export type PricingModel = z.infer<typeof PricingModel>;

const positiveInt = z.number().int().nonnegative();
const positiveMultiplier = z.number().positive();

export const RankMatrixPricing = z.object({
  basePriceCents: positiveInt,
  perDivisionCents: positiveInt,
  tierMultipliers: z.record(z.string(), positiveMultiplier),
  modifiers: z.record(z.string(), positiveMultiplier).default({}),
});
export type RankMatrixPricing = z.infer<typeof RankMatrixPricing>;

export const PerUnitPricing = z.object({
  pricePerUnitCents: positiveInt,
  unitName: z.string().min(1),
  minUnits: z.number().int().positive(),
  maxUnits: z.number().int().positive(),
}).refine((d) => d.maxUnits >= d.minUnits, { message: 'maxUnits must be >= minUnits' });
export type PerUnitPricing = z.infer<typeof PerUnitPricing>;

export const TieredPricing = z.object({
  tiers: z.array(z.object({
    upTo: z.number().int().positive(),
    perUnitCents: positiveInt,
  })).min(1).refine(
    (tiers) => tiers.every((t, i) => i === 0 || t.upTo > tiers[i - 1]!.upTo),
    { message: 'tiers must be sorted ascending by upTo' },
  ),
});
export type TieredPricing = z.infer<typeof TieredPricing>;

export const FlatPricing = z.object({
  priceCents: positiveInt,
});
export type FlatPricing = z.infer<typeof FlatPricing>;

// Discriminated union keyed off PricingModel — used when pricing model isn't known at read time.
export const PricingData = z.discriminatedUnion('model', [
  z.object({ model: z.literal('RANK_MATRIX'), data: RankMatrixPricing }),
  z.object({ model: z.literal('PER_UNIT'),    data: PerUnitPricing }),
  z.object({ model: z.literal('TIERED'),      data: TieredPricing }),
  z.object({ model: z.literal('FLAT'),        data: FlatPricing }),
]);
export type PricingData = z.infer<typeof PricingData>;

export function parsePricingData(model: PricingModel, raw: unknown) {
  switch (model) {
    case 'RANK_MATRIX': return RankMatrixPricing.parse(raw);
    case 'PER_UNIT':    return PerUnitPricing.parse(raw);
    case 'TIERED':      return TieredPricing.parse(raw);
    case 'FLAT':        return FlatPricing.parse(raw);
  }
}
