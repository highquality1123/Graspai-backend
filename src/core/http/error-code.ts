import { HttpStatus } from '@nestjs/common';

/**
 * Forme d'erreur unique du contrat (openapi.yaml → schema Error).
 * `code` est un identifiant machine stable en SNAKE_CASE (`^[A-Z0-9_]+$`).
 */
export interface ErrorBody {
  message: string;
  code: string;
}

/**
 * Code SNAKE_CASE par défaut dérivé du statut HTTP, quand l'exception ne
 * fournit pas son propre `code`. Un handler qui veut un code métier précis
 * (ex. `QUOTA_EXCEEDED`) le passe explicitement : `new ForbiddenException({ message, code })`.
 * Les libellés s'alignent sur les exemples du contrat (`VALIDATION_FAILED` pour 422, etc.).
 */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
};

export function defaultCodeForStatus(status: number): string {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}
