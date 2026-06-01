import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyToken } from "@clerk/backend";
import { Request } from "express";
import { AuthService } from "./auth.service";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
    private readonly logger = new Logger(ClerkAuthGuard.name);

    constructor(private config: ConfigService, private authService: AuthService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request>();
        const auth = req.headers.authorization;
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
        if (!token) throw new UnauthorizedException('Missing bearer token');

        // Step 1: verify the token signature/claims.
        let payload: Awaited<ReturnType<typeof verifyToken>>;
        try {
            payload = await verifyToken(token, {
                secretKey: this.config.getOrThrow('CLERK_SECRET_KEY'),
            });
        } catch (err) {
            this.logger.error(`Token verification failed: ${(err as Error).message}`);
            throw new UnauthorizedException('Invalid clerk token');
        }

        // Step 2: sync the user row (separate catch so DB/Clerk-API errors aren't mislabeled).
        try {
            const user = await this.authService.syncUser(payload.sub);
            (req as any).auth = { userId: payload.sub, user, claims: payload };
            return true;
        } catch (err) {
            this.logger.error(`User sync failed for ${payload.sub}: ${(err as Error).message}`, (err as Error).stack);
            throw new UnauthorizedException('Failed to sync user');
        }
    }
}
