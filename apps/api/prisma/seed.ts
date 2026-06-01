import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaNeon } from '@prisma/adapter-neon';
import { GameSeed, RanksSeed, ServiceSeed } from '@repo/types';

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

// Run via `prisma db seed` (or `tsx prisma/seed.ts`) from apps/api.
const SEED_DATA = join(process.cwd(), 'prisma', 'seed-data');

function loadJson(...segments: string[]): unknown {
  return JSON.parse(readFileSync(join(SEED_DATA, ...segments), 'utf8'));
}

async function seedUsers() {
  await prisma.user.createMany({
    data: [
      { clerkId: 'seed_alice', email: 'alice@example.com', name: 'Alice' },
      { clerkId: 'seed_bob',   email: 'bob@example.com',   name: 'Bob' },
      { clerkId: 'seed_carol', email: 'carol@example.com', name: 'Carol' },
    ],
    skipDuplicates: true,
  });
}

async function seedGame(gameSlug: string) {
  const game = GameSeed.parse(loadJson(gameSlug, 'game.json'));
  const ranks = RanksSeed.parse(loadJson(gameSlug, 'ranks.json'));

  const dbGame = await prisma.game.upsert({
    where: { slug: game.slug },
    update: { name: game.name, iconUrl: game.iconUrl ?? null, isActive: game.isActive },
    create: { slug: game.slug, name: game.name, iconUrl: game.iconUrl ?? null, isActive: game.isActive },
  });

  for (const [i, rank] of ranks.ranks.entries()) {
    const order = i + 1;
    if (rank.division === null) {
      // Compound unique can't match `division: null` via generated where — manual lookup.
      const existing = await prisma.rank.findFirst({
        where: { gameId: dbGame.id, tier: rank.tier, division: null },
      });
      if (existing) {
        await prisma.rank.update({ where: { id: existing.id }, data: { order, iconUrl: rank.iconUrl ?? null } });
      } else {
        await prisma.rank.create({
          data: { gameId: dbGame.id, tier: rank.tier, division: null, order, iconUrl: rank.iconUrl ?? null },
        });
      }
      continue;
    }
    await prisma.rank.upsert({
      where: { gameId_tier_division: { gameId: dbGame.id, tier: rank.tier, division: rank.division } },
      update: { order, iconUrl: rank.iconUrl ?? null },
      create: { gameId: dbGame.id, tier: rank.tier, division: rank.division, order, iconUrl: rank.iconUrl ?? null },
    });
  }

  const serviceDir = join(SEED_DATA, gameSlug, 'services');
  const serviceFiles = readdirSync(serviceDir).filter((f) => f.endsWith('.json'));
  for (const file of serviceFiles) {
    const parsed = ServiceSeed.parse(loadJson(gameSlug, 'services', file));
    await prisma.service.upsert({
      where: { gameId_slug: { gameId: dbGame.id, slug: parsed.slug } },
      update: {
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        configSchema: parsed.configSchema,
        pricingModel: parsed.pricingModel,
        pricingData: parsed.pricingData,
        requiredBoosterTags: parsed.requiredBoosterTags,
        isActive: parsed.isActive,
      },
      create: {
        gameId: dbGame.id,
        slug: parsed.slug,
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        configSchema: parsed.configSchema,
        pricingModel: parsed.pricingModel,
        pricingData: parsed.pricingData,
        requiredBoosterTags: parsed.requiredBoosterTags,
        isActive: parsed.isActive,
      },
    });
  }
}

async function main() {
  await seedUsers();
  await seedGame('dota2');
  await seedGame('lol');
  await seedGame('valorant');

  const [users, games, dotaRanks, dotaServices, leagueRanks, leagueServices, valorantRanks, valorantServices ] = await Promise.all([
    prisma.user.count(),
    prisma.game.count(),
    prisma.rank.count({ where: { game: { slug: 'dota2' } } }),
    prisma.service.count({ where: { game: { slug: 'dota2' } } }),
    prisma.rank.count({ where: { game: { slug: 'lol' } } }),
    prisma.service.count({ where: { game: { slug: 'lol' } } }),
    prisma.rank.count({ where: { game: { slug: 'valorant' } } }),
    prisma.service.count({ where: { game: { slug: 'valorant' } } }),
  ]);
  console.log(`Seeded: ${users} users, ${games} games, ${dotaRanks} Dota 2 ranks, ${dotaServices} Dota 2 services, ${leagueRanks} League of Legends ranks, ${leagueServices} League of Legends services, ${valorantRanks} Valorant ranks, ${valorantServices} Valorant services`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
