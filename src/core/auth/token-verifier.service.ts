import { Injectable } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { AuthUser } from './auth-user';

/**
 * Validation locale du JWT Supabase (HS256, secret legacy).
 * Le jour du passage aux signing keys asymétriques (JWKS), seul l'intérieur
 * de cette classe change : remplacer la clé symétrique par
 * `createRemoteJWKSet(new URL(...))` dans le même appel `jwtVerify`.
 * Ni le guard ni les handlers ne doivent connaître l'algorithme.
 */
@Injectable()
export class TokenVerifierService {
  private readonly key: Uint8Array;

  constructor() {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET must be set (Supabase JWT secret, used to verify Bearer tokens)');
    }
    this.key = new TextEncoder().encode(secret);
  }

  async verify(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    });

    if (!payload.sub) {
      throw new Error('Token payload has no sub claim');
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  }
}
