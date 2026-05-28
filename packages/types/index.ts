export type Role = 'CUSTOMER' | 'BOOSTER' | 'ADMIN';

export type DbUser = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: Role;
  createdAt: string;
};

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type BoosterApplication = {
  id: string;
  userId: string;
  status: ApplicationStatus;
  games: string[];
  experience: string;
  ranks: Record<string, string>;
  discord: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export * from './pricing.js';
export * from './service-config.js';
export * from './seed.js';
