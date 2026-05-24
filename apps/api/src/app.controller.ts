import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';

@Controller()
export class AppController {
    constructor(private readonly appService: AppService, private authService: AuthService) { }

    @Get('/health')
    getHealth(): string {
        return this.appService.getHealth();
    }

    @Get('/')
    getHello(): string {
        return this.appService.getHello();
    }

    @Get('/user')
    getUser() {
        return this.appService.getUser();
    }

    @Post('/max')
    createUser() {
        return this.appService.createUser();
    }

    // deletes the user created in createUser
    @Delete('/max')
    deleteUser() {
        return this.appService.deleteUser();
    }
} 
