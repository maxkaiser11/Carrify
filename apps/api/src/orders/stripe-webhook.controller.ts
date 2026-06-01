import { BadRequestException, Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { Stripe } from 'stripe';
import { STRIPE_CLIENT } from '../payments/stripe.provider';
import { OrdersService } from './orders.service';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    @Inject(STRIPE_CLIENT) private stripe: Stripe,
    private config: ConfigService,
    private orders: OrdersService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw) throw new BadRequestException('Missing raw body');

    // Verify + decode in one place so `event` keeps its inferred (narrowable) type.
    const event = this.verifyEvent(raw, signature);

    if (event.type === 'checkout.session.completed') {
      // event.data.object is narrowed to a Checkout.Session by the type check above.
      const session = event.data.object;
      if (session.metadata?.orderId && session.payment_status === 'paid') {
        await this.orders.markPaidFromCheckout(session.metadata.orderId, String(session.payment_intent));
      }
    }
    // (Later: payment_intent.payment_failed, charge.refunded, account.updated for Connect, etc.)

    return { received: true };
  }

  private verifyEvent(raw: Buffer, signature: string) {
    try {
      return this.stripe.webhooks.constructEvent(
        raw,
        signature,
        this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'),
      );
    } catch {
      throw new BadRequestException('Invalid signature');
    }
  }
}
