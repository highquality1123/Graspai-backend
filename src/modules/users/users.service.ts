import { Injectable, InternalServerErrorException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthUser } from '../../core/auth/auth-user';
import { SupabaseService } from '../supabase/supabase.service';
import { BillingEmailSyncService } from './billing-email-sync.service';
import { UpdateMeDto } from './model/update-me.dto';
import { ProfileRow, UserProfile } from './model/user-profile.types';
import { toUserProfile } from './users.mapper';

/**
 * SELECT EXPLICITE des seules colonnes du contrat (jamais de `select('*')`) : les colonnes
 * internes — `role`, `is_premium_user`, `profile_status`, `confirmed`, `sso_enabled`,
 * `confirmation_otp(_expiry)`, `password_reset_otp(_expiry)` — ne sont JAMAIS demandées.
 * Un OTP legacy qui fuiterait serait une faille : il ne peut pas sortir par construction.
 */
const PROFILE_SELECT =
  'id, email, full_name, profile_picture, language, color_mode, onboarding_complete, created_at, updated_at';

/**
 * Valeurs du lazy-create, copiées À L'IDENTIQUE du lazy-create SSO legacy éprouvé en prod
 * (auth.service.ts:211-222, enum AUTH_ROLES.USER = 'user' — vérifié, pas supposé), sans
 * `sso_enabled` (on ne connaît pas le flux d'origine ici).
 */
const LAZY_CREATE_DEFAULTS = {
  profile_status: 'complete',
  role: 'user',
  confirmed: true,
} as const;

/**
 * Users/me V2 — profil de l'utilisateur courant (`public.profiles`, migration 012).
 * Identité : `userId` = claim `sub` du JWT = `auth.uid()` = `profiles.id` — pas de scoping
 * 404, on lit toujours SON profil.
 * Bootstrap (arbitrage D') : le contrat suppose un trigger Supabase qui N'EXISTE PAS (vérifié,
 * v2-socle-debt §9) — le profil absent est créé ICI, lazy, comme le fait le flux SSO legacy.
 * Concurrent-safe par la DB : upsert `ignoreDuplicates` = `ON CONFLICT (id) DO NOTHING`.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly billingEmailSync: BillingEmailSyncService,
  ) {}

  async getMe(user: AuthUser): Promise<UserProfile> {
    const row = await this.fetchProfile(user.userId);
    if (row) return toUserProfile(row);
    return toUserProfile(await this.lazyCreateProfile(user));
  }

  async updateMe(user: AuthUser, dto: UpdateMeDto): Promise<UserProfile> {
    const patch: Record<string, unknown> = {};
    if (dto.fullName !== undefined) patch.full_name = dto.fullName;
    if (dto.language !== undefined) patch.language = dto.language;
    if (dto.colorMode !== undefined) patch.color_mode = dto.colorMode;
    if (dto.onboardingComplete !== undefined) patch.onboarding_complete = dto.onboardingComplete;
    const wantsEmail = dto.email !== undefined;
    if (Object.keys(patch).length === 0 && !wantsEmail) {
      throw new UnprocessableEntityException({
        message: 'At least one field must be provided',
        code: 'VALIDATION_FAILED',
      });
    }

    // Un PATCH sur profil absent le bootstrape d'abord (même garantie que GET) — et nous donne
    // l'email ACTUEL, nécessaire pour détecter un vrai changement et pour un éventuel rollback.
    const current = (await this.fetchProfile(user.userId)) ?? (await this.lazyCreateProfile(user));

    // Changement d'email : Supabase Auth est la source de vérité des identités (le contrat le dit).
    // On l'écrit D'ABORD ; `profiles.email` (miroir) suit dans le même UPDATE que les autres champs.
    let emailChanged = false;
    if (wantsEmail) {
      const newEmail = (dto.email as string).trim().toLowerCase(); // comme le legacy + Supabase Auth
      if (newEmail !== current.email) {
        await this.changeAuthEmail(user.userId, newEmail);
        patch.email = newEmail;
        emailChanged = true;
      }
    }

    // Email fourni mais identique + aucun autre champ : no-op idempotent, on renvoie l'existant.
    if (Object.keys(patch).length === 0) return toUserProfile(current);

    // Pas de trigger set_updated_at sur profiles (vérifié empiriquement le 21 Jul) → explicite.
    patch.updated_at = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.userId)
      .select(PROFILE_SELECT)
      .single();
    if (error) {
      // Auth a déjà changé (source de vérité à jour) mais le miroir a échoué : on ROLLBACK Auth
      // à l'ancien email — l'état « moins pire » est source ET miroir cohérents sur l'ancien.
      if (emailChanged) await this.rollbackAuthEmail(user.userId, current.email, patch.email as string);
      throw new InternalServerErrorException(error.message);
    }

    // Auth + profiles à jour : on propage au 3e miroir (customer Stripe), best-effort — un échec
    // ne fait jamais échouer le PATCH (résiliation involontaire + doublon de customer évités).
    if (emailChanged) await this.billingEmailSync.syncEmail(user.userId, patch.email as string);

    return toUserProfile(data as ProfileRow);
  }

  // ── privé ────────────────────────────────────────────────────────────────

  /**
   * Propage le changement d'email à Supabase Auth (source de vérité). L'admin API change
   * l'email IMMÉDIATEMENT (vérifié : pas de flux « pending », le JWT courant reste valide).
   * Doublon : l'erreur d'Auth est un 500 générique inexploitable → on PRÉ-CHECK `profiles`
   * (miroir UNIQUE) avant, et on RE-CHECK après un échec pour désambiguïser course vs panne.
   */
  private async changeAuthEmail(userId: string, newEmail: string): Promise<void> {
    if (await this.emailTaken(newEmail, userId)) {
      throw new UnprocessableEntityException({ message: 'This email is already in use', code: 'EMAIL_TAKEN' });
    }
    const { error } = await this.supabase.auth.admin.updateUserById(userId, { email: newEmail });
    if (error) {
      // L'email a-t-il été pris entre le pré-check et maintenant (course) ? → 422, pas 500.
      if (await this.emailTaken(newEmail, userId)) {
        throw new UnprocessableEntityException({ message: 'This email is already in use', code: 'EMAIL_TAKEN' });
      }
      this.logger.error(`Email change failed in Supabase Auth for user ${userId}: ${error.message}`);
      throw new InternalServerErrorException('Email change failed');
    }
  }

  /**
   * L'email est-il déjà porté par un AUTRE profil ? Comparaison INSENSIBLE À LA CASSE (`ilike`) :
   * Postgres applique UNIQUE sensible à la casse, mais Supabase Auth normalise en minuscules et la
   * sémantique des emails l'est aussi. Un profil legacy `John@x.com` vs une demande `john@x.com`
   * doit compter comme « pris » — sinon le pré-check laisserait passer, Auth refuserait, et la
   * désambiguïsation renverrait 500 au lieu de 422. Métacaractères `%`/`_`/`\` échappés (`_` est
   * un caractère d'email valide). `newEmail` est déjà en minuscules (normalisé par updateMe).
   */
  private async emailTaken(email: string, selfId: string): Promise<boolean> {
    const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id')
      .ilike('email', pattern)
      .neq('id', selfId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return data != null;
  }

  /** Rollback best-effort d'Auth après échec du miroir — ne masque jamais l'erreur d'origine. */
  private async rollbackAuthEmail(userId: string, oldEmail: string, newEmail: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(userId, { email: oldEmail });
    if (error) {
      this.logger.error(
        `MANUAL RECONCILE needed for user ${userId}: Auth email = "${newEmail}" but profiles update ` +
          `failed AND Auth rollback to "${oldEmail}" failed (${error.message}). Login uses the new email; ` +
          `the profile mirror is stale until reconciled.`,
      );
    } else {
      this.logger.error(
        `profiles update failed after Auth email change for user ${userId}; Auth rolled back to "${oldEmail}".`,
      );
    }
  }

  private async fetchProfile(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await this.supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as ProfileRow) ?? null;
  }

  /**
   * Bootstrap du profil manquant (inscrit natif sans passage legacy, ou création ratée).
   * CONCURRENT-SAFE : `ignoreDuplicates` → `ON CONFLICT (id) DO NOTHING` — deux requêtes
   * simultanées font la course en DB, l'une insère, l'autre ne fait rien, les deux
   * re-selectent la même ligne. Jamais de « if-not-exists-then-insert » applicatif.
   */
  private async lazyCreateProfile(user: AuthUser): Promise<ProfileRow> {
    if (!user.email) {
      // `profiles.email` est NOT NULL : sans claim email, aucun bootstrap possible.
      this.logger.error(`Cannot bootstrap profile for user ${user.userId}: no email claim in the token`);
      throw new InternalServerErrorException('Cannot bootstrap profile: no email claim in the token');
    }

    const now = new Date().toISOString();
    const { error } = await this.supabase.from('profiles').upsert(
      {
        id: user.userId,
        email: user.email,
        full_name: user.email.split('@')[0], // fallback legacy (auth.service.ts:213)
        created_at: now,
        updated_at: now,
        ...LAZY_CREATE_DEFAULTS,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) {
      // Ex. violation d'unicité sur email (vieux compte, même email, autre id) : état
      // réellement incohérent — 500 loggé, pas de bricolage.
      this.logger.error(`Profile bootstrap failed for user ${user.userId}: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }

    const row = await this.fetchProfile(user.userId);
    if (!row) {
      this.logger.error(`Profile bootstrap for user ${user.userId} left no row (unexpected)`);
      throw new InternalServerErrorException('Profile bootstrap failed');
    }
    this.logger.log(`Profile bootstrapped lazily for user ${user.userId}`);
    return row;
  }
}
