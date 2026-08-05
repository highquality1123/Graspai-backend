import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthUser } from './auth-user';

/**
 * Injecte l'identité extraite du JWT par la garde Bearer.
 * Exemple : `me(@CurrentUser() user: AuthUser)` → `{ userId, email }`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
