# API Contract Plan — GrasprAI V2 (Phase 1)

> Plan de cadrage **contract-first** du backend V2. Ce document précède le `openapi.yaml` : il fixe la mission, le périmètre, les décisions et les conventions gelées. Le YAML s'y conforme, jamais l'inverse.
> Référence maîtresse pour la boucle `/goal` de Claude Code.

---

## 0. Mission

Produire un contrat d'API gelé, source de vérité unique entre le **backend** (NestJS, existant, ~136k users en prod) et le **front** (Next.js, prêt, tout est mocké). Livrable final : `openapi.yaml` (OpenAPI 3.1) versionné + `git tag contract-v1`.

---

## 1. Principe : contract-first

- Le contrat est un `openapi.yaml` **gelé AVANT** d'écrire le code d'implémentation.
- Le code se conforme au YAML. On **ne dérive pas** le contrat des décorateurs `@nestjs/swagger`.
- Une fois gelé : le front génère son client typé depuis le YAML ; le backend génère ses DTOs et valide ses controllers contre le YAML.

---

## 2. Sources de vérité (à lire dans l'ordre)

1. **`docs/frontend-SOP.md`** — surfaces/écrans du front + tout ce qu'il attend (payloads, types, endpoints, SSE, WS, pattern async). ~110 opérations.
2. **Le code backend réel** (repo courant) — NestJS, ~49 endpoints, 14 controllers, 1 gateway WS. C'est la base qu'on **réconcilie**, pas qu'on réinvente.
3. **Les décisions actées** (§4).

**Règle d'or :** aucun endpoint inventé. Chaque endpoint se rattache à (a) le SOP front, (b) le code existant, ou (c) une décision actée — **source citée**.

---

## 3. Périmètre & tranches

Le contrat couvre **toute** la surface du SOP, mais on le **gèle et le livre par tranches**.

**Tranche Phase 1 (à geler en premier — débloque le plus de front, cf. Appendix D du SOP) :**
`auth/JWT` + `/users/me` · `notebooks` + folders · `documents` + ingestion + `/jobs/:id` · `notes` · `calendar` · `search` · `chat SSE` · `summary`.

**Tranches suivantes (même fichier, ajoutées ensuite) :**
`quiz` · `flashcards` (+SRS) · `video` · `podcast` · `mindmap` · `notifications` · `billing` · `messaging REST` · `messaging WS` · `quiz-war WS` · `dashboard analytics`.

---

## 4. Décisions déjà actées (non rediscutées)

- On **garde** le backend NestJS existant. Pas de réécriture, pas de 2e backend. Le RAG (Giovanni) se branche **derrière une frontière claire**, dans ce backend.
- **Auth : Supabase native côté client** pour signup / login / OAuth / OTP. Le backend **ne fait pas** `/auth/signup` etc. — il **valide le JWT Bearer** (JWKS local) et lit `sub` / `email`.
- Hiérarchie : `workspace → notebook → source`. Renommage interne `container → notebook`.
- Chat en **SSE**. WebSocket **gardé** pour messagerie + Quiz War.
- Traitements lourds **asynchrones** : `POST …/generate → 202 {jobId}` + polling `GET /jobs/:id`.

---

## 5. Conventions gelées (le cœur — non négociable une fois validé)

### 5.1 Nommage & routes
- Ressources au pluriel, kebab-case : `/notebooks`, `/calendar/events`, `/study-sessions`, `/quiz-war/rooms`.
- Champs de payload en `camelCase` (front TS).
- Utilisateur courant : `/users/me`. Sous-ressources imbriquées : `/notebooks/:id/notes`.
- `container → notebook` partout (routes, DTOs, DB interne à terme).

### 5.2 Préfixe de version
- Tous les chemins sous **`/v1`**, absorbé dans la base URL du front (`NEXT_PUBLIC_API_URL=https://api.graspr.ai/v1`) → les chemins dans le code front restent inchangés. **[À confirmer]**

### 5.3 Enveloppe de réponse
- Succès = **le payload nu** (objet ou tableau), pas de wrapper `{data:…}` (le front fait `return response.json() as T`).
- `204 No Content` pour suppressions / actions sans corps.
- Erreur = `{ "message": string, "code": string }` (`message` lu par le front ; `code` en SNAKE_CASE). Statuts HTTP standards : `400 / 401 / 403 / 404 / 409 / 422 / 429 / 500`.

### 5.4 Pagination
- Listes bornées (arbre notebooks, friends, sessions) → **tableau nu**.
- Listes non bornées (messages, notifications, invoices, historique de chat) → **`{ items: T[], nextCursor: string | null }`**, params `?limit=&cursor=`.
- ⚠️ Le SOP renvoie `{messages, nextCursor}` pour les messages → on **standardise en `{items, nextCursor}`** (ajustement d'1 ligne côté front : le `select`).

### 5.5 Pattern asynchrone (unifié)
- `POST /v1/notebooks/:id/<resource>/generate` → `202 { jobId: string, estimatedSeconds: number }`.
- Polling **unifié** : `GET /v1/jobs/:jobId` → `{ status, resourceType, resourceId?, progress?, error? }`.
- `status ∈ { pending, processing, ready, failed }` (vocab aligné sur le hook `useAiJob` **et** le statut d'ingestion du front).
- ⚠️ Le SOP mentionne aussi des routes par ressource (`/quiz/jobs/:id`, `/videos/jobs/:id`…) → **superseded** par `/jobs/:id` (le hook réel du front pointe déjà sur `/jobs/:id`). **[À confirmer]**
- Option WS : `{ type: "job.complete", jobId, resourceId }` (bonus, pas requis v1).

### 5.6 Streaming SSE (chat)
- `POST /v1/notebooks/:id/chat/source` et `POST /v1/chat/general`.
- `Content-Type: text/event-stream`. Lignes `data: {json}\n\n`.
- Events : `{type:"token", content}` · `{type:"citations", citations:[…]}` · `{type:"done", messageId}`. Terminal `data: [DONE]` accepté.

### 5.7 WebSocket
- Un seul socket : `WS_URL?token=<jwt>`. Enveloppe `{ type, …payload }`.
- Namespaces : `message.*`, `typing.*`, `thread.*`, `quiz_war.*`, `job.complete`.
- ⚠️ Token en query string = point faible connu (logs). Accepté pour v1 (le front est bâti ainsi), **à durcir** plus tard (sous-protocole / ticket). À noter dans le contrat.

### 5.8 Auth
- `Authorization: Bearer <supabase-jwt>` sur tous les endpoints protégés. Validation **locale** (JWKS), extraction `sub` (userId) + `email`.
- signup / login / OAuth / OTP = **Supabase SDK côté front**, pas d'endpoints backend. Les `/auth/*` de la Part 1 du SOP sont **superseded** par la Part 4 — **sauf** les OAuth **calendrier** (`GET /v1/auth/google-calendar`, `/v1/auth/microsoft-calendar`) qui, eux, sont backend.
- Bootstrap profil : trigger Supabase `auth.users` → ligne `profiles`, exposée via `GET/PATCH /v1/users/me`.
- Garde Bearer **globale** (tout protégé sauf health-check).

### 5.9 IDs, dates, fichiers
- Toutes les ressources ont un `id` **UUID**. Migration front `?title=` → `?id=<uuid>`.
- Dates : ISO-8601 **UTC** pour les datetimes ; `HH:mm` pour les heures ; `timezone` explicite envoyé par le client pour le scheduling (calendar, reminders).
- Uploads : `multipart/form-data`. Kinds de document : `pdf | audio | video | video-overview | recording`.

---

## 6. Carte des domaines (surface cible — statut à réconcilier en Goal 1)

> Ne **pas** présumer exist/adapt/new ici : c'est le travail de Goal 1 contre le vrai code.

| Domaine | Endpoints clés (cible, d'après le SOP) | Async | Stream/WS |
|---|---|---|---|
| Users & me | `GET/PATCH /users/me` · `/onboarding` · `/change-password` · `/notification-preferences` · `/streak` · `/progress` · `/friends`(+invite/accept/remove) · `/sessions`(+revoke) · `/calendar-connections` · `DELETE /users/me` · `GET /users/:id/contact-info` | — | — |
| Invites | `POST /invites` · `/invites/bulk` · `/invites/link` | — | — |
| Notebooks | `GET/POST /notebooks` · `PATCH/DELETE /notebooks/:id` · `PATCH /notebooks/:id/pin` | — | — |
| Documents & ingestion | `POST /notebooks/:id/documents` (multipart) · `/documents/url` · `GET /documents` · `/documents/:docId/status` · `/preview` · `DELETE /documents/:docId` | ingestion | — |
| Notebook analytics | `GET /notebooks/:id/stats` | — | — |
| Notes | CRUD `/notebooks/:id/notes` | — | — |
| Calendar | `/calendar/events` (CRUD, `?from&to`) · `/calendar/today` · OAuth google/microsoft · `/users/me/calendar-connections` | — | — |
| Study sessions | `POST /study-sessions` | — | — |
| Search | `GET /search?q` | — | — |
| Notifications | `GET /notifications` · `PATCH /:id/read` · `/read-all` | — | — |
| Billing | `/billing/subscription` · `/payment-method` · `/invoices`(+`/:id/pdf`) · `DELETE /subscription` | — | — |
| Chat (AI) | `POST /notebooks/:id/chat/source` · `/chat/general` · `GET/DELETE …/history` | — | **SSE** |
| Summary | `POST /notebooks/:id/summary` · `GET`/list/`DELETE` | ✔ | (SSE opt.) |
| Quiz | `POST /notebooks/:id/quiz/generate` · `GET /quiz/:id` · `answers` · `complete` · `weak-spots` | ✔ | — |
| Flashcards | `generate` · decks CRUD · cards · `review`/`rate`/`complete` · `due` · reminders · import (anki/csv) | ✔ | — |
| Video | `generate` · `GET /videos/:id` · list · delete | ✔ | — |
| Podcast | `generate` · `GET /podcasts/:id` · list · delete | ✔ | — |
| Mindmap | `generate` · `GET /mindmaps/:id` · list · delete | ✔ | — |
| Threads (messaging) | `/threads` (CRUD, pin/mute/read) · members · notebook-tags · messages (CRUD, upload fichier) | — | **WS** |
| Quiz War | `POST /quiz-war/rooms` · `/join` | — | **WS** |
| Jobs | `GET /jobs/:jobId` (unifié) | — | — |

---

## 7. Divergences à trancher (à confirmer)

1. **Routes de jobs** : unifié `/jobs/:id` (recommandé, = hook réel) vs par-ressource `/quiz/jobs/:id`.
2. **Vocab de statut** de job : `pending|processing|ready|failed` (aligné front).
3. **Pagination** : `{items,nextCursor}` partout (ajuste 1 `select` front).
4. **Préfixe `/v1`** absorbé dans la base URL.
5. **Auth Part 1 vs Part 4** : Supabase-native, backend = validation JWT only.
6. **`container → notebook`** : périmètre du renommage (routes + DTOs maintenant ; migration DB quand ?).
7. **Mono → multi-source** : le SOP est déjà multi-source (`documentIds?` de scoping). Confirmer que le retrieval notebook-scoped couvre le contrat dès la Phase 1.

---

## 8. La boucle `/goal` (une passe par goal — STOP + rapport + attendre le "go")

- **Goal 0 — Cadre & conventions.** Lire les 3 sources. Vérifier que les conventions (§5) tiennent contre le repo réel (auth réelle, format actuel du chat, pattern async existant sur la vidéo, nommage `container`). Sortir : (1) conflits plan ↔ code, (2) réponses proposées aux 7 divergences (§7). **Aucun code, aucun YAML.**
- **Goal 1 — Inventaire de réconciliation.** Produire `docs/api-contract-inventory.md` : par domaine, table `| endpoint attendu (front) | endpoint existant (fichier:route) | statut exist/adapt/new | écart |`. Règle : aucun "exist" sans citer `fichier:route` réel ; sinon "new". **Sert aussi à valider les « existe déjà » du support de réunion.** Rapport seulement.
- **Goal 2 — `openapi.yaml`, domaine par domaine.** Générer le contrat (OpenAPI 3.1) en suivant §5, en commençant par la **tranche Phase 1** (§3). Composants réutilisables (`Error`, `Page`, `Job`, schémas de types du SOP). SSE documenté en convention, WS en annexe.
- **Goal 3 — Lint & gel.** Valider (Spectral/Redocly), corriger, `git tag contract-v1`.

---

## 9. Definition of Done (Phase 1)

- `openapi.yaml` couvre la tranche Phase 1, lint clean.
- Chaque endpoint : statut exist/adapt/new tracé + source citée.
- Conventions §5 respectées partout.
- Les 7 divergences tranchées et reflétées dans le YAML.
- Tag `contract-v1` posé.
## Note d'implémentation — auth (hors contrat)

Supabase prod = legacy JWT secret (HS256), pas de JWKS/signing keys asymétriques.
Guard Bearer global = validation locale HS256 avec le secret (via Secrets Manager,
jamais hardcodé), isolée dans un module TokenVerifier pour permettre un swap vers JWKS
(RS256/ES256) plus tard sans toucher au guard ni aux handlers. Extraction sub + email
des claims. Access token expiry actuel = 36000s (10h) → à ramener à 3600s. Migration
signing keys asymétriques = chantier séparé, testé sur le projet Test d'abord.
