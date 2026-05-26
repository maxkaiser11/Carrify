export type Role = 'CUSTOMER' | 'BOOSTER' | 'ADMIN';

export type DbUser = {
  id: number;
  clerkId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: Role;
  createdAt: string;
};

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type BoosterApplication = {
  id: number;
  userId: number;
  status: ApplicationStatus;
  games: string[];
  experience: string;
  ranks: Record<string, string>;
  discord: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
