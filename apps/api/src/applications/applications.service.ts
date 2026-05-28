import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SubmitApplicationDto = {
  games: string[];
  experience: string;
  ranks: Record<string, string>;
  discord?: string;
};

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}


    async submit(userId: string, role: string, dto: SubmitApplicationDto) {
        if (role === 'BOOSTER') throw new BadRequestException('You are already a booster');
        if (role === 'ADMIN') throw new BadRequestException('Admins cannot apply');
        if (!dto.games?.length) throw new BadRequestException('Pick at least one game');
        if (!dto.experience?.trim()) throw new BadRequestException('Experience required');

        const existing = await this.prisma.boosterApplication.findUnique({ where: {userId }});
        if (existing && existing.status === 'PENDING') {
            throw new BadRequestException('You already have a pending application');
        }
        if (existing && existing.status === 'APPROVED') {
            throw new BadRequestException('You are already approved');
        }

        // if REJECTED, allow re-apply by updating the row
        return this.prisma.boosterApplication.upsert({
            where: { userId },
            update: {...dto, status: 'PENDING', reviewedAt: null, reviewedBy: null, notes: null},
            create: {userId, ...dto, status: 'PENDING'},
        });

    }
    getMine(userId: string) {
        return this.prisma.boosterApplication.findUnique({ where: { userId }});
    }
}