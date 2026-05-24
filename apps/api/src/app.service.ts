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

    getUser() {
        return this.prisma.user.findFirst({
            where: {
                email: 'max@carrify.gg'
            }
        });

    }

    async createUser() {
        return await this.prisma.user.create(
            {
                data: {
                    email: "max@carrify.gg",
                    name: "Max"
                }
            }
        )
    }

    async deleteUser() {
        return await this.prisma.user.delete({
            where: {
                email: 'max@carrify.gg',
            },
        });
    }
}
