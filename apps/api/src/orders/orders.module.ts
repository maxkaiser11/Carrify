import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeClientProvider } from '../payments/stripe.provider';
import { CryptoService } from './crypto.service';

@Module({
  imports: [PrismaModule, AuthModule, CatalogModule], // CatalogModule for PricingService
  controllers: [OrdersController, StripeWebhookController],
  providers: [OrdersService, StripeClientProvider, CryptoService],
})
export class OrdersModule {}
