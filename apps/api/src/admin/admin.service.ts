import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService) {}

    listApplications(status?: 'PENDING' | "APPROVED" | 'REJECTED') {
        return this.prisma.boosterApplication.findMany({
            where: status ? { status } : undefined,
            include: { user: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async approve(applicationId: string, adminuserId: string) {
        const app = await this.prisma.boosterApplication.findUnique({ where: { id: applicationId }});
        if (!app) throw new NotFoundException('Application not found');

        const now = new Date();
        return this.prisma.$transaction([
            this.prisma.boosterApplication.update({
                where: { id: applicationId },
                data: { status: 'APPROVED', reviewedBy: adminuserId, reviewedAt: now },
            }),
            this.prisma.user.update({
                where: { id: app.userId },
                data: { role: 'BOOSTER' },
            }),
            // Upsert covers re-approval after a prior SUSPENDED/INACTIVE profile.
            this.prisma.boosterProfile.upsert({
                where: { userId: app.userId },
                update: { status: 'APPROVED', approvedAt: now, tags: app.games },
                create: {
                    userId: app.userId,
                    status: 'APPROVED',
                    tier: 'STANDARD',
                    tags: app.games,
                    approvedAt: now,
                    appliedAt: app.createdAt,
                },
            }),
        ]);
    }

    async reject(applicationId: string, adminuserId: string, notes?: string) {
        return this.prisma.boosterApplication.update({
            where: { id: applicationId },
            data: { status: 'REJECTED', reviewedBy: adminuserId, reviewedAt: new Date(), notes: notes ?? null },
        });
    }
}
