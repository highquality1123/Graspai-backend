import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from './auth-user';
import { BearerAuthGuard } from './bearer-auth.guard';
import { TokenVerifierService } from './token-verifier.service';

interface ContextOptions {
  authorization?: string;
  contextType?: string;
}

function createContext(options: ContextOptions = {}): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user?: AuthUser };
} {
  const request: { headers: Record<string, string>; user?: AuthUser } = {
    headers: options.authorization ? { authorization: options.authorization } : {},
  };

  const context = {
    getType: () => options.contextType ?? 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('BearerAuthGuard', () => {
  const user: AuthUser = { userId: 'user-uuid', email: 'user@graspr.ai' };
  let reflector: Reflector;
  let tokenVerifier: TokenVerifierService;
  let guard: BearerAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    tokenVerifier = { verify: jest.fn().mockResolvedValue(user) } as unknown as TokenVerifierService;
    guard = new BearerAuthGuard(reflector, tokenVerifier);
  });

  it('allows a valid Bearer token and attaches the user to the request', async () => {
    const { context, request } = createContext({ authorization: 'Bearer valid-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenVerifier.verify).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(user);
  });

  it('bypasses routes marked @Public without verifying anything', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const { context } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('bypasses non-HTTP contexts (legacy Socket.io gateway)', async () => {
    const { context } = createContext({ contextType: 'ws' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a request without Authorization header', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer Authorization scheme', async () => {
    const { context } = createContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the verifier throws, with the contract error shape', async () => {
    (tokenVerifier.verify as jest.Mock).mockRejectedValue(new Error('expired'));
    const { context } = createContext({ authorization: 'Bearer expired-token' });

    try {
      await guard.canActivate(context);
      fail('expected UnauthorizedException');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual({
        message: 'Invalid or expired token',
        code: 'UNAUTHORIZED',
      });
    }
  });
});
