import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Propage un changement d'email au customer Stripe — le 3e miroir de l'identité (après Supabase
 * Auth et `profiles`). Sans ça, deux conséquences réelles côté REVENU :
 *  - les relances de paiement (dunning) partent sur l'ANCIENNE adresse → résiliation involontaire ;
 *  - `getCheckoutSession` (stripe.service.ts) cherche le customer PAR EMAIL → au prochain
 *    checkout il n'est plus trouvé et un DOUBLON de customer est créé.
 *
 * BEST-EFFORT strict : Stripe est un 3e système sans rollback possible (Auth + profiles ont déjà
 * réussi quand on arrive ici). Un échec est loggé, JAMAIS propagé — il ne doit pas faire échouer
 * le PATCH. Découplé du module Stripe legacy à dessein (pas d'import de `StripeService`, qui
 * traînerait Stats/Amplitude dans le graphe V2). `STRIPE_SECRET_KEY` n'est pas requise au boot
 * (philosophie socle) : absente → no-op silencieux.
 */
@Injectable()
export class BillingEmailSyncService {
  private readonly logger = new Logger(BillingEmailSyncService.name);
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();
  private client?: Stripe;

  constructor(private readonly supabaseService: SupabaseService) {}

  async syncEmail(userId: string, newEmail: string): Promise<void> {
    const stripe = this.getClient();
    if (!stripe) return; // Stripe non configuré (feature off) — dégradation propre.

    try {
      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const customerId = (data as { stripe_customer_id: string } | null)?.stripe_customer_id;
      if (!customerId) return; // user jamais abonné → aucun customer Stripe à synchroniser.

      await stripe.customers.update(customerId, { email: newEmail });
      this.logger.log(`Stripe customer ${customerId} email synced for user ${userId}`);
    } catch (err) {
      // Best-effort : Auth + profiles sont déjà à jour, on ne casse pas le PATCH pour Stripe.
      this.logger.error(
        `Stripe email sync failed for user ${userId} (Auth + profile are updated; billing email is stale)`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private getClient(): Stripe | undefined {
    if (this.client) return this.client;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return undefined;
    this.client = new Stripe(key, { apiVersion: '2023-10-16' });
    return this.client;
  }
}
