import { ProfileRow, UserProfile } from './model/user-profile.types';

/**
 * Ligne `profiles` (sous-ensemble PROFILE_SELECT) → `UserProfile` (contrat).
 * Anti-fuite : `role`, `is_premium_user`, `profile_status`, `confirmed`, `sso_enabled` et
 * les 4 colonnes OTP ne sont jamais sélectionnées en amont — ce mapper ne peut pas les voir.
 * `fullName` : `full_name` nullable en DB → `?? ''` (contrat required, pattern notebooks).
 * `updatedAt` : `updated_at` nullable sur les lignes legacy → retombe sur `created_at`
 * (contrat required date-time).
 */
export function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? '',
    profilePicture: row.profile_picture,
    language: row.language,
    colorMode: row.color_mode,
    onboardingComplete: row.onboarding_complete,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}
