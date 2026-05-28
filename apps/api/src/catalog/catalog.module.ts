import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogService } from './catalog.service';
import { PricingService } from './pricing.service';
import { GamesController } from './games.controller';
import { PricingController } from './pricing.controller';
import { AdminCatalogController } from './admin-catalog.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [GamesController, PricingController, AdminCatalogController],
  providers: [CatalogService, PricingService],
})
export class CatalogModule {}
