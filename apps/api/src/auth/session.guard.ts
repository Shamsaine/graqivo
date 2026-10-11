import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; emailVerified: boolean };
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException('Sign in to continue');
    if (!session.user.emailVerified)
      throw new ForbiddenException('Verify your email to continue');
    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
    };
    return true;
  }
}
