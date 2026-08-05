# Dette technique reportée — socle V2

Dette **repérée** pendant la construction du socle V2 (garde / filtre / pipe / préfixe / jobs)
et le premier domaine (Notebooks). Elle est **tracée ici, pas traitée maintenant** : chaque point
touche du **legacy** et doit être réglé **à la migration du domaine concerné**, pas en bloc à côté
du socle (sinon on brouille le diff, la revue et le blame).

Ce fichier est la **source de vérité** de cette dette (le `CLAUDE.md` y renvoie).

---

## 1. Normalisation CRLF → LF (repo-wide)

**État réel.** Les blobs sont déjà en **LF** dans l'index (`git ls-files --eol` → `i/lf`) ;
c'est l'**arbre de travail** de certains fichiers legacy qui est en CRLF (~143 fichiers `w/crlf`).
Le `.gitattributes` (`* text=auto eol=lf`) impose déjà le LF : **tout nouveau fichier est en LF**,
et un fichier legacy est **normalisé au commit qui le touche** (donc gratuitement à sa migration).

**Ce qui est reporté.** La **renormalisation globale** en une passe
(`git add --renormalize .`, ~189 fichiers).

**Pourquoi.** Un tel commit réécrirait les fins de ligne de ~189 fichiers d'un coup : il
**détruirait le `git blame`** du legacy et **entrerait en conflit** avec le dev en cours. On
normalise donc **fichier par fichier à la migration**. Le jour d'une renormalisation volontaire,
référencer le commit dans `.git-blame-ignore-revs` (le fichier existe déjà) pour préserver le blame.

---

## 2. DTO legacy en `interface` (non validés)

**État réel.** Les payloads de `src/modules/notes/` (`CreateNote.dto.ts`, `UpdateNote.dto.ts`) et
`src/modules/generated-videos/` (`CreateGeneratedVideo.dto.ts`, `UpdateGeneratedVideo.dto.ts`) sont
des **`interface` TypeScript** — effacées à la compilation, donc **jamais validées** par le
`ValidationPipe` global (whitelist stricte). Un champ inconnu ou un mauvais type passe sans erreur.

**Ce qui est reporté.** Les convertir en **classes `class-validator`** (comme les DTO V2 de
`notebooks/`).

**Pourquoi.** Ces domaines sont legacy et pas encore alignés sur le contrat V2 ; on les durcira
**quand ils migreront**, pour ne pas toucher du legacy hors de sa migration.

---

## 3. RLS (Row Level Security)

**État réel.** La migration **`007`** ajoute des policies `user_id = auth.uid()` sur les tables V2
(`jobs`, `containers`, `folders`, `documents`). ⚠️ **Elle est appliquée en environnement de TEST
uniquement — PAS en prod.** Le backend tourne en **service-role (bypass RLS)** ; le scoping
applicatif dans les services (`user_id` → 404) reste donc la barrière effective, la RLS étant une
**deuxième barrière** contre l'accès PostgREST direct.

**Ce qui est reporté.**
- **Appliquer `007` en prod** (revue + fenêtre de déploiement avec le propriétaire du projet Supabase).
- La table `jobs` reste scopée **applicativement** ; son passage en policy RLS suit le même chantier.
- La **RLS legacy complète** (toutes les tables historiques non couvertes par `007`) — gros chantier
  à mener **avec le propriétaire du projet Supabase**.

**Pourquoi.** Activer la RLS en prod sur des tables legacy touche ~136k users : ça se fait dans un
chantier sécurité dédié, pas au fil d'un domaine.

---

## 4. Dette de vulnérabilités npm (baseline audit-ci)

**État réel.** `audit-ci.jsonc` tolère **112 GHSA** en baseline (legacy : `aws-sdk`, `langchain`,
la génération vidéo, `jest`…). La CI **bloque toute NOUVELLE** vulnérabilité `moderate+` mais
**laisse passer** cette dette existante.

**Ce qui est reporté.** Résorber ces GHSA (mettre à jour / remplacer les deps), puis **retirer les
GHSA correspondants de la baseline**.

**Pourquoi.** Bumper ces deps en bloc casserait du legacy non testé. On les traite **domaine par
domaine** : quand un domaine qui porte une dep vulnérable migre, on met à jour sa dep et on nettoie
la baseline d'autant.

---

## 5. Blast radius du DELETE document — TRANCHÉ (blast radius 7 → 6)

**Historique.** Découvert à la pré-vérif de la migration **`008`** : `documents` avait **7 FK
enfants en `ON DELETE CASCADE`** — `embeddings`, `chapters`, `generated_videos`, `quizzes`,
`notes`, `flashcards_sets`, `chats`. Supprimer un document détruisait donc aussi les notes,
conversations, quiz, flashcards et vidéos rattachés (racine **mono-document** du legacy). Le
DELETE V2 avait été retiré du découpage tant que l'arbitrage produit n'était pas tranché.

**DÉCISION (29 Jul 2026).**
- **Notes DÉCOUPLÉES** (migration **015**) : `notes.document_id` passe de `ON DELETE CASCADE` à
  `ON DELETE SET NULL`. Le document part, la note **reste** dans son notebook (`sourceDocumentId:
  null`). Raison : une note est du contenu écrit par l'utilisateur lui-même, utile sans aucun
  retrieval — contrairement aux chats/quiz/flashcards. Effet de bord réglé au passage : le risque
  cross-user du `sourceDocumentId` (note liée au doc d'autrui, détruite si ce doc disparaît) —
  désormais la note est simplement délinkée.
- **Hard delete ASSUMÉ pour les 6 restants** (`embeddings`, `chapters`, `chats`, `quizzes`,
  `flashcards_sets`, `generated_videos`) : ces objets **dépendent du retrieval** pour avoir du
  sens, et le retrieval est **mono-document** aujourd'hui (`search_vectors`). Les découpler
  maintenant produirait des conversations qui survivent sans plus rien pouvoir retrouver — un
  objet vivant mais cassé, pas mieux qu'un objet supprimé, juste moins visible. **DELETE livré**
  (`notebook-documents.service.ts` → `remove`, e2e étape 16 : note survit + embeddings partis).

**Ce qui reste reporté.** Le **découplage des 6 autres** (chats/quiz/flashcards → `document_id`
nullable ou rattachement au notebook) au **chantier retrieval multi-source** : quand le retrieval
ne sera plus mono-document, ces objets pourront survivre à la suppression d'une de leurs sources.

**Contrat.** La description du DELETE (qui listait les 7 cascades depuis la passe du 27 Jul) doit
retirer les notes des ressources détruites → diff FR+EN préparé pour le prochain rituel contrat.

---

## 6. Insertion d'embeddings non idempotente (bug legacy préexistant)

**État réel.** `AiService.saveEmbeddings` (`src/modules/ai/ai.service.ts:143-170`) fait
`update documents` puis `insert embeddings` **sans contrainte d'unicité** sur `embeddings`
(pas d'unique `(document_id, metadata)` ni équivalent). Toute ré-exécution après un échec à
mi-insert produit des **chunks dupliqués silencieux** (retrieval pollué, tokens recomptés).
Le pipeline legacy étant synchrone et sans retry, le bug est resté théorique ; le **worker V2
retry ×3** le rendrait systématique en cas d'échec partiel.

**Ce qui est fait côté V2 (goal 3 du domaine notebook-documents).** Le handler d'ingestion
**purge les embeddings du document avant (ré)indexation** — obligatoire, pas optionnel.

**Ce qui est reporté.** Une vraie contrainte d'unicité en DB (ou un insert idempotent) — à
trancher avec Giovanni lors de la réécriture RAG, car le shape de `metadata` lui appartient.

**Pourquoi.** Ajouter une contrainte sur une table legacy de production (~136k users, table
la plus volumineuse) demande un audit des doublons existants d'abord ; la purge applicative
V2 couvre le risque immédiat sans toucher au legacy.

---

## 7. Échecs permanents d'ingestion : les retries sont brûlés pour rien

**État réel.** Le worker (`db-job-worker.ts`) retente **tout** échec de handler jusqu'à
`JOBS_MAX_ATTEMPTS` (3), sans distinguer transitoire (S3/Groq/Supadata injoignables — retry
utile) de **permanent** (vidéo YouTube sans transcript, langue de transcript hors en/fr,
payload invalide — retry inutile par construction). Un échec permanent brûle donc 3 tentatives
rapides avant `failed`. Sans gravité : quelques secondes et 2 appels externes perdus par job.

**Ce qui est reporté.** Un signal « non-retryable » dans le contrat `JobHandler` (ex. une
`PermanentJobError` que le worker convertit en `failed` immédiat).

**Pourquoi.** Décision goal 2 (Documents) : pas de chirurgie sur le socle pour un gain
marginal — à faire le jour où un handler a des échecs permanents **coûteux** (LLM long,
fichiers lourds re-téléchargés à chaque tentative).

---

## 8. Tests d'intégration (angle mort)

**État réel.** Les tests unitaires (`*.spec.ts`) mockent **entièrement Supabase** : ils valident la
logique (scoping 404, soft-delete, anti-fuite) mais **jamais le vrai contrat SQL**. Le seul test
qui tape une vraie DB est l'e2e **Notebooks** (`test/e2e/notebooks-folders.e2e.ts`).

**Ce qui est reporté.** Une couche de **tests d'intégration / de contrat contre une vraie DB**
(colonnes réelles, contraintes, RLS) — au minimum un e2e par domaine migré.

**Pourquoi.** Le mock suffit pour figer le socle et le gabarit ; l'intégration réelle se construit
**au fur et à mesure des domaines**, chacun apportant son e2e sur le modèle de Notebooks.

---

## 9. Écarts contrat ↔ implémentation (à traiter en lot)

Le contrat est gelé (`contract-v1`) et **le code s'y conforme** — mais certains points sont
implémentés partiellement, en connaissance de cause. Cette liste est la source de vérité de ces
écarts : chacun doit être **résorbé ou re-tranché explicitement**, jamais oublié en silence.

**Passe de résorption du 21 Jul 2026** (rituel FR → EN → preuve d'équivalence → lint ×2) —
résorbés et SORTIS du tableau : le **400 sur param UUID malformé** (déclaré sur les 24
opérations des domaines implémentés — les domaines futurs le recevront à leur implémentation,
pas avant) · le **`maximum: 86400`** de `durationSeconds` (requête + réponse) · la description
**« bootstrapé par trigger »** de `GET /users/me` (intro comprise — remplacée par la vérité du
lazy-create) · la **sous-description du DELETE document** (le vrai blast radius est désormais
écrit, « en l'état actuel du modèle de données »).

| Route / point du contrat | Ce que dit le contrat | Ce qu'on fait aujourd'hui | Pourquoi / échéance |
|---|---|---|---|
| `POST …/summaries/generate` → **429** (+ les **403** de uploadDocument/ingestUrl/generateSummary) | Gating quota/premium possible | **Jamais émis** — aucun contrôle de quota V2. Note « v1 : non appliqué » posée au contrat (21 Jul) pour le client généré | Différé au chantier quotas/subscriptions (arbitrage F Summaries). Retirer les notes à la livraison du gating. |
| `POST …/documents/url` (page web) | YouTube **ou page web** (scraping) | Page web → **422 `UNSUPPORTED_URL`** provisoire. Note « v1 : YouTube uniquement » posée au contrat (21 Jul) | Séquencement volontaire (arbitrage E Documents) : goal 5, planifié. Retirer la note à la livraison. |
| `DELETE …/documents/:id` | Description à corriger (7→6 cascades : notes découplées, migration 015) | **LIVRÉ** (29 Jul) — hard delete des 6 restants, notes délinkées (§5) | Diff contrat FR+EN préparé pour le prochain rituel. **EXIGENCE FRONT (produit, pas UI)** : le DELETE doit être précédé d'une confirmation qui ÉNUMÈRE ce qui va disparaître (ex. « cette suppression retirera aussi 2 conversations et 1 quiz »). Sans elle, l'utilisateur perd du contenu sans le savoir — le back supprime en cascade, seul le front peut afficher la portée avant l'appel. |
| `PATCH /users/me` → `email` | Modifiable (« propagé à Supabase Auth ») | **LIVRÉ** (04 Aug) — propagation `auth.admin.updateUserById` (Auth d'abord, miroir `profiles` ensuite, compensation rollback), 422 `EMAIL_TAKEN` sur doublon, 500 loggé sur échec Auth | **Diff contrat préparé** : retirer la note « v1 : le changement d'email n'est pas encore disponible (422) » de la description de `updateMe` (FR+EN) — à passer au prochain rituel. |
| Miroir email **Customer.io** | — (implicite : email unique par identité) | Le changement d'email V2 **NE met PAS à jour** le trait Customer.io (`auth.service.ts:874` `identifyCustomer({email})`) → lifecycle emails sur l'ancienne adresse. (Le customer **Stripe**, lui, est désormais synchronisé — `BillingEmailSyncService`, 04 Aug. Le mailer nodemailer lit l'email en direct → jamais stale.) | Différé au chantier emailing (module legacy, keyé sur `id` stable, seul le trait email est périmé). Conséquence bornée : emails cycle de vie / marketing sur l'ancienne adresse (pas de revenu direct, contrairement à Stripe qui a été fait). |
| — mémo | | | ❓ Question ouverte pour **William** (front) : `signUp()` natif crée-t-il un profil, ou tout passe-t-il encore par le backend ? Le lazy-create rend le backend robuste quelle que soit la réponse. Le trigger d'inscription sera la bonne réponse à la migration du domaine auth. |
| Schéma `Citation` + event SSE `citations` (openapi.yaml:2164-2177, 2218-2226) | Citation à plat : `{ documentId, excerpt, pageNumber?, startSeconds?, endSeconds? }`. Le **pluriel** exigé par la v5.11 est déjà respecté (`citations: Citation[]` dans `ChatCitationsEvent` et `ChatMessage`) | **Écart contrat ↔ spec produit v5.11 §10.2** (pas encore d'implémentation — domaine Chat à venir) : la spec exige `Citation = { sourceVersionId, chunkId, quote, locator }` dès le jour 1. Manquent : `sourceVersionId` (aucune notion de version de source dans le modèle actuel), `chunkId`, `locator` polymorphe (on a page/timestamps à plat) | Diff FR+EN préparé pour le prochain rituel contrat (vérif du 03 Aug 2026). ⚠️ `sourceVersionId` exige un **arbitrage modèle de données** (versionner les sources) avant d'être contractualisable honnêtement. |
| `ChatStreamEvent` + routes chat — dual-pane (openapi.yaml:1296-1381, 2249-2264) | Events `token/citations/done/error` **sans discriminant de panneau** ; routes chat **mono-modèle** (aucun champ `model`/`models` dans les request bodies) ; aucune route de comparaison | **Écart contrat ↔ spec produit v5.11 §11.3** : comparaison multi-modèles = 2 panneaux streamés sur **une seule** connexion SSE, events taggés `{ pane, delta }`, cycles de vie indépendants par panneau, retrieval payé une fois et partagé, verdict activé quand les 2 panneaux sont terminaux. **Inexprimable** dans le schéma actuel | Diff FR+EN préparé pour le prochain rituel contrat (vérif du 03 Aug 2026) : route `…/chat/source/compare` + `pane` optionnel sur les events + `done`/`error` par panneau. |
| Capture du verdict de comparaison — **rien nulle part** (contrat, base, legacy) | Aucune route, aucun schéma (grep `verdict\|comparison\|preference\|rating\|feedback\|thumbs\|vote` : seuls hits = notification-preferences, hors sujet). Aucune table dans `database/` (001→015) ; legacy : `chats`/`chat_messages` sans aucune colonne de feedback | **Écart contrat ↔ spec produit v5.11 §11.3** : la comparaison existe pour **capturer des préférences appairées** (prompt, deux réponses, deux ids de modèles, verdict 4 valeurs : pane0 meilleur / deux bons / deux mauvais / pane1 meilleur). Sans capture, le dual-pane ne produit rien | Diff FR+EN + migration `chat_comparisons` préparés pour le prochain rituel contrat (vérif du 03 Aug 2026). ⚠️ Deux arbitrages : **rétention du dataset** (dénormaliser prompt/réponses pour survivre à la suppression du chat = question RGPD) et re-vote (409 vs écrasement). ⚠️ La v5.11 elle-même n'est **pas dans le repo** — exigences exactes de rétention/anonymisation à vérifier sur le document source. |

---

## 10. Recherche : scoping par liste d'ids dans l'URL

**État réel.** `GET /search` contraint documents/notes aux notebooks actifs via
`.in('container_id', activeIds)` (`search.service.ts`) — la liste d'ids passe dans l'URL de la
requête PostgREST (GET). Aux volumes par-utilisateur actuels (dizaines de notebooks), aucun
problème ; à plusieurs *milliers* de notebooks actifs, la longueur d'URL deviendrait limitante.

**Ce qui est reporté.** Remplacer par une jointure/RPC côté Postgres — de toute façon prévu
quand la recherche passera au sémantique (PLAN_TRAVAIL_V2 §27, brique ultérieure).

**Pourquoi.** Théorique aujourd'hui ; le refactor naturel arrive avec la brique sémantique,
inutile de payer deux fois.

---

## 10 bis. Prérequis du futur domaine Chat (SSE) — à intégrer à son design

**État réel.** Le buffering nginx est désactivé (`.platform/nginx/conf.d/streaming.conf`,
27 Jul) — condition nécessaire au `text/event-stream` du contrat, inerte tant que le Chat
n'existe pas. Les timeouts (nginx `graspr.conf` : 300s ; idle timeout ALB : 60s par défaut si
l'environnement EB est load-balancé) sont **volontairement laissés tels quels** — on ne modifie
pas des timeouts globaux de prod pour une feature qui n'existe pas.

**Ce qui est attendu du domaine Chat.**
- **Heartbeat SSE applicatif (~20 s)** — commentaire `: keep-alive` dans le flux — qui rend
  TOUS les timeouts intermédiaires (nginx, ALB) non critiques. Pratique standard, non
  négociable pour le streaming.
- **Vérifier l'idle timeout de l'ALB** au moment du Chat (Othmane — console EB), au cas où.

**Pourquoi tracé ici.** Sans trace, on redécouvrira le problème en debuggant du streaming
saccadé/coupé en prod.

---

## 11. Suppression de compte : politiques FK `user_id` hétérogènes

**État réel.** Le schéma V2 a **trois politiques différentes** sur les FK `user_id → profiles` :
`NO ACTION` implicite assumé (`jobs` — 005, `summaries` — 011, documenté dans la 011),
`ON DELETE CASCADE` (`study_sessions` — 010, défendable : télémétrie sans valeur orpheline),
et les tables legacy ont leurs propres comportements (`notes` : CASCADE — 001). Aucune n'est
fausse isolément, mais le jour d'une suppression de compte, trois comportements différents
se déclencheraient en même temps.

**Ce qui est reporté.** **Harmoniser les politiques FK `user_id`** (NO ACTION vs CASCADE selon
les tables, décision par table documentée) **au chantier suppression de compte** — avec le
traitement de `jobs`/`summaries` déjà renvoyé à ce chantier par la migration 011.

**Pourquoi.** Non bloquant tant que la suppression de compte passe par le flux legacy ; tracé
ici pour ne pas redécouvrir trois comportements le jour venu (décision Othmane, revue
study-sessions du 20 Jul).
