import { Module } from '@nestjs/common';
import { BillingEmailSyncService } from './billing-email-sync.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Domaine V2 Users/me (routes `/users/me`, tag Users) — profil de l'utilisateur courant.
 * Route globale → `users/` (comme `search/`), pas de préfixe notebook-*.
 * Les autres routes du tag (DELETE compte, onboarding, change-password, notification-
 * preferences, streak, friends…) sont des tranches ultérieures et s'ajouteront ici.
 * SupabaseService est global (pas d'import). Ajouté à V2_MODULES pour le Swagger V2.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, BillingEmailSyncService],
})
export class UsersModule {}
