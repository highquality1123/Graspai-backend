# API Contract Inventory — Réconciliation front ↔ backend (Goal 1)

> Livrable du **Goal 1** de la boucle `/goal` (`docs/api-contract-plan.md` §8). Pour chaque domaine de la carte §6 : ce que le front attend (SOP), ce qui existe réellement dans le code (fichier:route), le statut honnête, et l'écart. **Aucun endpoint inventé** ; aucun `exist` sans route réelle citée.
>
> Sources : `docs/Frontend-SOP.md` (surface front, ~110 opérations) · code backend réel (49 endpoints REST, 14 controllers, 1 gateway WS — inventaire factuel dans `docs/ENDPOINTS_ACTUELS.md`) · décisions actées (`docs/api-contract-plan.md` §4 + go du Goal 0).

---

## 0. Légende & règles de statut

- **exist** — la route existe et sa sémantique correspond ; seuls s'appliquent les changements **transverses** décidés au contrat (préfixe `/v1`, auth Bearer, enveloppe/erreurs, renommage `container→notebook` dans le chemin). Route réelle citée obligatoirement.
- **adapt** — une base réelle existe (route citée) mais la cible exige un changement de forme, de scope ou de comportement (ex. sync→async, mono-doc→notebook, PUT→PATCH+payload, ajout de champs de réponse).
- **new** — aucune route ni logique exploitable dans `src/`. (La présence de *données* en base est notée dans l'écart mais ne fait pas un `adapt`.)

Changements transverses (s'appliquent à TOUT, non répétés dans les tables) : préfixe `/v1` · `Authorization: Bearer <supabase-jwt>` remplaçant les headers maison `access`/`refresh` (`session.service.ts:17-25`) · enveloppe = payload nu + erreurs `{message, code}` · `camelCase` · pagination `{items, nextCursor}` sur les listes non bornées.

**Tranche Phase 1** (à geler en premier, plan §3) : domaines 1 à 10 ci-dessous. Domaines 11+ = tranches suivantes, inventoriés ici pour couverture complète.

---

## 1. Users & me — *Phase 1*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `GET /users/me` (SOP §1.6.1) | `GET /auth/getUser` — `auth.controller.ts:291` | adapt | Chemin+forme : renvoie aujourd'hui `IUserDTO` snake_case avec `subscriptions`/`stats` ; cible = profil `/users/me` camelCase. Base solide. |
| `PATCH /users/me` `{fullName?, email?, language?, colorMode?, onboardingComplete?}` (SOP §1.6.1, §1.2) | — | new | Aucun endpoint de mise à jour de profil dans `src/`. Colonnes `profiles` partiellement présentes (`full_name`) ; `language`/`colorMode`/`onboardingComplete` = colonnes à créer (`profile_status` existant peut porter l'onboarding). |
| `POST /users/me/onboarding` (SOP §1.2) | — | new | Rien. Les 5 champs du wizard (language, skillArea, learningStyles, studyRhythm) n'ont aucune colonne. |
| `POST /users/me/change-password` `{currentPassword, newPassword}` (SOP §1.6.1) | `POST /auth/resetPassword` — `auth.controller.ts:264` | new | La route existante est un flux OTP public (email+code), sémantique différente d'un changement authentifié avec `currentPassword`. Rien de réutilisable tel quel → new (le flux OTP reste legacy hors `/v1`). |
| `GET /users/me/notification-preferences` · `PATCH` (SOP §1.6.2) | — | new | Aucun module notifications. 7 types × 3 canaux à modéliser. |
| `GET /users/me/streak` (SOP §1.3.1) | — | new | Aucune table streak/activité. (`PLAN_TRAVAIL_V2.md` feature 18, greenfield confirmé.) |
| `GET /users/me/progress` (SOP §1.3.3) | — | new | Aucun modèle de maîtrise par topic. La table `chapters` est une matière première, pas une feature (`PLAN_TRAVAIL_V2.md` §16). |
| `GET /users/me/friends` · `DELETE /users/me/friends/:friendId` · `POST /users/me/friends/:requestId/accept` (SOP §1.6.3) | — | new | Aucun modèle d'amis/relations dans `src/` ni dans le schéma. |
| `GET /users/me/sessions` · `DELETE /users/me/sessions/:sessionId` (SOP §1.6.5) | — | new | Aucune gestion de sessions applicatives (express-session monté mais jamais écrit — cf. Goal 0). Dépend des sessions Supabase Auth (admin API). |
| `GET /users/me/calendar-connections` · `DELETE …/:provider` (SOP §1.5.3) | — | new | Aucun stockage de tokens calendrier. |
| `DELETE /users/me` (SOP §1.6.5) | — | new | Aucune suppression de compte dans `src/`. |
| `GET /users/:userId/contact-info` (SOP §2.6) | — | new | Dépend du modèle d'amis + notebooks partagés (inexistants). |

## 2. Invites — *Phase 1 (léger)*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `POST /invites` `{email}` (SOP §1.6.3, §2.9) | — | new | Zéro code referral/invite (grep confirmé, `PLAN_TRAVAIL_V2.md` §22). L'infra mail (`services/mail`) sert de canal d'envoi, pas de feature. |
| `POST /invites/bulk` `{emails[]}` (SOP §1.2) | — | new | Idem. |
| `POST /invites/link` → `{url, expiresAt}` (SOP §2.9) | — | new | Idem. |

## 3. Notebooks & folders — *Phase 1*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `GET /notebooks` → arbre folders+notebooks (SOP §1.3.4, §4.3) | `GET /folders/tree` — `folders.controller.ts:18` (vue `user_folder_tree_view`) | adapt | La vue renvoie déjà `{folders[], root_containers[]}` imbriqué avec documents. Adapter : chemin, shape `NotebookFolder` (camelCase, `documentCount`, `lastAccessedAt` — colonne à ajouter), `container→notebook`. |
| `POST /notebooks` `{title, folderId?, prompt?, visibility?}` (SOP §1.3.4, §1.4.1) | `POST /containers/empty` — `containers.controller.ts:39` | adapt | Existant : `{name}` seul, pas de `folderId` à la création (rattachement via `POST /folders`), pas de `prompt`/`visibility` (colonnes à créer). |
| `GET /notebooks/:id` (+ documents) | `GET /containers/:containerId` — `containers.controller.ts:19` | exist | Renvoie déjà `{...container, documents[], has_pdf, has_audio, has_video}`. Changements transverses seulement (chemin, casse). |
| `PATCH /notebooks/:id` `{title}` (SOP §1.3.4) | `PUT /containers/:containerId` — `containers.controller.ts:56` | adapt | Léger : PUT→PATCH, `name`→`title`. |
| `DELETE /notebooks/:id` (SOP §1.3.4) | `DELETE /containers/:containerId` — `containers.controller.ts:92` | exist | Cascade documents déjà en place. SOP recommande soft-delete → à trancher (Goal 2), sinon exist tel quel. |
| `PATCH /notebooks/:id/pin` (SOP §1.3.4) | — | new | Aucune colonne `pinned` sur `containers`. |
| *(folders — pas d'opération explicite dans le SOP, voir « à trancher » §C)* | `POST /folders` — `folders.controller.ts:46` · `PUT /folders/:folderId` — `:63` · `DELETE /folders/:folderId` — `:81` · `GET /folders/:folderId` — `:32` · `PUT /containers/:id/move` — `containers.controller.ts:74` | exist | CRUD folders + move complets côté backend. Le SOP n'expose que la lecture du tree ; sans CRUD folders au contrat, le front ne peut pas créer les groupes du sidebar. Recommandation : les inclure (adapt léger de forme). |

## 4. Documents & ingestion — *Phase 1*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/documents` multipart `file + kind` (SOP §1.4.1, §4.4) | `POST /documents` — `documents.controller.ts:72` | adapt **profond** | Existant : multipart avec `containerId` en body, traitement **synchrone dans la requête** (upload S3 + embeddings avant réponse — `documents.service.ts:59-127`). Cible : notebook-scoped dans le chemin, réponse `202` + job d'ingestion (sous-système jobs = new, cf. domaine 10) + `kind` étendu (`video-overview`, `recording` ; upload fichier vidéo aujourd'hui « Not implemented » — `documents.service.ts:179`). |
| `POST /notebooks/:id/documents/url` `{url}` (SOP §1.4.1) | `POST /video` — `video.controller.ts:16` | adapt | Existant : YouTube uniquement (YouTube Data API + transcript Supadata — `video.service.ts:92-149`), synchrone, `containerId` en body, langues en/fr seulement. Cible : chemin notebook-scoped, async, et scraping de sites web = partie **new**. |
| `GET /notebooks/:id/documents` (SOP §1.4.2) | `GET /containers/:containerId` — `containers.controller.ts:19` (docs inclus) ; `GET /documents` — `documents.controller.ts:33` (scope user entier) | adapt | La liste par container existe dans la réponse du container. Écart : endpoint dédié, shape `NotebookDocument` avec `processingStatus` (aucune colonne de statut aujourd'hui — la « readiness » s'infère du filtre ≥1 embedding, `documents.service.ts:37-54`). |
| `GET /notebooks/:id/documents/:docId/status` (SOP §3.8, §4.4) | — | new | Aucune notion de statut d'ingestion (pas de colonne, pas de pipeline async). Vocab gelé : `pending\|processing\|ready\|failed` + `stage?: transcribing\|chunking\|indexing` (décision Goal 0 pt 2). |
| `GET /notebooks/:id/documents/:docId/preview` (SOP §3.8) | `GET /documents/:documentId` — `documents.controller.ts:52` | adapt | Existant : renvoie le doc + `pages[{content,start,end}]` + `chapters` pour audio/vidéo. Cible : URL de viewer PDF ou transcript — proche, forme à figer au Goal 2. |
| `DELETE /notebooks/:id/documents/:docId` (SOP §3.8) | `DELETE /documents/:documentId` — `documents.controller.ts:149` | exist | Supprime doc + embeddings. Changements transverses (chemin notebook-scoped). |
| *(rename document — hors SOP)* | `PUT /documents/:documentId` — `documents.controller.ts:131` | exist | Route réelle sans opération front correspondante — voir §B. |

## 5. Notebook analytics — *Phase 1 (si retenu, cf. plan §6)*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /notebooks/:id/stats` → `{topics[], weakSpots[], recentActivity[]}` (SOP §1.4.2) | — | new | `admin-stats` est global/admin (`admin-stats.controller.ts:10`), pas per-user. Les topics/weak-spots dépendent du modèle de maîtrise (greenfield, `PLAN_TRAVAIL_V2.md` §13/§16). Contrat gelable, implémentation P2 — à séquencer au Goal 2. |

## 6. Notes — *Phase 1*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `GET /notebooks/:id/notes` (SOP §1.4.3) | `GET /notes/containers/:containerId` — `notes.controller.ts:146` | exist | Même sémantique (liste par container, DESC). Changements transverses + shape `{notes:[…]}`→tableau nu. |
| `POST /notebooks/:id/notes` `{title, body, sourceDocumentId?}` (SOP §1.4.3) | `POST /notes` — `notes.controller.ts:43` | adapt | Existant : `{title, content, containerId}` en body. Écarts : `content`→`body`, scope dans le chemin, et **`sourceDocumentId` non persisté aujourd'hui** (l'insert ignore `document_id` — `notes.service.ts:28` — alors que `GET /notes/document/:documentId` existe, `notes.controller.ts:120` : incohérence actuelle à résoudre par le contrat). |
| `PATCH /notebooks/:id/notes/:noteId` `{title?, body?}` (SOP §1.4.3) | `PUT /notes` (id en body) — `notes.controller.ts:83` | adapt | Léger : id dans le chemin au lieu du body, PUT→PATCH. |
| `DELETE /notebooks/:id/notes/:noteId` (SOP §1.4.3) | `DELETE /notes/:noteId` — `notes.controller.ts:172` | exist | Changements transverses seulement. |
| *(détail note — implicite éditeur)* | `GET /notes/:noteId` — `notes.controller.ts:17` | exist | Route réelle ; le SOP ne la liste pas explicitement mais l'éditeur en a besoin — à confirmer au Goal 2. |

## 7. Calendar & study sessions — *Phase 1*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /calendar/events?from=&to=` · `GET /calendar/events/:id` · `POST /calendar/events` (récurrence) · `PATCH /calendar/events/:id` · `DELETE /calendar/events/:id?scope=` (SOP §1.5.1, §1.5.2) | — | new | **Aucun module calendar dans `src/`** (grep confirmé). Modèle complet à créer : événements, récurrence, participants, couleurs, `activeRecall`, timezone client (§5.9 du plan). |
| `GET /calendar/today` (SOP §1.3.2) | — | new | Idem. |
| `GET /auth/google-calendar` · `GET /auth/microsoft-calendar` (SOP §1.5.3) | — | new | Le seul OAuth existant est le **login** Google (`auth.service.ts:140`, provider `google` via Supabase) — aucun scope calendrier, aucun stockage de token provider. Décision plan §5.8 : ces deux routes OAuth restent backend. |
| `POST /study-sessions` `{notebookId?, durationSeconds, completedAt}` (SOP §1.3.5) | — | new | Aucune table/notion de session d'étude. |

## 8. Search — *Phase 1*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /search?q=` → `{notebooks[], documents[], notes[]}` (SOP §1.3.6) | — | new | Aucun endpoint de recherche. La seule brique est la RPC interne `search_vectors`, **mono-document** (`ai.service.ts:179`) — inutilisable telle quelle pour une recherche transverse (cf. `PLAN_TRAVAIL_V2.md` §27). Le besoin SOP (nom/titre) peut se couvrir en full-text simple sans la brique sémantique — à cadrer au Goal 2. |

## 9. Chat (AI) & Summary — *Phase 1*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/chat/source` `{message, conversationId?, documentIds?}` → **SSE** (SOP §3.1, §4.9) | `POST /chats` — `chat.controller.ts:23` (création thread) + `POST /chats/:chatId` — `chat.controller.ts:108` (message) | adapt **profond** | 4 écarts majeurs : (1) transport — aujourd'hui hybride HTTP + Socket.io broadcast non authentifié, event nommé `chatId`, payload `{message}` (`chat.service.ts:160`, `stream.gateway.ts:35`), zéro SSE dans le repo → cible `text/event-stream`, events `token`/`citations`/`done` ; (2) scope — mono-document (`chats.document_id NOT NULL`, `search_vectors` mono-doc `ai.service.ts:179`) → notebook-scoped avec `documentIds?` (décision divergence 7) ; (3) citations — persistées en base (`chat_messages.source`, metadata `page_number`/`start`/`end` — `chat.service.ts:168`) mais **jamais renvoyées au front** → event `citations` réalisable sans retravailler l'ingestion ; (4) création implicite du thread via `conversationId?` vs deux appels aujourd'hui. |
| `POST /chat/general` `{message, conversationId?}` → SSE (SOP §3.1, §4.9) | — | new | Aucun chat non-groundé : tous les `ChatTypeEnum` (chat/explanation/summary) sont scopés à un document. |
| `GET /notebooks/:id/chat/source/history` (paginé) (SOP §3.1) | `GET /chats/:chatId` — `chat.controller.ts:154` | adapt | Existant : messages d'UN chat (`id, question, response, created_at` — pas de citations, pas de pagination, `chat.service.ts:320-330`). Cible : historique niveau notebook, paginé `{items, nextCursor}`, shape `ChatMessage` avec `citations[]`. |
| `DELETE /notebooks/:id/chat/source/history` (SOP §3.1) | `DELETE /chats/:chatId` — `chat.controller.ts:184` | adapt | Existant : suppression par chat (et **refuse** `type=summary`). Cible : clear au niveau notebook. |
| `POST /notebooks/:id/summary` `{documentIds?, length, format}` → 202 jobId (SOP §3.4) | `POST /chats/summary` — `chat.controller.ts:74` | adapt **profond** | Existant : synchrone (2 `chain.invoke` bloquants — `chat.service.ts:95,103`), mono-document, aucun paramètre `length`/`format`, garde « 1 seul résumé par document » (`chat.service.ts:69-75`). Cible : async jobs, multi-doc, paramétrable, plusieurs résumés. |
| `GET /notebooks/:id/summary/:summaryId` · `GET /notebooks/:id/summaries` (SOP §3.4) | — | new | Aucune route de lecture : le contenu n'est renvoyé que par le POST. Les données existent (`chats` type=summary + `chat_messages`) mais aucun endpoint de liste/détail. |
| `DELETE /notebooks/:id/summaries/:summaryId` (SOP §3.4) | — | new | La suppression de summary est aujourd'hui explicitement **interdite** (`DELETE /chats/:chatId` la refuse). Le contrat l'autorise ; le code s'adaptera. |

## 10. Jobs (unifié) — *Phase 1, socle transverse*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /jobs/:jobId` → `{status, resourceType, resourceId?, progress?, error?}` (SOP §4.4 `use-ai-job.ts` — le hook réel polle `/jobs/${jobId}`) | — | new | **Sous-système entier à créer** : aucune table jobs, aucune queue (grep bull/sqs/queue : zéro), aucun concept de `jobId` dans `src/`. Tout traitement lourd est aujourd'hui synchrone dans la requête : ingestion (`documents.service.ts:59-127`), vidéo générée (**bloque sur le WebSocket Knowlify** — `generated-videos.service.ts:76,134-173`, aucune colonne de statut dans `generated_videos`). Le « pattern async existant sur la vidéo » évoqué dans les docs antérieurs **n'existe pas** en tant que 202+polling. Vocab gelé : `pending\|processing\|ready\|failed`. Routes par ressource du SOP Appendix B (`/quiz/jobs/:id`…) **superseded** par le hook réel. |

---

## 11. Quiz — *tranche 2*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/quiz/generate` (QuizSetupPayload) → 202 jobId (SOP §3.2.1) | `POST /quizzes` — `quiz.controller.ts:17` · `POST /quizzes/general` — `:28` | adapt | Moteur + source-grounding réels (`quiz_questions.page_number/citation/explanation`, batching, Zod). Écarts : synchrone→async job, mono-doc (`documentId`)→notebook+`documentIds?`, types `short_answer`/difficulté `adaptive`/`customTopics` inexistants (`multiple_choice\|true_false\|mixed`, `easy\|medium\|hard\|mixed` aujourd'hui). |
| `GET /quiz/:quizId` → questions (SOP §3.2.1) | `GET /quizzes/document/:documentId` — `quiz.controller.ts:39` (liste par doc avec questions) | adapt | Aucun GET quiz par id ne renvoie les questions : ⚠️ `GET /quizzes/:quizId` existant (`:74`) renvoie l'**historique des tentatives** (`quiz_answers`), pas le quiz. Collision sémantique à résoudre par le contrat. |
| `POST /quiz/:quizId/answers` `{questionId, answer}` (unitaire) (SOP §3.2.1) | `POST /quizzes/:quizId` — `quiz.controller.ts:62` (soumission **en bloc** de toutes les réponses) | adapt | Granularité : bulk→par question. Correction serveur existante naïve (`answer.toLowerCase() == correct_answer.toLowerCase()` — `quiz.service.ts:446`), insuffisante pour `short_answer`. |
| `POST /quiz/:quizId/complete` → `{score, weakSpots, correctCount, totalCount}` (SOP §3.2.1) | — | new | Le score agrégé existe dans `quiz_answers` (`passed_questions_count`…) mais aucun calcul de `weakSpots` (dépend topics — greenfield). |
| `GET /quiz/:quizId/weak-spots` (SOP §3.2.1) | — | new | Idem : aucun modèle topic/maîtrise. |
| *(delete quiz — hors SOP)* | `DELETE /quizzes/:quizId` — `quiz.controller.ts:50` | exist | Route réelle sans opération front — voir §B. |

## 12. Quiz War — *tranche 2 (WS natif)*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `POST /quiz-war/rooms` `{quizId, friendIds}` · `POST /quiz-war/rooms/:roomId/join` (SOP §3.2.2) | — | new | Aucun module multijoueur (`PLAN_TRAVAIL_V2.md` §14, XL). |
| WS `quiz_war.*` (question_start, answer, answer_reveal, scoreboard, tap_out, game_over) (SOP §3.2.2) | — | new | Contractualisé sur le **WS natif** (décision Goal 0 pt 3). Le Socket.io existant (`stream.gateway.ts`) reste intouché pour l'ancien chat. |

## 13. Flashcards (+SRS) — *tranche 2*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/flashcards/generate` (topics, deckName, difficulty) → 202 jobId (SOP §3.3.1) | `POST /flashcards` — `flashcards.controller.ts:16` | adapt | Génération réelle (topic+documentId+cardsCount). Écarts : sync→async, mono-doc→notebook, `difficulty`/multi-topics inexistants, « set »→« deck ». |
| `GET /flashcards/decks/:deckId` (SOP §3.3.1) | `GET /flashcards/document/:documentId` — `flashcards.controller.ts:44` | adapt | Liste par document existe ; aucun GET par set/deck id. |
| `POST /flashcards/decks` `{notebookId, name}` (SOP §3.3.2) | `POST /flashcards/manual` — `flashcards.controller.ts:30` | adapt | Existant : création d'un set complet avec toutes ses cartes en un appel. Cible : deck vide puis cartes unitaires. |
| `POST /flashcards/decks/:deckId/cards` · `PATCH /flashcards/cards/:cardId` · `DELETE /flashcards/cards/:cardId` (SOP §3.3.2) | — | new | **Aucun endpoint de carte unitaire** (confirmé Goal 0 / `PLAN_TRAVAIL_V2.md` §5) : le module ne connaît que le set entier. |
| `POST /flashcards/decks/:deckId/review` · `POST /flashcards/review/:sessionId/rate` · `…/complete` · `GET /flashcards/decks/:deckId/due` (SOP §3.3.3) | `POST /flashcards/:setId/review` — `flashcards.controller.ts:55` | new | La route existante pose juste `reviewed_at=NOW()` **par set** — aucun SRS (pas d'ease/interval/due par carte, pas de session). Sous-système SRS entier à créer ; la route citée n'est pas une base exploitable → new assumé. |
| `POST/PATCH/DELETE /flashcards/decks/:deckId/reminders` (SOP §3.3.4) | — | new | Rien (dépend notifications + scheduling, timezone client). |
| `POST /flashcards/decks/import/anki` · `…/import/csv` (SOP §3.3.5) | — | new | Rien. |
| *(delete set — hors SOP)* | `DELETE /flashcards/:setId` — `flashcards.controller.ts:66` | exist | Route réelle ; le contrat cible aura `DELETE /flashcards/decks/:deckId` — à porter au Goal 2. |

## 14. Video — *tranche 2*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/videos/generate` (language, length, topics) → 202 jobId (SOP §3.5) | `POST /generated-videos` — `generated-videos.controller.ts:43` | adapt **profond** | Génération Knowlify réelle mais **bloquante dans la requête HTTP** (`generated-videos.service.ts:76`), aucune colonne de statut, complétion inférée de `link` non vide. Cible : 202+job. Paramètres `length`/`topics`/`title` inexistants (`user_query` seul). Scope doc→notebook. |
| `GET /videos/:videoId` (SOP §3.5) | `GET /generated-videos/:videoUuid` — `generated-videos.controller.ts:17` | adapt | Existant : row brut (`link`, `vtt_link`, `srt_link`). Cible : `GeneratedNotebookVideo` (poster, durée, transcript structuré avec timestamps) — enrichissement de shape. |
| `GET /notebooks/:id/videos` (SOP §3.5) | `GET /generated-videos/document/:documentId` — `generated-videos.controller.ts:117` | adapt | Scope document→notebook. |
| `DELETE /videos/:videoId` (SOP §3.5) | `DELETE /generated-videos/:videoUuid` — `generated-videos.controller.ts:143` | exist | Changements transverses (chemin). |
| *(rename video — hors SOP)* | `PUT /generated-videos/:videoUuid` — `generated-videos.controller.ts:80` | exist | Route réelle sans opération front — voir §B. |

## 15. Podcast — *tranche 2*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/podcasts/generate` · `GET /podcasts/:podcastId` · `GET /notebooks/:id/podcasts` · `DELETE /podcasts/:podcastId` (SOP §3.6) | — | new | Aucun module. Provider TTS à choisir ; le flux générer-async/stocker/lister **calquera le pattern jobs** du contrat (`PLAN_TRAVAIL_V2.md` §23). |

## 16. Mindmap — *tranche 2*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `POST /notebooks/:id/mindmaps/generate` · `GET /mindmaps/:mindmapId` · `GET /notebooks/:id/mindmaps` · `DELETE /mindmaps/:mindmapId` (SOP §3.7) | — | new | Aucun module. La table `chapters` (topics extraits) est une matière première pour les nœuds. |

## 17. Notifications — *tranche 2*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /notifications` (paginé) · `PATCH /notifications/:id/read` · `PATCH /notifications/read-all` (SOP §1.3.7) | — | new | Aucun module (`PLAN_TRAVAIL_V2.md` §28). |

## 18. Billing — *tranche 2*

| Endpoint attendu (front) | Endpoint existant (fichier:route) | Statut | Écart |
|---|---|---|---|
| `GET /billing/subscription` (SOP §1.6.4) | `GET /auth/getUser` — `auth.controller.ts:291` (champ `subscriptions` + `isSubscribed`) | adapt | Les données d'abonnement existent (tables `subscriptions`, sync webhook Stripe) mais aucun endpoint dédié. Extraction + shape à définir. |
| `PUT /billing/payment-method` (SOP §1.6.4) | `GET /stripe/portalUrl` — `stripe.controller.ts:28` · `GET /stripe/customerSession` — `:46` | adapt | Aujourd'hui délégué au portail hébergé Stripe (redirect). Le SOP veut une gestion in-app (SetupIntent/PaymentMethod API) — changement d'approche, base Stripe réelle. |
| `GET /billing/invoices` · `GET /billing/invoices/:id/pdf` (SOP §1.6.4) | — | new | Aucune lecture de factures (l'API Stripe les fournit ; endpoint à créer). |
| `DELETE /billing/subscription` (SOP §1.6.4) | — | new | Annulation aujourd'hui via portail Stripe uniquement. |
| *(checkout & plans — hors SOP)* | `GET /stripe/checkoutSession` — `stripe.controller.ts:76` · `GET /stripe/plans` — `:113` | exist | Routes réelles sans opération front listée — le front aura pourtant besoin d'un checkout/pricing. À trancher (§C). |
| *(webhook)* | `POST /stripe/webhook` — `stripe.controller.ts:98` | exist | **Hors contrat front et hors `/v1`** (signature Stripe, URL configurée chez Stripe) — voir §A. |

## 19. Messaging (threads) — *tranche 2 (REST + WS natif)*

| Endpoint attendu (front) | Endpoint existant | Statut | Écart |
|---|---|---|---|
| `GET /threads` (+`?q=`) · `POST /threads` (group) · `GET /threads/:id` · `PATCH /threads/:id` · `DELETE /threads/:id` · `PATCH /threads/:id/pin\|mute\|read` (SOP §2.2, §2.5) | — | new | Aucun module messagerie (`PLAN_TRAVAIL_V2.md` §19, XL). |
| `GET /threads/:id/messages?limit=&cursor=` · `POST /threads/:id/messages` (text + multipart file/audio/image) · `PATCH`/`DELETE …/:msgId` · `GET …/:msgId/file` (SOP §2.3, §2.4) | — | new | Idem. Pagination standardisée `{items, nextCursor}` (le `{messages,…}` du SOP §4.8 est ajusté — divergence 3 tranchée). |
| `GET /threads/:id/members` · `PATCH /threads/:id/members` · `DELETE /threads/:id/members/:userId` · `DELETE /threads/:id/members/me` (SOP §2.5, §2.7) | — | new | Idem. |
| `GET/POST/DELETE /threads/:id/notebook-tags(/:notebookId)` (SOP §2.8) | — | new | Idem. |
| WS `message.*`, `typing.*`, `thread.read` (SOP §2.3) | — | new | WS **natif** (décision Goal 0 pt 3), `WS_URL?token=`, enveloppe `{type, …}`. Socket.io existant non touché. |

---

## A. Angles morts tracés (décisions du go Goal 1)

1. **Exclusions du préfixe `/v1`** : `GET /health/check` (`health.controller.ts:11`, sondé par Elastic Beanstalk) et `POST /stripe/webhook` (`stripe.controller.ts:98`, URL enregistrée chez Stripe, auth par signature). Les deux restent à la racine, hors contrat front.
2. **Exception UUID** : les `recording_chunks` ont des `id` **numériques** (`{id: number}` renvoyé par `POST /audio/recordings/:recordingId` — `audio.controller.ts:97` — et `PUT /audio/recordings/chunks/:chunkId` — `:131`). Hors tranche Phase 1, mais contredit la convention §5.9 « IDs UUID » : à résoudre (migration ou exception documentée) quand le domaine recording entrera au contrat.
3. **Adapt profond / new assumés, rien d'« exist » dessus** : auth Bearer/JWKS (aucun guard global, headers maison, validation réseau — `session.service.ts:17-25`) ; chat SSE (zéro `text/event-stream` dans le repo, Socket.io non authentifié — `stream.gateway.ts`) ; sous-système jobs (aucune table/queue/jobId — tout synchrone). Détail au Goal 0.
4. **Socket.io intouché** : le gateway actuel (`stream.gateway.ts`) continue de servir l'ancien chat des 136k users. Le contrat documente SSE (chat) + WS natif (messaging/quiz-war) pour le neuf ; l'extinction de Socket.io n'intervient qu'après remplacement complet.

## B. Endpoints existants sans correspondance front (legacy, hors contrat `/v1`)

| Endpoint réel | Devenir |
|---|---|
| Les 11 routes `/auth/*` (`auth.controller.ts:51-303` : login, register, verify, OTP, reset, google, google/callback, verify-OAuth, getUser) | **Superseded** par Supabase native côté client (décision §4 du plan) — restent vivantes à la racine pour l'existant ; seul `getUser` a un héritier (`GET /v1/users/me`). |
| `GET /documents/:documentId/chats` (`documents.controller.ts:101`) | Remplacé par l'historique notebook-scoped du chat. |
| Chat `type=explanation` (`ChatTypeEnum`, servi par `POST /chats/:chatId` — `chat.service.ts:181`) | Absent du SOP — hors contrat v1 (fonction « explain selection » = roadmap Yann §5, pas dans le front actuel). |
| Les 5 routes `/audio/recordings*` (`audio.controller.ts:54-177`) | Le SOP a un bouton « Record » et le kind `recording` (§1.4.1) mais **ne spécifie aucune route recording** — à trancher (§C). |
| `PUT /documents/:documentId` (rename — `documents.controller.ts:131`), `DELETE /quizzes/:quizId` (`quiz.controller.ts:50`), `PUT /generated-videos/:videoUuid` (rename — `:80`) | Routes utiles sans opération SOP — proposer au Goal 2 (coût contractuel nul, évite une régression fonctionnelle). |
| `GET /stripe/checkoutSession`, `GET /stripe/plans` (`stripe.controller.ts:76,113`) | Nécessaires à tout parcours d'upgrade ; absents du SOP §1.6.4 — à trancher (§C). |
| `GET /admin-stats` (`admin-stats.controller.ts:10`) | Hors contrat front. ⚠️ Sécurité : le `BasicAuthGuard` existe mais **n'est pas appliqué** — endpoint public de fait. À corriger côté code (hors scope contrat, signalé). |

## C. Conventions restant à trancher (pour le go du Goal 2)

1. **`/quiz/*` (SOP) vs pluriel `/quizzes/*` (§5.1)** — le SOP écrit `GET /quiz/:quizId` ; la convention gelée impose le pluriel. Recommandation : **`/quizzes/*`** partout (ajustement de chemins trivial côté front).
2. **CRUD folders au contrat ?** — le SOP ne liste que la lecture du tree, mais le sidebar (create/rename/delete de groupes) l'exigera. Recommandation : **inclure** `POST/PATCH/DELETE /folders` + `PATCH /notebooks/:id/move` (bases réelles : `folders.controller.ts:46,63,81`, `containers.controller.ts:74`).
3. **Recording** — kind `recording` présent dans le SOP sans routes. Recommandation : contractualiser en tranche 2 un flux `POST /notebooks/:id/recordings` (start/chunk/stop) adapté des 5 routes `audio.controller.ts` existantes ; Phase 1 sans recording.
4. **Checkout/pricing** — ajouter `GET /billing/plans` + `POST /billing/checkout-session` (adapt de `stripe.controller.ts:113,76`) bien qu'absents du SOP ? Recommandation : oui, en tranche billing, sinon aucun parcours d'abonnement possible.
5. **Renames hors SOP** — inclure `PATCH` de rename pour documents/vidéos (routes existantes citées en §B) ? Recommandation : oui (coût nul).
6. **Soft-delete notebooks** — le SOP le « recommande » (§1.3.4) ; l'existant supprime en cascade. À décider avant le YAML (impacte la sémantique du `DELETE` et un éventuel `GET ?archived=`).
7. **`GET /notebooks/:id/stats`** — geler le contrat en Phase 1 (le front l'affiche au dashboard notebook) tout en sachant l'implémentation P2 (dépend maîtrise/topics), ou le repousser à la tranche 2 ? Recommandation : geler la forme dès la Phase 1 avec `topics: []` acceptable au lancement.

## E. Dette / bugs existants à ticketer (HORS contrat)

> Constats de code faits pendant la réconciliation. **Ne font pas partie du contrat** — à ouvrir en tickets et traiter lors de l'implémentation des domaines concernés.

1. **Notes — `document_id` jamais persisté.** `GET /notes/document/:documentId` existe (`notes.controller.ts:120`) mais l'insert de `POST /notes` n'écrit jamais `document_id` (`notes.service.ts:28`) : la route de lecture par document ne peut rien renvoyer pour les notes créées via l'API. Bug existant, à corriger quand le domaine notes passe en implémentation (le contrat prévoit `sourceDocumentId?`).
2. **`GET /admin-stats` public de fait.** Le `BasicAuthGuard` existe (`basic-auth.guard.ts`) mais n'est appliqué nulle part (`@UseGuards` absent) → le dashboard admin (nb users, abonnements, usage) est exposé sans authentification. Trou de sécurité à ticketer indépendamment du contrat.

## D. Synthèse chiffrée

Surface front (SOP) réconciliée : **~112 opérations** réparties sur 19 domaines.

| Statut | Volume (approx.) | Lecture |
|---|---|---|
| **exist** | 9 | Concentrés sur containers/notes/documents/generated-videos (CRUD simples). |
| **adapt** | 24 | Dont 4 **adapt profonds** : upload/ingestion (sync→async), chat source (Socket.io→SSE + mono→multi-source), summary (sync mono-doc→job multi-doc), génération vidéo (bloquant→job). |
| **new** | ~79 | Dont 5 sous-systèmes entiers : jobs, calendar, messaging+WS, SRS, notifications — et toute la couche users/me (streak, progress, friends, sessions). |

Phase 1 seule : ~55 opérations → 7 exist · 15 adapt · ~33 new. Le socle réutilisable est réel (hiérarchie, notes, documents, moteur RAG/quiz/flashcards, Stripe) mais la **forme** change partout (auth, enveloppe, async, scope notebook) : aucun domaine n'est « gratuit ».
