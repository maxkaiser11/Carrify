import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ConnectService } from './connect.service';

@Controller('connect')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles('BOOSTER')
export class ConnectController {
  constructor(private connect: ConnectService) {}

  // Returns a Stripe-hosted onboarding URL to redirect the booster to.
  @Post('onboarding-link')
  onboardingLink(@CurrentUser() auth: any) {
    return this.connect.onboardingLink(auth.user.id);
  }

  @Get('status')
  status(@CurrentUser() auth: any) {
    return this.connect.getStatus(auth.user.id);
  }
}
