import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

export const StripeClientProvider: Provider = {
    provide: STRIPE_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => 
        new Stripe(config.getOrThrow('STRIPE_SECRET_KEY'), {
            apiVersion: '2026-05-27.dahlia'
        }),
};

