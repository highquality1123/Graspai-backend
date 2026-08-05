import { SupabaseService } from '../supabase/supabase.service';
import { BillingEmailSyncService } from './billing-email-sync.service';

type Result = { data?: unknown; error?: unknown };

function chain(result: Result) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'eq', 'not', 'limit'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

function serviceWith(subRow: Result, customersUpdate = jest.fn().mockResolvedValue({})) {
  const client = { from: jest.fn(() => chain(subRow)) };
  const svc = new BillingEmailSyncService({ getClient: () => client } as unknown as SupabaseService);
  // Injecte un client Stripe mocké (contourne getClient/STRIPE_SECRET_KEY).
  (svc as unknown as { client: unknown }).client = { customers: { update: customersUpdate } };
  return { svc, customersUpdate, from: client.from };
}

describe('BillingEmailSyncService', () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });
  afterAll(() => {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
    else delete process.env.STRIPE_SECRET_KEY;
  });

  it('updates the Stripe customer email when the user has a stripe_customer_id', async () => {
    const { svc, customersUpdate } = serviceWith({ data: { stripe_customer_id: 'cus_123' }, error: null });

    await svc.syncEmail('user-1', 'new@example.com');

    expect(customersUpdate).toHaveBeenCalledWith('cus_123', { email: 'new@example.com' });
  });

  it('is a no-op when the user never subscribed (no stripe_customer_id)', async () => {
    const { svc, customersUpdate } = serviceWith({ data: null, error: null });

    await svc.syncEmail('user-1', 'new@example.com');

    expect(customersUpdate).not.toHaveBeenCalled();
  });

  it('swallows a Stripe failure — best-effort, never throws (the PATCH already succeeded)', async () => {
    const { svc } = serviceWith(
      { data: { stripe_customer_id: 'cus_123' }, error: null },
      jest.fn().mockRejectedValue(new Error('Stripe down')),
    );

    await expect(svc.syncEmail('user-1', 'new@example.com')).resolves.toBeUndefined();
  });

  it('is a no-op (no query) when STRIPE_SECRET_KEY is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const client = { from: jest.fn() };
    const svc = new BillingEmailSyncService({ getClient: () => client } as unknown as SupabaseService);

    await svc.syncEmail('user-1', 'new@example.com');

    expect(client.from).not.toHaveBeenCalled();
  });
});
