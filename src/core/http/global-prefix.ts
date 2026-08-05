import { RequestMethod } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

/**
 * Préfixe global des routes HTTP. Le contrat sert tout sous `/v1`
 * (openapi.yaml → servers: https://api.graspr.ai/v1), le front absorbe `/v1` dans sa base URL.
 */
export const GLOBAL_PREFIX = 'v1';

/**
 * Routes exclues du préfixe — elles gardent leur chemin racine :
 *  - `GET /health/check` : sonde de santé de l'infra (load balancer / Elastic Beanstalk), URL figée.
 *  - `POST /stripe/webhook` : URL enregistrée côté Stripe, ne doit pas bouger sous peine de casser le webhook.
 */
export const GLOBAL_PREFIX_EXCLUDES: RouteInfo[] = [
  { path: 'health/check', method: RequestMethod.GET },
  { path: 'stripe/webhook', method: RequestMethod.POST },
];
