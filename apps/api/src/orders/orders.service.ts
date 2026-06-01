import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Stripe } from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../catalog/pricing.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { canTransition } from './order-status';
import type { Prisma } from '../../generated/prisma/client';
import { ServiceConfigSchema } from '@repo/types';
import { CryptoService } from './crypto.service';

// Buyer statuses where account credentials may be added/edited: after payment, before the order closes.
const CREDENTIALS_EDITABLE: string[] = ['PAID', 'AWAITING_BOOSTER', 'ASSIGNED', 'IN_PROGRESS', 'DELIVERED'];

// Booster's share of the buyer price by tier (CLAUDE.md). Platform keeps the rest.
const PAYOUT_SHARE: Record<string, number> = { STANDARD: 0.7, PREMIUM: 0.75, ELITE: 0.8 };

type ConfigDisplayRow = { key: string; label: string; value: string };

export type SettleResult = { status: 'paid' | 'pending' | 'already_paid'; transferId?: string };

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private config: ConfigService,
    private crypto: CryptoService,
    @Inject(STRIPE_CLIENT) private stripe: Stripe,
  ) {}

    /** Buyer creates an order + Stripe Checkout session. Price is computed here, never trusted from the client. */
    async createOrder(buyerId: string, serviceId: string, config: Record<string, unknown>) {
        const service = await this.prisma.service.findUnique({
            where: {id: serviceId},
            include: {game: {select: { name: true }}},
        });
        if (!service || !service.isActive) throw new BadRequestException('Service not available');

        const price = await this.pricing.preview(serviceId, config ?? {});

        const order = await this.prisma.order.create({
            data: {
                buyerId,
                serviceId,
                config: (config ?? {}) as Prisma.InputJsonValue,
                priceCents: price.priceCents,
                platformFeeCents: price.platformFeeCents,
                boosterPayoutCents: price.boosterPayoutCents,
                currency: price.currency,
                status: 'PENDING_PAYMENT',
                events: {
                    create: {
                        type: 'ORDER_CREATED',
                        actorType: 'BUYER',
                        actorId: buyerId,
                        data: { serviceId, config, price } as Prisma.InputJsonValue,
                    },
                },
            },
        });

        const webUrl = this.config.getOrThrow<string>('WEB_APP_URL');
        const session = await this.stripe.checkout.sessions.create({
            mode: 'payment',
            metadata: { orderId: order.id },
            // Group the charge with the later booster transfer (separate charges & transfers).
            payment_intent_data: { transfer_group: `order_${order.id}` },
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: order.currency.toLowerCase(),
                        unit_amount: order.priceCents,
                        product_data: {
                            name: `${service.game.name} - ${service.name}`,
                            description: service.description?.slice(0, 200),
                        },
                    },
                },
            ],
            success_url: `${webUrl}/orders/${order.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${webUrl}/orders/${order.id}?cancelled=1`,
        });

        await this.prisma.orderEvent.create({
            data: {
                orderId: order.id,
                type: 'CHECKOUT_SESSION_CREATED',
                actorType: 'SYSTEM',
                data: { sessionId: session.id } as Prisma.InputJsonValue,
            },
        });

        return { orderId: order.id, checkoutUrl: session.url };
    }

     /**
   * Called from the Stripe webhook on checkout.session.completed.
   * Idempotent: re-delivery of the same event is a no-op once the order is past PENDING_PAYMENT.
   */
  async markPaidFromCheckout(orderId: string, paymentIntentId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }});
    if (!order) return;
    if (order.status !== 'PENDING_PAYMENT') return;
    if (!canTransition(order.status, 'PAID')) return;

    // The charge id is what we later transfer from (source_transaction). Derive it from the PI.
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge?.id ?? null);

    // Platform's take is whatever isn't owed to the booster. The payout share is the 80% snapshot
    // until a booster claims (then it's adjusted to their tier in claim()).
    const platformRevenueCents = order.priceCents - order.boosterPayoutCents;

    await this.prisma.$transaction([
        this.prisma.order.update({
            where: { id: orderId },
            // PAID -> AWAITING_BOOSTER is immediate per the state machine, so we land in the queue directly.
            data: { status: 'AWAITING_BOOSTER', chargeId },
        }),
        this.prisma.orderEvent.create({
            data: {
                orderId,
                type: 'PAYMENT_RECEIVED',
                actorType: 'STRIPE',
                data: { paymentIntentId, chargeId } as Prisma.InputJsonValue,
            },
        }),
        this.prisma.orderEvent.create({
            data: { orderId, type: 'STATUS_CHANGED', actorType: 'SYSTEM', data: { to: 'AWAITING_BOOSTER' } },
        }),
        // Double-entry (balanced): cash in = booster payable + platform revenue.
        this.prisma.ledgerEntry.create({
            data: {
                orderId,
                account: 'stripe_cash',
                direction: 'DEBIT',
                amountCents: order.priceCents,
                currency: order.currency,
                description: 'Buyer payment received',
                externalRef: paymentIntentId,
            },
        }),
        this.prisma.ledgerEntry.create({
            data: {
                orderId,
                account: 'booster_payable',
                direction: 'CREDIT',
                amountCents: order.boosterPayoutCents,
                currency: order.currency,
                description: 'Booster payable (unassigned)',
                externalRef: paymentIntentId,
            },
        }),
        this.prisma.ledgerEntry.create({
            data: {
                orderId,
                account: 'platform_revenue',
                direction: 'CREDIT',
                amountCents: platformRevenueCents,
                currency: order.currency,
                description: 'Platform fee',
                externalRef: paymentIntentId,
            },
        }),
    ]);
  }

  // ---- Booster-facing ----

  /** Orders in the queue this booster qualifies for. requiredBoosterTags ⊆ profile.tags. */
  async availableForBooster(userId: string, gameSlug?: string) {
    const profile = await this.prisma.boosterProfile.findUnique({ where: { userId }});
    if (!profile || profile.status !== 'APPROVED') {
        throw new ForbiddenException('Not an approved booster');
    }

    const orders = await this.prisma.order.findMany({
        where: {
            status: 'AWAITING_BOOSTER',
            boosterId: null,
            ...(gameSlug ? { service: { game: { slug: gameSlug } } } : {} ),
        },
        include: { service: { include: { game: { select: { slug: true, name: true} } } } },
        orderBy: { createdAt: 'asc' }, // oldest first - fair queue
    });

    const tags = new Set(profile.tags);
    const qualified = orders.filter((o) => o.service.requiredBoosterTags.every((t) => tags.has(t)));
    return this.enrichOrders(qualified);
  }

  /** First valid claim wins. Atomic: only succeeds if still unassigned + AWAITING_BOOSTER. */
  async claim(userId: string, orderId: string) {
    const profile = await this.prisma.boosterProfile.findUnique({ where: { userId }});
    if (!profile || profile.status !== 'APPROVED') throw new ForbiddenException('Not an approved booster');
    if (!profile.isAvailable) throw new ForbiddenException('You are marked unavailable');
    if (profile.currentLoad >= profile.maxConcurrentOrders) {
      throw new ForbiddenException('At max concurrent orders');
    }

    const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { service: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status != 'AWAITING_BOOSTER' || order.boosterId) {
        throw new ConflictException(' Order is no longer available');
    }
    const tags = new Set(profile.tags);
    if (!order.service.requiredBoosterTags.every((t) => tags.has(t))) {
      throw new ForbiddenException('You do not qualify for this order');
    }

    // Atomic guard against races: updateMany only matches if still claimable.
    const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: 'AWAITING_BOOSTER', boosterId: null},
        data: { status: 'ASSIGNED', boosterId: userId, assignedAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException('Order was just claimed by someone else');

    // Now that a booster is known, settle the real payout split for their tier. The order
    // snapshotted the max (80%) at purchase; lower tiers shift the difference to platform revenue.
    const share = PAYOUT_SHARE[profile.tier] ?? PAYOUT_SHARE.STANDARD;
    const newPayoutCents = Math.round(order.priceCents * share);
    const newFeeCents = order.priceCents - newPayoutCents;
    const deltaCents = order.boosterPayoutCents - newPayoutCents; // ≥ 0 (snapshot is the max share)

    const ops: Prisma.PrismaPromise<unknown>[] = [
        this.prisma.boosterProfile.update({
            where: { userId },
            data: { currentLoad: { increment: 1 } },
        }),
        this.prisma.order.update({
            where: { id: orderId },
            data: { boosterPayoutCents: newPayoutCents, platformFeeCents: newFeeCents },
        }),
        this.prisma.orderEvent.create({
            data: {
                orderId,
                type: 'BOOSTER_ASSIGNED',
                actorType: 'BOOSTER',
                actorId: userId,
                data: { via: 'claim', tier: profile.tier, payoutCents: newPayoutCents },
            },
        }),
    ];
    if (deltaCents > 0) {
        // Move the difference from what we owe the booster to platform revenue. Balanced pair.
        ops.push(
            this.prisma.ledgerEntry.create({
                data: { orderId, account: 'booster_payable', direction: 'DEBIT', amountCents: deltaCents, currency: order.currency, description: `Payout adjusted to ${profile.tier} tier` },
            }),
            this.prisma.ledgerEntry.create({
                data: { orderId, account: 'platform_revenue', direction: 'CREDIT', amountCents: deltaCents, currency: order.currency, description: `Payout adjusted to ${profile.tier} tier` },
            }),
        );
    }
    await this.prisma.$transaction(ops);

    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

   /** Buyer's own orders / a booster's assigned orders — for the detail page. */
  async getOrderForUser(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, OR: [{ buyerId: userId }, { boosterId: userId }] },
      include: { service: { include: { game: { select: { slug: true, name: true } } } } },
    });
    if (!order) return null;
    const [enriched] = await this.enrichOrders([order]);
    return enriched;
  }

  async myAssigned(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { boosterId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'DELIVERED'] } },
      include: { service: { include: { game: { select: { slug: true, name: true } } } } },
      orderBy: { assignedAt: 'desc' },
    });
    return this.enrichOrders(orders);
  }

  /** All of a buyer's own orders, newest first — for the customer "My Orders" page. */
  async myOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { buyerId: userId },
      include: { service: { include: { game: { select: { slug: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return this.enrichOrders(orders);
  }

  // ---- Order progression (state-machine transitions) ----

  /** Booster starts work: ASSIGNED -> IN_PROGRESS. */
  startWork(userId: string, orderId: string) {
    return this.transitionByBooster(userId, orderId, 'IN_PROGRESS', 'WORK_STARTED');
  }

  /** Booster marks the order delivered: IN_PROGRESS -> DELIVERED. */
  markDelivered(userId: string, orderId: string) {
    return this.transitionByBooster(userId, orderId, 'DELIVERED', 'ORDER_DELIVERED');
  }

  private async transitionByBooster(
    userId: string,
    orderId: string,
    to: 'IN_PROGRESS' | 'DELIVERED',
    eventType: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.boosterId !== userId) throw new ForbiddenException('Not your assigned order');
    if (!canTransition(order.status, to)) {
      throw new BadRequestException(`Cannot move order from ${order.status} to ${to}`);
    }
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data: { status: to } }),
      this.prisma.orderEvent.create({
        data: { orderId, type: eventType, actorType: 'BOOSTER', actorId: userId, data: { to } },
      }),
    ]);
    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  /** Buyer confirms completion: DELIVERED -> COMPLETED, then release the booster payout. */
  async confirmComplete(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (!canTransition(order.status, 'COMPLETED')) {
      throw new BadRequestException(`Cannot complete an order in status ${order.status}`);
    }

    // Complete the order first (and free the booster's slot). This must always succeed —
    // the buyer is never blocked by payout/onboarding state.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } }),
      this.prisma.orderEvent.create({
        data: { orderId, type: 'ORDER_COMPLETED', actorType: 'BUYER', actorId: userId, data: {} },
      }),
    ];
    if (order.boosterId) {
      ops.push(
        this.prisma.boosterProfile.update({
          where: { userId: order.boosterId },
          data: { currentLoad: { decrement: 1 }, completedOrders: { increment: 1 } },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    // Then attempt the Stripe transfer. If it can't run yet (booster not onboarded, or Stripe
    // hiccups), the order stays COMPLETED with the payout pending — settled later by backfill.
    try {
      await this.settleOrder(orderId);
    } catch (err) {
      await this.prisma.orderEvent.create({
        data: { orderId, type: 'PAYOUT_FAILED', actorType: 'SYSTEM', data: { error: (err as Error).message } },
      });
    }
    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  /**
   * Release the booster payout via a Stripe Connect transfer. Idempotent: skips if already paid,
   * marks pending (no transfer) if the booster isn't onboarded yet. Used by confirmComplete and
   * by the onboarding backfill once a booster becomes payout-enabled.
   */
  async settleOrder(orderId: string): Promise<SettleResult> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'COMPLETED') throw new BadRequestException('Order is not completed');
    if (order.payoutTransferId) return { status: 'already_paid', transferId: order.payoutTransferId };
    if (!order.boosterId) throw new BadRequestException('Order has no booster to pay');

    const profile = await this.prisma.boosterProfile.findUnique({ where: { userId: order.boosterId } });
    if (!profile?.stripeAccountId || !profile.payoutsEnabled) {
      // Can't pay yet — record once so the order shows "payout pending".
      const already = await this.prisma.orderEvent.findFirst({ where: { orderId, type: 'PAYOUT_PENDING' } });
      if (!already) {
        await this.prisma.orderEvent.create({
          data: { orderId, type: 'PAYOUT_PENDING', actorType: 'SYSTEM', data: { reason: 'booster not onboarded' } },
        });
      }
      return { status: 'pending' };
    }

    const transfer = await this.stripe.transfers.create(
      {
        amount: order.boosterPayoutCents,
        currency: order.currency.toLowerCase(),
        destination: profile.stripeAccountId,
        transfer_group: `order_${order.id}`,
        ...(order.chargeId ? { source_transaction: order.chargeId } : {}),
        metadata: { orderId: order.id },
      },
      { idempotencyKey: `payout_${order.id}` },
    );

    // Settle the books: discharge the payable by paying out cash. Balanced pair.
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data: { payoutTransferId: transfer.id } }),
      this.prisma.ledgerEntry.create({
        data: { orderId, userId: order.boosterId, account: 'booster_payable', direction: 'DEBIT', amountCents: order.boosterPayoutCents, currency: order.currency, description: 'Payout transferred to booster', externalRef: transfer.id },
      }),
      this.prisma.ledgerEntry.create({
        data: { orderId, userId: order.boosterId, account: 'stripe_cash', direction: 'CREDIT', amountCents: order.boosterPayoutCents, currency: order.currency, description: 'Payout transferred to booster', externalRef: transfer.id },
      }),
      this.prisma.orderEvent.create({
        data: { orderId, type: 'PAYOUT_SENT', actorType: 'SYSTEM', data: { transferId: transfer.id, amountCents: order.boosterPayoutCents } },
      }),
    ]);
    return { status: 'paid', transferId: transfer.id };
  }

  /** Settle every completed-but-unpaid order for a booster (called when their onboarding finishes). */
  async backfillPayouts(boosterUserId: string) {
    const pending = await this.prisma.order.findMany({
      where: { boosterId: boosterUserId, status: 'COMPLETED', payoutTransferId: null },
      select: { id: true },
    });
    for (const o of pending) {
      try {
        await this.settleOrder(o.id);
      } catch {
        /* leave pending; a later trigger will retry */
      }
    }
  }

  // ---- Account credentials (account-sharing) ----

  /** Buyer submits/updates the account access the assigned booster will use. */
  async setCredentials(
    userId: string,
    orderId: string,
    dto: { username: string; password: string; country: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (!CREDENTIALS_EDITABLE.includes(order.status)) {
      throw new BadRequestException('Credentials can only be set after payment and before completion');
    }
    if (!dto.username?.trim() || !dto.password || !dto.country?.trim()) {
      throw new BadRequestException('username, password and country are required');
    }

    // Password is encrypted at rest (reversible — the booster needs the real value).
    const password = this.crypto.encrypt(dto.password);
    const creds = await this.prisma.orderCredentials.upsert({
      where: { orderId },
      update: { username: dto.username, password, country: dto.country },
      create: { orderId, username: dto.username, password, country: dto.country },
    });
    // Audit the action, but never log the secret itself.
    await this.prisma.orderEvent.create({
      data: { orderId, type: 'CREDENTIALS_PROVIDED', actorType: 'BUYER', actorId: userId, data: {} },
    });
    return { ok: true, updatedAt: creds.updatedAt };
  }

  /** Readable by the buyer (who owns it) or the assigned booster. Returns null if not yet provided. */
  async getCredentials(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, boosterId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.boosterId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    const creds = await this.prisma.orderCredentials.findUnique({
      where: { orderId },
      select: { username: true, password: true, country: true, updatedAt: true },
    });
    if (!creds) return null;
    return { ...creds, password: this.crypto.decrypt(creds.password) };
  }

  // ---- Config display helpers ----

  /**
   * Turn the raw config (rank ids, booleans) into labelled, human-readable rows using the
   * service's configSchema, so boosters see "Current rank: Gold 2" instead of a cuid.
   */
  private async enrichOrders<
    T extends { config: unknown; service: { gameId: string; configSchema: unknown } },
  >(orders: T[]): Promise<(T & { configDisplay: ConfigDisplayRow[] })[]> {
    const gameIds = [...new Set(orders.map((o) => o.service.gameId))];
    const ranks = gameIds.length
      ? await this.prisma.rank.findMany({
          where: { gameId: { in: gameIds } },
          select: { id: true, tier: true, division: true },
        })
      : [];
    const ranksById = new Map(ranks.map((r) => [r.id, r]));

    return orders.map((o) => ({
      ...o,
      configDisplay: this.buildConfigDisplay(
        o.service.configSchema,
        (o.config ?? {}) as Record<string, unknown>,
        ranksById,
      ),
    }));
  }

  private buildConfigDisplay(
    configSchema: unknown,
    config: Record<string, unknown>,
    ranksById: Map<string, { tier: string; division: number | null }>,
  ): ConfigDisplayRow[] {
    const parsed = ServiceConfigSchema.safeParse(configSchema);
    if (!parsed.success) {
      // Schema unreadable — fall back to raw key/value so nothing is hidden.
      return Object.entries(config).map(([k, v]) => ({ key: k, label: k, value: String(v) }));
    }

    return parsed.data.fields.map((field) => {
      const raw = config[field.key];
      let value: string;
      switch (field.type) {
        case 'rank': {
          const r = typeof raw === 'string' ? ranksById.get(raw) : undefined;
          value = r ? (r.division == null ? r.tier : `${r.tier} ${r.division}`) : raw == null ? '—' : String(raw);
          break;
        }
        case 'boolean':
          value = raw === true ? 'Yes' : 'No';
          break;
        default:
          value = raw == null || raw === '' ? '—' : String(raw);
      }
      return { key: field.key, label: field.label, value };
    });
  }
}