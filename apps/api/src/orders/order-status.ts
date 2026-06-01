import type { OrderStatus } from '../../generated/prisma/client';

// Allowed forward transitions. Branches (DISPUTED/CANCELLED/REFUNDED) added as those flows land.
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['AWAITING_BOOSTER', 'CANCELLED'],
  AWAITING_BOOSTER: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'AWAITING_BOOSTER'], // auto-revert if booster doesn't start
  IN_PROGRESS: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  DISPUTED: ['REFUNDED', 'IN_PROGRESS'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
