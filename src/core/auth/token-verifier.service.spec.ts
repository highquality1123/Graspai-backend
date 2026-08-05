import { SignJWT } from 'jose';
import { TokenVerifierService } from './token-verifier.service';

const SECRET = 'unit-test-supabase-jwt-secret-with-enough-length';
const KEY = new TextEncoder().encode(SECRET);

interface SignOptions {
  sub?: string;
  email?: string;
  audience?: string;
  algorithm?: 'HS256' | 'HS512';
  expiresAt?: number;
  key?: Uint8Array;
}

async function signToken(options: SignOptions = {}): Promise<string> {
  const {
    sub = '4f6c1c8e-1234-4bcd-9e21-abcdef012345',
    email = 'user@graspr.ai',
    audience = 'authenticated',
    algorithm = 'HS256',
    expiresAt = Math.floor(Date.now() / 1000) + 3600,
    key = KEY,
  } = options;

  const jwt = new SignJWT({ email })
    .setProtectedHeader({ alg: algorithm })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt);

  if (sub) {
    jwt.setSubject(sub);
  }

  return jwt.sign(key);
}

describe('TokenVerifierService', () => {
  let service: TokenVerifierService;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    service = new TokenVerifierService();
  });

  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('throws at construction when SUPABASE_JWT_SECRET is missing', () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(() => new TokenVerifierService()).toThrow('SUPABASE_JWT_SECRET');
  });

  it('returns userId and email for a valid token', async () => {
    const token = await signToken();
    await expect(service.verify(token)).resolves.toEqual({
      userId: '4f6c1c8e-1234-4bcd-9e21-abcdef012345',
      email: 'user@graspr.ai',
    });
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signToken({ key: new TextEncoder().encode('another-secret-entirely-different') });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with a wrong audience', async () => {
    const token = await signToken({ audience: 'anon' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token signed with a non-HS256 algorithm', async () => {
    const token = await signToken({ algorithm: 'HS512' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token without sub claim', async () => {
    const token = await signToken({ sub: '' });
    await expect(service.verify(token)).rejects.toThrow('sub');
  });

  it('rejects a malformed token', async () => {
    await expect(service.verify('not-a-jwt')).rejects.toThrow();
  });
});
