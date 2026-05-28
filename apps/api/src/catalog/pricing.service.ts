import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  parsePricingData,
  RankMatrixPricing,
  PerUnitPricing,
  TieredPricing,
  FlatPricing,
  PricingModel,
} from '@repo/types';

export type PriceBreakdown = {
  priceCents: number;
  platformFeeCents: number;
  boosterPayoutCents: number;
  currency: 'USD';
  detail: Record<string, unknown>;
};

const PLATFORM_TAKE = 0.2; // 20% — see CLAUDE.md "Platform take: 20% by default"

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async preview(serviceId: string, config: Record<string, unknown>): Promise<PriceBreakdown> {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new BadRequestException('Service not found');

    const pricing = parsePricingData(service.pricingModel as PricingModel, service.pricingData);

    let priceCents: number;
    let detail: Record<string, unknown>;

    switch (service.pricingModel) {
      case 'RANK_MATRIX':
        ({ priceCents, detail } = await this.calcRankMatrix(pricing as RankMatrixPricing, config, service.gameId));
        break;
      case 'PER_UNIT':
        ({ priceCents, detail } = this.calcPerUnit(pricing as PerUnitPricing, config));
        break;
      case 'TIERED':
        ({ priceCents, detail } = this.calcTiered(pricing as TieredPricing, config));
        break;
      case 'FLAT':
        priceCents = (pricing as FlatPricing).priceCents;
        detail = {};
        break;
      default:
        throw new BadRequestException(`Unknown pricing model: ${service.pricingModel}`);
    }

    const platformFeeCents = Math.round(priceCents * PLATFORM_TAKE);
    const boosterPayoutCents = priceCents - platformFeeCents;
    return { priceCents, platformFeeCents, boosterPayoutCents, currency: 'USD', detail };
  }

  private async calcRankMatrix(data: RankMatrixPricing, config: Record<string, unknown>, gameId: string) {
    const fromRankId = typeof config.fromRankId === 'string' ? config.fromRankId : null;
    const toRankId = typeof config.toRankId === 'string' ? config.toRankId : null;
    if (!fromRankId || !toRankId) throw new BadRequestException('fromRankId and toRankId required');

    const ranks = await this.prisma.rank.findMany({ where: { gameId }, orderBy: { order: 'asc' } });
    const fromIdx = ranks.findIndex((r) => r.id === fromRankId);
    const toIdx = ranks.findIndex((r) => r.id === toRankId);
    if (fromIdx < 0 || toIdx < 0) throw new BadRequestException('Invalid rank id');
    if (toIdx <= fromIdx) throw new BadRequestException('Target rank must be higher than current rank');

    let priceCents = data.basePriceCents;
    const steps: { tier: string; multiplier: number; deltaCents: number }[] = [];
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const tier = ranks[i]!.tier;
      const mult = data.tierMultipliers[tier] ?? 1;
      const delta = Math.round(data.perDivisionCents * mult);
      priceCents += delta;
      steps.push({ tier, multiplier: mult, deltaCents: delta });
    }

    const activeModifiers: { key: string; multiplier: number }[] = [];
    let modMultiplier = 1;
    for (const [key, mult] of Object.entries(data.modifiers)) {
      if (config[key] === true) {
        modMultiplier *= mult;
        activeModifiers.push({ key, multiplier: mult });
      }
    }
    priceCents = Math.round(priceCents * modMultiplier);

    return { priceCents, detail: { steps, activeModifiers, baseCents: data.basePriceCents } };
  }

  private calcPerUnit(data: PerUnitPricing, config: Record<string, unknown>) {
    const raw = Number(config.hours ?? config.units ?? config.matches);
    if (!Number.isFinite(raw)) throw new BadRequestException(`${data.unitName} required`);
    const units = Math.max(data.minUnits, Math.min(data.maxUnits, Math.floor(raw)));
    return {
      priceCents: units * data.pricePerUnitCents,
      detail: { units, unitName: data.unitName, perUnitCents: data.pricePerUnitCents },
    };
  }

  private calcTiered(data: TieredPricing, config: Record<string, unknown>) {
    const raw = Number(config.matches ?? config.units ?? config.hours);
    if (!Number.isFinite(raw) || raw < 1) throw new BadRequestException('units must be >= 1');
    const units = Math.floor(raw);
    const tier = data.tiers.find((t) => units <= t.upTo) ?? data.tiers[data.tiers.length - 1]!;
    return {
      priceCents: units * tier.perUnitCents,
      detail: { units, perUnitCents: tier.perUnitCents, tierUpTo: tier.upTo },
    };
  }
}
