import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Stripe } from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { OrdersService } from './orders.service';

/**
 * Stripe Connect Express onboarding for boosters. A booster gets one connected account;
 * once Stripe reports payouts are enabled, we can transfer their order payouts to it
 * (Stripe then auto-pays out to their bank). See OrdersService.settleOrder.
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private orders: OrdersService,
    @Inject(STRIPE_CLIENT) private stripe: Stripe,
  ) {}

  /** Create the booster's Express account if needed, then return a hosted onboarding URL. */
  async onboardingLink(userId: string) {
    const profile = await this.prisma.boosterProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!profile || profile.status !== 'APPROVED') throw new ForbiddenException('Not an approved booster');

    let accountId = profile.stripeAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        email: profile.user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { userId },
      });
      accountId = account.id;
      await this.prisma.boosterProfile.update({ where: { userId }, data: { stripeAccountId: accountId } });
    }

    const webUrl = this.config.getOrThrow<string>('WEB_APP_URL');
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${webUrl}/booster/payouts?refresh=1`,
      return_url: `${webUrl}/booster/payouts?done=1`,
    });
    return { url: link.url };
  }

  /** Pull the latest account state from Stripe, persist payoutsEnabled, and backfill if newly enabled. */
  async getStatus(userId: string) {
    const profile = await this.prisma.boosterProfile.findUnique({ where: { userId } });
    if (!profile || profile.status !== 'APPROVED') throw new ForbiddenException('Not an approved booster');
    if (!profile.stripeAccountId) {
      return { connected: false, payoutsEnabled: false, detailsSubmitted: false };
    }

    const account = await this.stripe.accounts.retrieve(profile.stripeAccountId);
    await this.applyAccountState(userId, !!account.payouts_enabled);
    return {
      connected: true,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
    };
  }

  /** Stripe webhook: account.updated. We only read id + payouts_enabled. */
  async handleAccountUpdated(account: { id: string; payouts_enabled?: boolean | null }) {
    const profile = await this.prisma.boosterProfile.findFirst({
      where: { stripeAccountId: account.id },
      select: { userId: true },
    });
    if (!profile) return;
    await this.applyAccountState(profile.userId, !!account.payouts_enabled);
  }

  private async applyAccountState(userId: string, payoutsEnabled: boolean) {
    const profile = await this.prisma.boosterProfile.findUnique({ where: { userId } });
    const wasEnabled = profile?.payoutsEnabled ?? false;
    if (profile && profile.payoutsEnabled !== payoutsEnabled) {
      await this.prisma.boosterProfile.update({ where: { userId }, data: { payoutsEnabled } });
    }
    // Just became payable → settle anything that was waiting on onboarding.
    if (payoutsEnabled && !wasEnabled) {
      this.logger.log(`Booster ${userId} payouts enabled — backfilling pending payouts`);
      await this.orders.backfillPayouts(userId);
    }
  }
}
