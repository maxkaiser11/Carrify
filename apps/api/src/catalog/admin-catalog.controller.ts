import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CatalogService } from './catalog.service';

@Controller('admin/services')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCatalogController {
  constructor(private catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.listServices();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.catalog.createService(body);
  }
}
