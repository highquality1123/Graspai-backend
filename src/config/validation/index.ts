import * as Joi from 'joi';

/**
 * Schéma de validation des variables d'environnement au démarrage.
 *
 * Ne sont marquées `.required()` que les variables CRITIQUES : sans elles l'application
 * ne peut pas fonctionner, et Joi fait échouer le boot immédiatement (fail-fast) plutôt
 * que de laisser un crash survenir à la première requête.
 *
 * Les variables OPTIONNELLES par feature (OpenAI, Stripe, S3, email, analytics...) ne sont
 * PAS listées ici : `allowUnknown` les laisse passer. Une clé manquante ne bloque pas le boot ;
 * c'est la feature concernée qui échoue/se désactive proprement à l'usage. Le catalogue complet,
 * critique comme optionnel, est documenté dans `.env.example`.
 */
export const validationSchema = Joi.object({
  // ── Core ────────────────────────────────────────────────
  PORT: Joi.number().default(3100),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // ── Critique — l'app ne démarre pas sans ────────────────
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_SECRET: Joi.string().required(),
  SUPABASE_JWT_SECRET: Joi.string().required(),
  EXPRESS_SESSION_SECRET: Joi.string().required(),

  // ── Worker de jobs (optionnels, avec bornes) ────────────
  // Validés au boot : une faute de frappe (ex. `2s`) échoue franchement au démarrage plutôt
  // que de produire un NaN -> setInterval(NaN) qui martèle la DB (cf. db-job-worker.ts).
  JOBS_WORKER_ENABLED: Joi.boolean().default(true),
  JOBS_POLL_INTERVAL_MS: Joi.number().integer().min(250).default(2000),
  JOBS_CONCURRENCY: Joi.number().integer().min(1).max(50).default(1),
  JOBS_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),

  // ── Documents (optionnels, avec bornes) ─────────────────
  // Garde-fou INFRA (pas règle produit) : l'extraction PDF est en mémoire et le worker partage
  // le conteneur avec l'API (EB mono-conteneur) — borne l'upload pour éviter un OOM global.
  DOCUMENTS_PDF_MAX_SIZE_MB: Joi.number().integer().min(1).max(1024).default(100),
});

/**
 * Options passées à Joi par ConfigModule.
 *  - `allowUnknown` : laisse passer les variables optionnelles non listées ci-dessus.
 *  - `abortEarly: false` : signale TOUTES les variables critiques manquantes d'un coup au boot.
 */
export const validationOptions = {
  allowUnknown: true,
  abortEarly: false,
};
