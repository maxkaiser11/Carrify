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

    async approve(applicationId: number, adminuserId: number) {
        const app = await this.prisma.boosterApplication.findUnique({ where: { id: applicationId }});
        if (!app) throw new NotFoundException('Application not found');

        return this.prisma.$transaction([
            this.prisma.boosterApplication.update({
                where: { id: applicationId },
                data: { status: 'APPROVED', reviewedBy: adminuserId, reviewedAt: new Date() },
            }),
            this.prisma.user.update({
                where: { id: app.userId },
                data: { role: 'BOOSTER' },
            }),
        ]);
    }

    async reject(applicationId: number, adminuserId: number, notes?: string) {
        return this.prisma.boosterApplication.update({
            where: { id: applicationId },
            data: { status: 'REJECTED', reviewedBy: adminuserId, reviewedAt: new Date(), notes: notes ?? null },
        });
    }
}
