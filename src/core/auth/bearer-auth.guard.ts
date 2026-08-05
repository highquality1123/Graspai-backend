import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenVerifierService } from './token-verifier.service';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // La garde ne couvre que le HTTP : le gateway Socket.io legacy (136k users)
    // ne doit pas être impacté par le socle V2.
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({ message: 'Missing bearer token', code: 'UNAUTHORIZED' });
    }

    try {
      request.user = await this.tokenVerifier.verify(token);
    } catch {
      throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'UNAUTHORIZED' });
    }

    return true;
  }

  private extractBearerToken(header?: string): string | undefined {
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
