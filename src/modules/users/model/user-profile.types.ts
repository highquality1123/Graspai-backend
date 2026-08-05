export const COLOR_MODES = ['light', 'auto', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

// ── Forme de réponse (openapi.yaml → schema UserProfile, au champ près) ──────

/** openapi.yaml → schema UserProfile. */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  profilePicture: string | null;
  language: string | null;
  colorMode: ColorMode | null;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Ligne DB interne (snake_case) — ne sort JAMAIS telle quelle ─────────────

/**
 * Sous-ensemble lu de `public.profiles` — UNIQUEMENT les colonnes du PROFILE_SELECT.
 * Les colonnes internes (role, is_premium_user, profile_status, confirmed, sso_enabled,
 * confirmation_otp*, password_reset_otp*) ne sont JAMAIS sélectionnées : elles n'existent
 * pas dans ce type, elles ne peuvent pas fuiter par construction.
 */
export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  profile_picture: string | null;
  language: string | null;
  color_mode: ColorMode | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string | null;
}
