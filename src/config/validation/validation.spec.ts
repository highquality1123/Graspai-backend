import { validationSchema, validationOptions } from './index';

const CRITICAL = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_SECRET: 'service-role-secret',
  SUPABASE_JWT_SECRET: 'jwt-secret',
  EXPRESS_SESSION_SECRET: 'session-secret',
};

describe('env validationSchema', () => {
  it('accepts a config with all critical vars set', () => {
    const { error } = validationSchema.validate(CRITICAL, validationOptions);
    expect(error).toBeUndefined();
  });

  it.each(Object.keys(CRITICAL))('fails fast when the critical var %s is missing', (key) => {
    const config = { ...CRITICAL };
    delete config[key];
    const { error } = validationSchema.validate(config, validationOptions);
    expect(error).toBeDefined();
    expect(error?.message).toContain(key);
  });

  it('reports ALL missing critical vars at once (abortEarly: false)', () => {
    const { error } = validationSchema.validate({}, validationOptions);
    expect(error?.details.map((d) => d.context?.key).sort()).toEqual([
      'EXPRESS_SESSION_SECRET',
      'SUPABASE_JWT_SECRET',
      'SUPABASE_SERVICE_ROLE_SECRET',
      'SUPABASE_URL',
    ]);
  });

  it('applies the default PORT and NODE_ENV', () => {
    const { value } = validationSchema.validate(CRITICAL, validationOptions);
    expect(value.PORT).toBe(3100);
    expect(value.NODE_ENV).toBe('development');
  });

  it('lets optional per-feature vars through (allowUnknown)', () => {
    const { error } = validationSchema.validate(
      { ...CRITICAL, OPENAI_API_KEY: 'sk-test', STRIPE_SECRET_KEY: 'sk_live' },
      validationOptions,
    );
    expect(error).toBeUndefined();
  });

  it('rejects a non-URL SUPABASE_URL', () => {
    const { error } = validationSchema.validate({ ...CRITICAL, SUPABASE_URL: 'not-a-url' }, validationOptions);
    expect(error?.message).toContain('SUPABASE_URL');
  });
});
