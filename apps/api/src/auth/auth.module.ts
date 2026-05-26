import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkClientProvider } from './clerk.provider';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ClerkWebhookController } from './webhooks.controller';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController, ClerkWebhookController],
  providers: [AuthService, ClerkAuthGuard, ClerkClientProvider, RolesGuard],
  exports: [AuthService, ClerkAuthGuard, ClerkClientProvider, RolesGuard],
})
export class AuthModule {}