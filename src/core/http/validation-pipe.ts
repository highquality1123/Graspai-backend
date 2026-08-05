import { HttpStatus, ValidationPipe } from '@nestjs/common';

/**
 * ValidationPipe global — validation unique des entrées à partir des DTO.
 *
 * Convention DTO (V2) :
 *  - un DTO est une **classe** décorée avec class-validator, dans `model/`, fichier `*.dto.ts`,
 *    nommée `XxxDto`. Les `interface` ne sont PAS validées (effacées à la compilation) — le legacy
 *    en a (notes, generated-videos), à convertir quand ces domaines migreront.
 *  - une propriété sans décorateur est retirée du payload (`whitelist`). On ne met donc pas de
 *    valeur par défaut en dur sur un champ requis : avec `transform`, elle masquerait l'absence du champ.
 *
 * Réglages :
 *  - `whitelist` + `forbidNonWhitelisted` : rejet strict (422) de tout champ non déclaré. Le seul client
 *    est le front V2, qui cible le contrat directement — une faute de frappe (`titel` au lieu de `title`)
 *    ou un champ en trop doit remonter une erreur claire, pas être avalé en silence.
 *  - `transform` + `enableImplicitConversion` : instancie le DTO et coerce les types (ex. `limit`
 *    de query en number).
 *  - `errorHttpStatusCode` : 422 → mappé en `VALIDATION_FAILED` par le filtre global, conforme au contrat.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });
}
