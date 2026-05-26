import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableShutdownHooks();
    app.use(json({ verify: (req: any, _res, buf) => {req.rawBody = buf; } }));
    app.enableCors({ origin: 'http://localhost:8000', credentials: true });
    await app.listen(3000);
}
bootstrap();

