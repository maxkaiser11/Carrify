import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';

@Controller('admin/applications')
@UseGuards(ClerkAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
    constructor(private admin: AdminService) {}

    @Get()
    list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
        return this.admin.listApplications(status);
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @CurrentUser() auth: any) {
        return this.admin.approve(id, auth.user.id);
    }

    @Post(':id/reject')
    reject(@Param('id') id: string, @CurrentUser() auth: any, @Body('notes') notes?: string) {
        return this.admin.reject(id, auth.user.id, notes);
    }
}
