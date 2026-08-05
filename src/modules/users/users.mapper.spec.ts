import { ProfileRow } from './model/user-profile.types';
import { toUserProfile } from './users.mapper';

function profileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    full_name: 'Jane Doe',
    profile_picture: null,
    language: 'fr',
    color_mode: 'dark',
    onboarding_complete: true,
    created_at: '2026-07-21T00:00:00Z',
    updated_at: '2026-07-21T10:00:00Z',
    ...overrides,
  };
}

describe('toUserProfile', () => {
  it('maps the contract shape (openapi.yaml → UserProfile)', () => {
    expect(toUserProfile(profileRow())).toEqual({
      id: 'user-1',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      profilePicture: null,
      language: 'fr',
      colorMode: 'dark',
      onboardingComplete: true,
      createdAt: '2026-07-21T00:00:00Z',
      updatedAt: '2026-07-21T10:00:00Z',
    });
  });

  it('never leaks any of the 9 internal columns (OTP included)', () => {
    const profile = toUserProfile(profileRow());
    for (const internal of [
      'role',
      'is_premium_user',
      'profile_status',
      'confirmed',
      'sso_enabled',
      'confirmation_otp',
      'confirmation_otp_expiry',
      'password_reset_otp',
      'password_reset_otp_expiry',
      // et les noms bruts snake_case du sous-ensemble sélectionné :
      'full_name',
      'profile_picture',
      'color_mode',
      'onboarding_complete',
      'created_at',
      'updated_at',
    ]) {
      expect(profile).not.toHaveProperty(internal);
    }
  });

  it('guarantees a string fullName when full_name is null (contract required field)', () => {
    expect(toUserProfile(profileRow({ full_name: null })).fullName).toBe('');
  });

  it('falls back to createdAt when updated_at is null (legacy rows, contract required field)', () => {
    const profile = toUserProfile(profileRow({ updated_at: null }));
    expect(profile.updatedAt).toBe('2026-07-21T00:00:00Z');
  });
});
