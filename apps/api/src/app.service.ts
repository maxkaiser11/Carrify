import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}
  getHealth(): string {
    return 'Health Ok!';
  }

  getHello(): string {
    return "Hello Carrify";
  }

  getUser() {
    return this.prisma.user.findFirst();
  }

  async createUser() {
    return await this.prisma.user.create(
      {data: {
        email: "max@carrify.gg",
        name: "Max"
      }}
    )
  }
}
