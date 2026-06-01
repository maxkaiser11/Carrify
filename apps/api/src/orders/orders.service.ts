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

type ConfigDisplayRow = { key: string; label: string; value: string };

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

    await this.prisma.$transaction([
        this.prisma.order.update({
            where: { id: orderId },
            // PAID -> AWAITING_BOOSTER is immedaite per the state machine, so we land in the queue direclty.
            data: { status: 'AWAITING_BOOSTER'},
        }),
        this.prisma.orderEvent.create({
            data: {
                orderId,
                type: 'PAYMENT_RECIEVED',
                actorType: 'STRIPE',
                data: { paymentIntentId } as Prisma.InputJsonValue,
            },
        }),
        this.prisma.orderEvent.create({
            data: { orderId, type: 'STATUS_CHANGED', actorType: 'SYSTEM', data: { to: 'AWAITING_BOOSTER' } },
        }),
        // Double-entry: buyer cash in vs. what we owe (platform revenue + booster payable)
        this.prisma.ledgerEntry.create({
            data: {
                orderId,
                account: 'stripe_cash',
                direction: 'DEBIT',
                amountCents: order.priceCents,
                currency: order.currency,
                description: 'Buyer payment recieved',
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

    await this.prisma.$transaction([
        this.prisma.boosterProfile.update({
            where: { userId },
            data: { currentLoad: { increment: 1 } },
        }),
        this.prisma.orderEvent.create({
            data: {
                orderId,
                type: 'BOOSTER_ASSIGNED',
                actorType: 'BOOSTER',
                actorId: userId,
                data: { via: 'claim' },
            },
        }),
    ]);

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

  /** Buyer confirms completion: DELIVERED -> COMPLETED, releasing the booster payout. */
  async confirmComplete(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (!canTransition(order.status, 'COMPLETED')) {
      throw new BadRequestException(`Cannot complete an order in status ${order.status}`);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED' } }),
      this.prisma.orderEvent.create({
        data: { orderId, type: 'ORDER_COMPLETED', actorType: 'BUYER', actorId: userId, data: {} },
      }),
      // Release the payout: move it off "payable" (what we owe) onto "paid" (settled). Balanced pair.
      this.prisma.ledgerEntry.create({
        data: {
          orderId,
          userId: order.boosterId ?? undefined,
          account: 'booster_payable',
          direction: 'DEBIT',
          amountCents: order.boosterPayoutCents,
          currency: order.currency,
          description: 'Payout released on completion',
        },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          orderId,
          userId: order.boosterId ?? undefined,
          account: 'booster_paid',
          direction: 'CREDIT',
          amountCents: order.boosterPayoutCents,
          currency: order.currency,
          description: 'Booster payout',
        },
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
    return this.prisma.order.findUnique({ where: { id: orderId } });
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