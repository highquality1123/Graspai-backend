import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { defaultCodeForStatus, ErrorBody } from './error-code';

/**
 * Filtre global : point UNIQUE de mise en forme des erreurs.
 * Toute exception ressort au format du contrat `{ message, code }` (openapi.yaml → Error).
 * Les handlers ne formatent jamais d'erreur à la main : ils jettent une HttpException,
 * avec un `code` métier explicite si besoin (`throw new ForbiddenException({ message, code: 'QUOTA_EXCEEDED' })`).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Ne gère que le HTTP : les erreurs du gateway Socket.io legacy ne passent pas par ici.
    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.toErrorResponse(exception);

    // On loggue la vraie cause côté serveur (avec stack pour les 5xx), jamais dans la réponse.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url} -> ${status} ${body.code}`, this.stackOf(exception));
    } else {
      this.logger.debug(`${request.method} ${request.url} -> ${status} ${body.code}`);
    }

    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return { status, body: { message: res, code: defaultCodeForStatus(status) } };
      }

      const obj = res as Record<string, unknown>;
      const code = typeof obj.code === 'string' ? obj.code : defaultCodeForStatus(status);
      const message = this.normalizeMessage(obj.message) ?? exception.message ?? defaultCodeForStatus(status);
      return { status, body: { message, code } };
    }

    // Exception non maîtrisée : on ne fuit ni le message interne ni la stack.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    };
  }

  /** ValidationPipe renvoie un tableau de messages ; on l'aplatit en une phrase lisible. */
  private normalizeMessage(message: unknown): string | undefined {
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.length > 0) {
      return message.map(String).join('; ');
    }
    return undefined;
  }

  private stackOf(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : String(exception);
  }
}
