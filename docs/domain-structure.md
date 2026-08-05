# Créer un domaine V2 — guide de copie

Ce guide sert à démarrer un nouveau domaine (ex. **Notes**) en **calquant** le gabarit
`src/modules/notebooks/`. Ce ne sont **pas** des généralités NestJS — uniquement **nos**
conventions, ancrées sur du code réel. La démarche :

> **Copie `src/modules/notebooks/`, renomme, et conforme-toi au contrat `openapi.yaml`.**

---

## 1. Arborescence d'un domaine

Référence : `src/modules/notebooks/`. Un domaine = un dossier `src/modules/<domaine>/` :

```
src/modules/<domaine>/
├─ <domaine>.module.ts        # déclare controllers + services ; à ajouter à V2_MODULES
├─ <domaine>.controller.ts    # routes HTTP — FIN, aucune logique métier
├─ <domaine>.service.ts       # toute la logique : DB, scoping, règles métier
├─ <domaine>.mapper.ts        # ligne DB (snake_case) -> forme du contrat (camelCase)
├─ model/
│  ├─ <domaine>.types.ts      # types de réponse (contrat) + types de ligne DB (internes)
│  └─ *.dto.ts                # 1 classe DTO par payload d'entrée (class-validator)
├─ <domaine>.service.spec.ts  # tests unitaires du service (Supabase mocké)
└─ <domaine>.mapper.spec.ts   # tests unitaires du mapper (anti-fuite)
```

Un domaine peut avoir **plusieurs** controllers/services (Notebooks en a 2 : `notebooks.*`
et `folders.*`). Un concern simple comme Notes en aura un seul de chaque.

Rôle de chaque fichier (analogie MVC) : **controller = C** (route + validation d'entrée),
**service = M** (logique + accès données), **mapper = transformation vers la vue de sortie**,
**DTO = validation de la vue d'entrée**.

---

## 2. Conventions non-négociables

Chacune est visible dans `notebooks/` — copie le pattern, ne réinvente pas.

**a. Controller fin, logique dans le service.** Le controller ne fait que router et déléguer.
→ `notebooks.controller.ts` : chaque méthode fait une ligne `return this.service.xxx(user.userId, ...)`.

**b. Garde Bearer globale — ne rien faire de spécial.** Toutes les routes sont protégées
**par défaut** (garde globale `APP_GUARD` dans `src/core/core.module.ts`). Ton domaine
**n'ajoute pas** `@Public()` — `@Public()` est réservé au legacy. Récupère l'utilisateur avec
`@CurrentUser()` (→ `AuthUser { userId, email }`, voir `src/core/auth/current-user.decorator.ts`).
→ `notebooks.controller.ts` : `@ApiBearerAuth()` + `@CurrentUser() user: AuthUser`.

**c. Scoping par `user_id` DANS le service, 404 (jamais 403).** Le service vérifie la
propriété et jette **404 `NOT_FOUND`** si la ressource est absente **ou** non-possédée
(on ne révèle jamais l'existence via un 403).
→ `notebooks.service.ts` → `getOwnedContainer()` : filtre `.eq('user_id', userId).is('deleted_at', null)` puis `throw new NotFoundException({ message, code: 'NOT_FOUND' })`.

**d. Erreurs : jette une `HttpException`, ne formate jamais à la main.** Le filtre global
(`src/core/http/all-exceptions.filter.ts`) met tout au format contrat `{ message, code }`.
Utilise `NotFoundException`, `UnprocessableEntityException`, etc., avec un `code` explicite si besoin.
→ `notebooks.service.ts` : `throw new UnprocessableEntityException({ message, code: 'VALIDATION_FAILED' })`.

**e. DTO = classes `class-validator`, whitelist stricte.** Le `ValidationPipe` global
(`src/core/http/validation-pipe.ts`) rejette tout champ inconnu en **422** (`forbidNonWhitelisted`).
Un DTO est une **classe** décorée (jamais une `interface` — une interface n'est pas validée).
→ `model/create-notebook.dto.ts` : `@IsString() @MinLength(1) @MaxLength(200) title: string`.

**f. Mapper anti-fuite : ligne DB → contrat, aucune colonne interne ne sort.** Le mapper
recopie **uniquement** les champs du contrat. `user_id`, `deleted_at`, `schema_version`, et
les noms de colonnes legacy (`name`, `folder_id` brut…) ne sortent **jamais**.
→ `notebooks.mapper.ts` :

```ts
export function toNotebook(row: ContainerRow): Notebook {
  return {
    id: row.id,
    title: row.name ?? '',        // name (DB) -> title (contrat)
    folderId: row.folder_id,
    pinned: row.pinned,
    visibility: row.visibility,
    prompt: row.prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // PAS de user_id, schema_version, deleted_at, migration_document_id…
  };
}
```

**g. Toute écriture re-scopée par `user_id`** (defense-in-depth, en plus du check de propriété).
→ `notebooks.service.ts` → `patchAndReturn()` et `softDelete()` : `.eq('id', id).eq('user_id', userId)`.

**h. Soft-delete via `deleted_at`.** Supprimer = `UPDATE … SET deleted_at = now()`. **Toutes**
les lectures filtrent `.is('deleted_at', null)`.
→ `notebooks.service.ts` → `softDelete()` + tous les `fetch*`/`getOwnedContainer`.

**i. Ajoute le module à `V2_MODULES`** (`src/core/swagger/swagger.ts`) — sinon il **n'apparaît
pas** dans le Swagger `/api`. Et importe-le dans `src/app.module.ts`.

**j. Fichiers en LF** (imposé par `.gitattributes`). `yarn lint src/modules/<domaine>` / l'éditeur
s'en chargent. ⚠️ **Toujours passer des chemins à `yarn lint`** (il échoue à vide, c'est voulu) et
**jamais `src/` entier** : `--fix` réécrirait les ~140 fichiers legacy encore en CRLF/ancien style
(blame détruit, conflits) — et la CI ne le rattraperait pas, elle ne vérifie que les fichiers que
ta PR modifie.

---

## 3. Le contrat est la source de vérité

Le domaine se conforme à **`openapi.yaml`** — **au champ près** (noms, types, status codes,
champs requis). **On ne modifie pas le contrat pour arranger le code** (il est gelé, tag
`contract-v1`). Génère la doc lisible avec `yarn docs:api` → `openapi.html`.

Si le contrat ne colle pas à la réalité de la DB (colonne manquante, etc.) : **ne bricole pas
en silence** — signale-le et propose une migration additive (voir `database/006-…`, `007-…`).

---

## 4. Tests attendus

**Unitaires (Supabase mocké)** — obligatoires, copie le pattern de `notebooks/` :
- **Service** (`*.service.spec.ts`) : scoping non-possédé → **404**, soft-delete, règles métier.
- **Mapper** (`*.mapper.spec.ts`) : forme du contrat **+ anti-fuite** (asserte qu'aucune
  colonne interne n'apparaît).
- Le mock Supabase par **table** (queue de chaînes) est dans `notebooks.service.spec.ts` — copie-le.

**End-to-end (serveur réel)** — modèle à copier : `test/e2e/notebooks-folders.e2e.ts`
(cycle de vie complet HTTP + assertions de conformité contrat + nettoyage). À adapter au domaine.

Lancer : `yarn test` (unitaires) · `npx ts-node test/e2e/<domaine>.e2e.ts` (e2e, serveur requis).

---

## 5. Checklist avant d'ouvrir ta PR

- [ ] Formes de réponse **au champ près** du contrat `openapi.yaml`.
- [ ] Garde en place (aucune route sans auth ; **pas** de `@Public()`).
- [ ] Scoping `user_id` en service → **404** (jamais 403) si absent/non-possédé.
- [ ] Toutes les écritures re-scopées par `user_id`.
- [ ] Soft-delete + lectures filtrant `deleted_at IS NULL`.
- [ ] Mapper **sans fuite** de colonne interne (testé).
- [ ] DTO = classes validées (champ inconnu → 422).
- [ ] Module ajouté à **`V2_MODULES`** + importé dans `app.module.ts`.
- [ ] Tests **verts** (`yarn test`), lint **clean** (`yarn lint src/modules/<domaine>` + les autres
      fichiers touchés — voir le ⚠️ du point 2.j : jamais nu, jamais `src/` entier).
- [ ] Fichiers en **LF**.
