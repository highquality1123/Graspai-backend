import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { COLOR_MODES, ColorMode } from './user-profile.types';

/**
 * openapi.yaml → UpdateUserProfileRequest. Whitelist STRICTE (ValidationPipe global) : seuls les
 * champs listés ici sont acceptés — `role`, `is_premium_user`, `profile_status`, `confirmed`,
 * `sso_enabled` restent EXCLUS (anti privilege-escalation : un `{ "role": "admin" }` prend 422).
 * `email` est modifiable au contrat ; sa propagation à Supabase Auth (source de vérité des
 * identités) est gérée dans le service. `minProperties: 1` est vérifié en service.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(COLOR_MODES)
  colorMode?: ColorMode;

  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;
}
