import { createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';

export const CLERK_CLIENT = 'CLERK_CLIENT';

export const ClerkClientProvider = {
  provide: CLERK_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    createClerkClient({
      secretKey: config.getOrThrow('CLERK_SECRET_KEY'),
      publishableKey: config.getOrThrow('CLERK_PUBLISHABLE_KEY'),
    }),
};
