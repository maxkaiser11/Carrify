import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { AuthService } from './auth/auth.service';

@Module({
    imports: [PrismaModule, AuthModule, AuthModule],
    controllers: [AppController],
    providers: [AppService, PrismaService, AuthService],
})
export class AppModule { }
