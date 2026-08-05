import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BillingEmailSyncService } from './billing-email-sync.service';
import { ProfileRow } from './model/user-profile.types';
import { UsersService } from './users.service';

type Result = { data?: unknown; error?: unknown };

/** Query builder Supabase mocké : chaînable + thenable ; `single`/`maybeSingle` résolvent `result`. */
function chain(result: Result) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'ilike', 'is', 'in', 'order'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

/** Mock de l'admin API Auth (updateUserById) — jest.fn par test pour asserter les appels. */
function authMock(updateUserById = jest.fn().mockResolvedValue({ error: null })) {
  return { admin: { updateUserById } };
}

/** Client mocké : par TABLE, une file de chaînes consommées dans l'ordre, + auth admin. */
function supabaseMock(byTable: Record<string, ReturnType<typeof chain>[]>, auth = authMock()) {
  const index: Record<string, number> = {};
  const from = jest.fn((table: string) => {
    const queue = byTable[table] ?? [];
    const i = index[table] ?? 0;
    index[table] = i + 1;
    return queue[i] ?? chain({ data: null, error: null });
  });
  return { from, auth };
}

function serviceWith(
  client: { from: jest.Mock; auth?: unknown },
  billing = { syncEmail: jest.fn().mockResolvedValue(undefined) },
): UsersService {
  return new UsersService(
    { getClient: () => client } as unknown as SupabaseService,
    billing as unknown as BillingEmailSyncService,
  );
}

function profileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    full_name: 'Jane Doe',
    profile_picture: null,
    language: null,
    color_mode: null,
    onboarding_complete: false,
    created_at: '2026-07-21T00:00:00Z',
    updated_at: '2026-07-21T00:00:00Z',
    ...overrides,
  };
}

const me = { userId: 'user-1', email: 'jane@example.com' };

describe('UsersService', () => {
  describe('getMe', () => {
    it('returns the mapped profile in one query when it exists (hot path)', async () => {
      const hit = chain({ data: profileRow(), error: null });
      const client = supabaseMock({ profiles: [hit] });

      const result = await serviceWith(client).getMe(me);

      expect(result.fullName).toBe('Jane Doe');
      expect(result).not.toHaveProperty('role');
      expect(client.from).toHaveBeenCalledTimes(1);
    });

    it('lazy-creates a missing profile with the exact legacy SSO values, concurrent-safe upsert', async () => {
      const miss = chain({ data: null, error: null });
      const upsert = chain({ error: null });
      const reselect = chain({ data: profileRow({ full_name: 'jane' }), error: null });
      const client = supabaseMock({ profiles: [miss, upsert, reselect] });

      const result = await serviceWith(client).getMe(me);

      expect(upsert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          email: 'jane@example.com',
          full_name: 'jane', // email.split('@')[0], fallback legacy
          profile_status: 'complete',
          role: 'user', // AUTH_ROLES.USER — copié à l'identique, minuscule
          confirmed: true,
        }),
        { onConflict: 'id', ignoreDuplicates: true }, // ON CONFLICT (id) DO NOTHING
      );
      expect((upsert.upsert as jest.Mock).mock.calls[0][0]).not.toHaveProperty('sso_enabled');
      expect(result.fullName).toBe('jane');
    });

    it('survives a concurrent bootstrap: DO NOTHING then re-select returns the winner row', async () => {
      // Le perdant de la course : son upsert ne fait rien, le re-select trouve la ligne de l'autre.
      const miss = chain({ data: null, error: null });
      const noopUpsert = chain({ error: null });
      const winnerRow = chain({ data: profileRow({ full_name: 'created-by-other-request' }), error: null });
      const client = supabaseMock({ profiles: [miss, noopUpsert, winnerRow] });

      const result = await serviceWith(client).getMe(me);

      expect(result.fullName).toBe('created-by-other-request');
    });

    it('throws a clear 500 when the token has no email claim (profiles.email is NOT NULL)', async () => {
      const miss = chain({ data: null, error: null });
      const upsert = chain({ error: null });
      const client = supabaseMock({ profiles: [miss, upsert] });

      await expect(serviceWith(client).getMe({ userId: 'user-1' })).rejects.toThrow(/no email claim/);
      expect(upsert.upsert).not.toHaveBeenCalled();
    });

    it('throws 500 when the bootstrap insert fails (e.g. legacy email unique violation)', async () => {
      const miss = chain({ data: null, error: null });
      const failedUpsert = chain({ error: { message: 'duplicate key value violates unique constraint' } });
      const client = supabaseMock({ profiles: [miss, failedUpsert] });

      await expect(serviceWith(client).getMe(me)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('updateMe', () => {
    it('rejects an empty patch with 422 (minProperties)', async () => {
      const service = serviceWith(supabaseMock({}));
      await expect(service.updateMe(me, {})).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('maps camelCase to snake_case and sets updated_at explicitly (no trigger on profiles)', async () => {
      const exists = chain({ data: profileRow(), error: null });
      const update = chain({ data: profileRow({ full_name: 'Jane Smith', color_mode: 'light' }), error: null });
      const client = supabaseMock({ profiles: [exists, update] });

      const result = await serviceWith(client).updateMe(me, {
        fullName: 'Jane Smith',
        colorMode: 'light',
        onboardingComplete: true,
      });

      expect(update.update).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Jane Smith',
          color_mode: 'light',
          onboarding_complete: true,
          updated_at: expect.any(String),
        }),
      );
      expect(update.eq).toHaveBeenCalledWith('id', 'user-1');
      expect(result.fullName).toBe('Jane Smith');
    });

    it('bootstraps a missing profile before patching it (same guarantee as GET)', async () => {
      const miss = chain({ data: null, error: null });
      const upsert = chain({ error: null });
      const reselect = chain({ data: profileRow(), error: null });
      const update = chain({ data: profileRow({ language: 'fr' }), error: null });
      const client = supabaseMock({ profiles: [miss, upsert, reselect, update] });

      const result = await serviceWith(client).updateMe(me, { language: 'fr' });

      expect(upsert.upsert).toHaveBeenCalled();
      expect(result.language).toBe('fr');
    });
  });

  describe('updateMe — email change', () => {
    it('changes Auth FIRST (lowercased) then mirrors to profiles and Stripe, returning the new email', async () => {
      const current = chain({ data: profileRow(), error: null }); // fetchProfile → email actuel
      const notTaken = chain({ data: null, error: null }); // emailTaken → libre
      const update = chain({ data: profileRow({ email: 'new@example.com' }), error: null });
      const auth = authMock();
      const billing = { syncEmail: jest.fn().mockResolvedValue(undefined) };
      const client = supabaseMock({ profiles: [current, notTaken, update] }, auth);

      const result = await serviceWith(client, billing).updateMe(me, { email: 'NEW@Example.com' });

      // Auth appelé avant l'UPDATE profiles, email normalisé en minuscules.
      expect(auth.admin.updateUserById).toHaveBeenCalledWith('user-1', { email: 'new@example.com' });
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com' }));
      // 3e miroir : Stripe synchronisé après le succès profiles.
      expect(billing.syncEmail).toHaveBeenCalledWith('user-1', 'new@example.com');
      expect(result.email).toBe('new@example.com');
    });

    it('rejects a taken email with 422 EMAIL_TAKEN before touching Auth (pre-check)', async () => {
      const current = chain({ data: profileRow(), error: null });
      const taken = chain({ data: { id: 'someone-else' }, error: null });
      const auth = authMock();
      const client = supabaseMock({ profiles: [current, taken] }, auth);

      await expect(serviceWith(client).updateMe(me, { email: 'taken@example.com' })).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
      expect(auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('detects a case-insensitive duplicate (legacy John@x.com vs john@x.com) → 422, not 500', async () => {
      const current = chain({ data: profileRow(), error: null });
      const takenCI = chain({ data: { id: 'legacy-user' }, error: null }); // ilike matche la casse mixte
      const auth = authMock();
      const client = supabaseMock({ profiles: [current, takenCI] }, auth);

      await expect(serviceWith(client).updateMe(me, { email: 'John@x.com' })).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
      // Pré-check via ilike sur l'email normalisé en minuscules, pas eq.
      expect(takenCI.ilike).toHaveBeenCalledWith('email', 'john@x.com');
      expect(auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('disambiguates a race: Auth fails then re-check shows taken → 422, not 500', async () => {
      const current = chain({ data: profileRow(), error: null });
      const freeBefore = chain({ data: null, error: null }); // pré-check : libre
      const takenAfter = chain({ data: { id: 'other' }, error: null }); // re-check : pris (course)
      const auth = authMock(jest.fn().mockResolvedValue({ error: { message: 'Error updating user' } }));
      const client = supabaseMock({ profiles: [current, freeBefore, takenAfter] }, auth);

      await expect(serviceWith(client).updateMe(me, { email: 'raced@example.com' })).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
    });

    it('maps a genuine Auth failure (not a duplicate) to 500', async () => {
      const current = chain({ data: profileRow(), error: null });
      const freeBefore = chain({ data: null, error: null });
      const stillFree = chain({ data: null, error: null }); // re-check : toujours libre → vraie panne
      const auth = authMock(jest.fn().mockResolvedValue({ error: { message: 'boom' } }));
      const client = supabaseMock({ profiles: [current, freeBefore, stillFree] }, auth);

      await expect(serviceWith(client).updateMe(me, { email: 'x@example.com' })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('rolls back Auth to the old email when the profiles mirror update fails', async () => {
      const current = chain({ data: profileRow({ email: 'old@example.com' }), error: null });
      const notTaken = chain({ data: null, error: null });
      const updateFails = chain({ data: null, error: { message: 'db down' } });
      const auth = authMock();
      const client = supabaseMock({ profiles: [current, notTaken, updateFails] }, auth);
      const meOld = { userId: 'user-1', email: 'old@example.com' };

      await expect(serviceWith(client).updateMe(meOld, { email: 'new@example.com' })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      // 1er appel : changement vers new ; 2e appel : rollback vers old.
      expect(auth.admin.updateUserById).toHaveBeenNthCalledWith(1, 'user-1', { email: 'new@example.com' });
      expect(auth.admin.updateUserById).toHaveBeenNthCalledWith(2, 'user-1', { email: 'old@example.com' });
    });

    it('treats an unchanged email as a no-op (no Auth call) and still applies other fields', async () => {
      const current = chain({ data: profileRow({ email: 'jane@example.com' }), error: null });
      const update = chain({ data: profileRow({ full_name: 'Jane R' }), error: null });
      const auth = authMock();
      const client = supabaseMock({ profiles: [current, update] }, auth);

      await serviceWith(client).updateMe(me, { email: 'jane@example.com', fullName: 'Jane R' });

      expect(auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Jane R' }));
      expect(update.update).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }));
    });
  });
});
