import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(private pricing: PricingService) {}

  @Post('preview')
  preview(@Body() body: { serviceId: string; config: Record<string, unknown> }) {
    return this.pricing.preview(body.serviceId, body.config ?? {});
  }
}
