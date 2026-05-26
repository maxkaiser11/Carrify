import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class AuthController {
    constructor(private authService: AuthService) {}

    @Get('me')
    me(@CurrentUser() user: { userId: string}) {
        return this.authService.getMe(user.userId);
    }

    @Post('sync')
    sync(@CurrentUser() user: { userId: string }) {
        return this.authService.syncUser(user.userId);
    }
}
