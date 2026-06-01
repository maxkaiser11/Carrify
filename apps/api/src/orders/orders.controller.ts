import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrdersService } from './orders.service';
import { Role } from 'generated/prisma/enums';

@Controller('orders')
@UseGuards(ClerkAuthGuard) // class-level: every route needs a signed-in user
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() auth: any,
    @Body() body: { serviceId: string, config: Record<string, unknown>},
  ) {
    return this.orders.createOrder(auth.user.id, body.serviceId, body.config ?? {});
  }

  @Get()
  listMine(@CurrentUser() auth: any) {
    return this.orders.myOrders(auth.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.getOrderForUser(id, auth.user.id);
  }

  // Buyer confirms the work is done: DELIVERED -> COMPLETED.
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.confirmComplete(auth.user.id, id);
  }

  // Account credentials (buyer submits; buyer or assigned booster can read).
  @Get(':id/credentials')
  getCredentials(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.getCredentials(auth.user.id, id);
  }

  @Put(':id/credentials')
  setCredentials(
    @Param('id') id: string,
    @CurrentUser() auth: any,
    @Body() body: { username: string; password: string; country: string },
  ) {
    return this.orders.setCredentials(auth.user.id, id, body);
  }

  // ---- Booster ----

  @Get('booster/available')
  @UseGuards(RolesGuard)
  @Roles('BOOSTER')
  available(@CurrentUser() auth: any, @Query('game') game?: string) {
    return this.orders.availableForBooster(auth.user.id, game);
  }

  @Get('booster/mine')
  @UseGuards(RolesGuard)
  @Roles('BOOSTER')
  mine(@CurrentUser() auth: any) {
    return this.orders.myAssigned(auth.user.id);
  }

  @Post(':id/claim')
  @UseGuards(RolesGuard)
  @Roles("BOOSTER")
  claim(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.claim(auth.user.id, id);
  }

  // Booster progresses the order: ASSIGNED -> IN_PROGRESS -> DELIVERED.
  @Post(':id/start')
  @UseGuards(RolesGuard)
  @Roles('BOOSTER')
  start(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.startWork(auth.user.id, id);
  }

  @Post(':id/deliver')
  @UseGuards(RolesGuard)
  @Roles('BOOSTER')
  deliver(@Param('id') id: string, @CurrentUser() auth: any) {
    return this.orders.markDelivered(auth.user.id, id);
  }
}