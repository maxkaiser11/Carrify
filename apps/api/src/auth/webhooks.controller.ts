import { Controller, Post, Req, Headers, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  @Post()
  async handle(@Req() req: Request, @Headers() headers: Record<string, string>) {
    const payload = (req as any).rawBody?.toString('utf8');
    if (!payload) throw new BadRequestException('Missing raw body');

    const wh = new Webhook(this.config.getOrThrow('CLERK_WEBHOOK_SIGNING_SECRET'));
    let evt: any;
    try {
      evt = wh.verify(payload, {
        'svix-id': headers['svix-id'],
        'svix-timestamp': headers['svix-timestamp'],
        'svix-signature': headers['svix-signature'],
      });
    } catch {
      throw new BadRequestException('Invalid signature');
    }

    const { type, data } = evt;
    if (type === 'user.created' || type === 'user.updated') {
      const email = data.email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address
                 ?? data.email_addresses?.[0]?.email_address;
      await this.prisma.user.upsert({
        where: { clerkId: data.id },
        update: { email, name: [data.first_name, data.last_name].filter(Boolean).join(' ') || null, imageUrl: data.image_url ?? null },
        create: { clerkId: data.id, email, name: [data.first_name, data.last_name].filter(Boolean).join(' ') || null, imageUrl: data.image_url ?? null },
      });
    } else if (type === 'user.deleted') {
      await this.prisma.user.deleteMany({ where: { clerkId: data.id } });
    }
    return { ok: true };
  }
}
