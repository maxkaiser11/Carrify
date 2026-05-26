import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApplicationsService } from './applications.service';

@Controller('applications')
@UseGuards(ClerkAuthGuard)
export class ApplicationsController {
    constructor(private applications: ApplicationsService) {}

    @Post()
    submit(@CurrentUser() auth: any, @Body() body: any) {
        return this.applications.submit(auth.user.id, auth.user.role, body);
    }

    @Get('me')
    mine(@CurrentUser() auth: any) {
        return this.applications.getMine(auth.user.id);
    }
}