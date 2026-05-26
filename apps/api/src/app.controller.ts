import { Controller, Delete, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) { }

    @Get('/health')
    getHealth(): string {
        return this.appService.getHealth();
    }

    @Get('/')
    getHello(): string {
        return this.appService.getHello();
    }

    // deletes the user created in createUser
    @Delete('/max')
    deleteUser() {
        return this.appService.deleteUser();
    }
} 
