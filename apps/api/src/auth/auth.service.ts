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

        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
        const imageUrl = u.imageUrl ?? null;

        // A row with this email may already exist under a stale clerkId (the Clerk user
        // was deleted/recreated, or the instance changed). Email is unique per Clerk
        // instance, so it's the same human — relink the row to the current clerkId,
        // preserving role and any related records. Otherwise create a fresh row.
        const byEmail = await this.prisma.user.findUnique({ where: { email }});
        if (byEmail) {
            return this.prisma.user.update({
                where: { email },
                data: { clerkId, name, imageUrl },
            });
        }

        return this.prisma.user.create({
            data: { clerkId, email, name, imageUrl },
        });
    }

    getMe(clerkId: string) {
        return this.prisma.user.findUnique({ where: { clerkId }});
    }
}
