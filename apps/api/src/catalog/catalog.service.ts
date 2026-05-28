import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceInput } from '@repo/types';

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  listGames() {
    return this.prisma.game.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, iconUrl: true },
      orderBy: { name: 'asc' },
    });
  }

  async getGameWithCatalog(slug: string) {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      include: {
        ranks: { orderBy: { order: 'asc' } },
        services: { where: { isActive: true }, orderBy: { name: 'asc' } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  listServices() {
    return this.prisma.service.findMany({
      include: { game: { select: { slug: true, name: true } } },
      orderBy: [{ game: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async createService(input: unknown) {
    const parsed = CreateServiceInput.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid service input', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const game = await this.prisma.game.findUnique({ where: { id: data.gameId } });
    if (!game) throw new BadRequestException('gameId does not exist');

    const dup = await this.prisma.service.findUnique({
      where: { gameId_slug: { gameId: data.gameId, slug: data.slug } },
    });
    if (dup) throw new ConflictException('A service with that slug already exists for this game');

    return this.prisma.service.create({
      data: {
        gameId: data.gameId,
        slug: data.slug,
        name: data.name,
        description: data.description,
        category: data.category,
        configSchema: data.configSchema,
        pricingModel: data.pricingModel,
        pricingData: data.pricingData,
        requiredBoosterTags: data.requiredBoosterTags,
        isActive: data.isActive,
      },
    });
  }
}
