import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyToken } from "@clerk/backend";
import { Request } from "express";
import { AuthService } from "./auth.service";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
    constructor(private config: ConfigService, private authService: AuthService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request>();
        const auth = req.headers.authorization;
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
        if (!token) throw new UnauthorizedException('Missing bearer token');

        try  {
            const payload = await verifyToken(token, {
                secretKey: this.config.getOrThrow('CLERK_SECRET_KEY'),
            });
            const user = await this.authService.syncUser(payload.sub);
            (req as any).auth = { userId: payload.sub, user, claims: payload };
            return true;
        } catch {
            throw new UnauthorizedException('Invalid clerk token');
        }
    }
}
