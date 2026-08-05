import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exclut une route (ou un controller entier) de la garde Bearer globale.
 * Usages légitimes : health-check, webhook Stripe (signature propre),
 * et les controllers legacy V1 dont l'auth (headers access/refresh) est gérée en interne.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
