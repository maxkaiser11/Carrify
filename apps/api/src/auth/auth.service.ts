import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CLERK_CLIENT } from './clerk.provider';
import type { ClerkClient } from '@clerk/backend';

@Injectable()
export class AuthService {
constructor(private prisma: PrismaService, @Inject(CLERK_CLIENT) private clerk: ClerkClient) {}
     

    async syncUser(clerkId: string) {
        const existing = await this.prisma.user.findUnique({ where: { clerkId }});
        if (existing) return existing;

        const u = await this.clerk.users.getUser(clerkId);
        const email = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress
                    ?? u.emailAddresses[0]?.emailAddress;
        if (!email) throw new Error('Clerk user has no email');

        return this.prisma.user.upsert({
            where: { clerkId },
            update: {},
            create: {
                clerkId,
                email,
                name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
                imageUrl: u.imageUrl ?? null,
            },
        });
    }

    getMe(clerkId: string) {
        return this.prisma.user.findUnique({ where: { clerkId }});
    }
}
