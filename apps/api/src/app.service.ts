import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';;

@Injectable()
export class AppService {
    constructor(private prisma: PrismaService
    ) {}

    getHealth(): string {
        return 'Hello health';

    }

    getHello(): string {
        return "Hello Carrify";
    }

    async deleteUser() {
        return await this.prisma.user.delete({
            where: {
                email: 'max@carrify.gg',
            },
        });
    }
}
