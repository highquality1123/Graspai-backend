# CLAUDE.md

Contexte pour toute session Claude Code (ou tout dev) sur le **backend V2 de GrasprAI**.
À lire en premier. Il décrit **comment on travaille maintenant**, pas l'historique legacy.

---

## Le projet

- **Backend V2 de GrasprAI**, reconstruit en **contract-first** sur `openapi.yaml` (gelé, tag
  git `contract-v1` ; jumeau anglais `openapi.en.yaml`). **Principe fondamental :
  LE CODE SE CONFORME AU CONTRAT, JAMAIS L'INVERSE.** On ne modifie pas le contrat pour
  arranger le code.
- **Stack réelle** : NestJS 10 + TypeScript, Supabase (Postgres, accès via `@supabase/supabase-js`
  en **service-role**), déploiement **AWS Elastic Beanstalk mono-conteneur** (Docker).
- **Cohabitation legacy / V2** : le legacy tourne encore en prod (**~136k users**, 16 controllers
  non documentés). On **migre domaine par domaine**. Le neuf est strict et propre ; **le legacy
  ne bouge qu'au moment de sa migration** — on ne le refactore pas à côté.

---

## Comment on travaille (process, non-négociable)

- **Goal par goal.** Claude Code montre un **plan / une structure AVANT de coder**, l'humain
  valide, PUIS implémentation, **puis STOP**. On ne coule pas le béton avant validation du moule.
- **On s'ancre dans le RÉEL.** On inspecte la **vraie DB / le vrai code** avant de décider ; on
  ne suit pas un plan à l'aveugle. Si le réel contredit le plan (colonne absente, table déjà là,
  contrainte inattendue), **on le signale** et on propose — **pas de bricolage silencieux**.
- **On montre les diffs avant de committer.** Commits **atomiques**, un sujet par commit,
  messages **anglais conventional-commit, une phrase, AUCUNE signature ni mention d'outil**
  (pas de `Co-Authored-By`, pas de « Generated with… »).
- **On ne push pas sans que l'humain le demande.**
- **Migrations DB** : fichiers `.sql` dans `database/` (nommage `00X-DDMonYYYY-description/`),
  **appliqués MANUELLEMENT par l'humain via le SQL Editor Supabase** — jamais auto-appliqués par
  l'outil. Elles doivent être **additives et réversibles** (on ne casse pas le legacy).

---

## Conventions de code

La référence détaillée et ancrée sur du vrai code est **`docs/domain-structure.md`** — à lire
avant de créer un domaine. Le **gabarit de référence est `src/modules/notebooks/`** : un nouveau
domaine se **calque dessus** (copie, renomme, conforme au contrat). En résumé :

- **Garde Bearer globale** (`APP_GUARD` dans `src/core/core.module.ts`) : toutes les routes sont
  protégées **par défaut**. Le neuf **n'utilise jamais `@Public()`** (réservé au legacy).
  Utilisateur récupéré via `@CurrentUser()`.
- **Scoping `user_id` DANS le service → 404 (jamais 403)** si la ressource est absente ou
  non-possédée (on ne révèle pas l'existence).
- **Erreurs `{ message, code }`** : on jette une `HttpException`, jamais de formatage manuel — le
  **filtre global** (`src/core/http/all-exceptions.filter.ts`) met tout au format contrat.
- **DTO = classes `class-validator`, whitelist stricte** : le `ValidationPipe` global rejette tout
  champ inconnu en **422** (`src/core/http/validation-pipe.ts`).
- **Mapper anti-fuite** : ligne DB (snake_case) → forme du contrat (camelCase). **Aucune colonne
  interne ne sort** (`user_id`, `deleted_at`, `schema_version`, noms legacy…).
- **Soft-delete `deleted_at`** : supprimer = `UPDATE … SET deleted_at = now()` ; toutes les
  lectures filtrent `deleted_at IS NULL`.
- **Ajouter le module à `V2_MODULES`** (`src/core/swagger/swagger.ts`) et à `app.module.ts`.
- **Fichiers en LF** (imposé par `.gitattributes`).

Le socle transverse (garde, filtre, pipe, préfixe `/v1`, config fail-fast, worker de jobs) est
dans `src/core/` et `src/config/`. Le préfixe global `/v1` a deux exclusions figées
(`GET /health/check`, `POST /stripe/webhook` — voir `src/core/http/global-prefix.ts`).

---

## Sécurité (leçons acquises)

- **La CI est le gatekeeper — elle vérifie, elle ne corrige pas** (`.github/workflows/ci.yml`).
  Bloquent le merge : **Gitleaks** (secrets + patterns de dropper), **audit-ci** sur baseline
  (bloque toute **nouvelle** vulnérabilité, tolère le legacy), **build / lint:check / test**, et
  **lint du contrat** (`lint:api`).
- **RLS** : les tables V2 (`jobs`, `containers`, `folders`, `documents`) ont des policies
  `user_id = auth.uid()` (migration `007`). Le backend tourne en **service-role (bypass RLS)** —
  le scoping applicatif reste donc obligatoire ; la RLS est une deuxième barrière contre l'accès
  PostgREST direct. **La RLS legacy complète reste un chantier futur.**
- **Jamais de secret hardcodé.** Le `.env` est **validé au boot (fail-fast)** via Joi
  (`src/config/validation/index.ts`) ; catalogue complet dans `.env.example`.
- **Le streaming SSE (chat V2) dépend de `.platform/nginx/conf.d/streaming.conf`**
  (buffering off) — ne pas retirer, sinon les réponses `text/event-stream` du contrat
  n'arrivent plus au client. Le domaine Chat devra implémenter un **heartbeat SSE ~20s**
  (prérequis tracé dans `docs/v2-socle-debt.md`).

---

## Commandes utiles

```bash
yarn start:dev     # dev, hot reload (serveur sur :3100, Swagger V2 sur /api)
yarn build         # nest build
yarn test          # jest (tests unitaires *.spec.ts, Supabase mocké)
yarn lint <fichiers>  # eslint --fix SCOPÉ aux chemins passés (échoue à vide — jamais src/ entier : réécrirait le legacy)
yarn lint:check    # eslint sans fix, --max-warnings 0 (ce que fait la CI)
yarn lint:api      # lint du contrat openapi.yaml (Redocly)
yarn docs:api      # génère openapi.html (doc lisible du contrat)

# e2e (serveur réel requis + creds TEST_USER_* dans l'env) :
npx ts-node test/e2e/notebooks-folders.e2e.ts
```

---

## État actuel / ce qui reste

- **Fait** : socle transverse (garde Bearer, filtre d'exceptions, ValidationPipe, préfixe `/v1`,
  config fail-fast, infra jobs async — registre `JOB_HANDLERS` avec les handlers des domaines
  async) · domaine
  **Notebooks + Folders** (le gabarit) · domaine **Documents** (`notebook-documents/`) —
  **PARTIEL** : upload fichier + URL YouTube, ingestion asynchrone complète (extraction par kind,
  indexation via l'adaptateur legacy derrière `DOCUMENT_INDEXER`), statut/liste/rename ; **restent
  le DELETE (arbitrage produit en attente — v2-socle-debt §5) et le scraping web (goal 5)** ·
  domaine **Summaries** (`notebook-summaries/`) — complet : génération asynchrone multi-sources
  (budget 100k tokens équitable), liste/détail/soft-delete (quota 429 différé — v2-socle-debt §9) ·
  domaine **Notes** (`notebook-notes/`) — CRUD complet, bug legacy `document_id` corrigé ·
  domaine **Search** (`search/` — route globale, hors famille notebook-*) · domaine
  **Study Sessions** (`study-sessions/`) — journal du focus timer ·
  **CI** · migrations **005**→**011** (toutes présentes dans `database/`) ·
  docs `domain-structure.md`, `v2-socle-debt.md`.
- **En cours / à venir** : les domaines V2 restants (Chat, Calendar…) et les restes de
  Documents ci-dessus. **La liste vivante et à jour est dans ClickUp** — s'y référer plutôt
  qu'à une liste figée ici qui périmerait.
- **Dette technique reportée (avec le pourquoi)** : voir **`docs/v2-socle-debt.md`** — CRLF global,
  RLS legacy complète (⚠️ **toutes les migrations — 007, 008, 011 — sont appliquées en TEST
  seulement, PAS en prod** ; l'application prod est un chantier avec le propriétaire du projet
  Supabase), interfaces DTO legacy, dette npm/audit-ci, tests d'intégration, **écarts contrat ↔
  implémentation (§9 — dont le 429 des summaries)**. **À traiter à la migration des domaines
  concernés, pas maintenant.**
