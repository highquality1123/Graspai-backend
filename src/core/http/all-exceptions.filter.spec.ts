import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorBody } from './error-code';

interface Captured {
  status?: number;
  body?: ErrorBody;
}

function createHost(type = 'http'): { host: ArgumentsHost; captured: Captured } {
  const captured: Captured = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ErrorBody) {
      captured.body = body;
      return this;
    },
  };
  const request = { method: 'GET', url: '/v1/test' };

  const host = {
    getType: () => type,
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'debug').mockImplementation(() => undefined);
  });

  it('passes through an explicit { message, code } payload (guard-style)', () => {
    const { host, captured } = createHost();
    filter.catch(new UnauthorizedException({ message: 'Invalid or expired token', code: 'UNAUTHORIZED' }), host);

    expect(captured.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(captured.body).toEqual({ message: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  });

  it('keeps a business code carried by the exception (QUOTA_EXCEEDED)', () => {
    const { host, captured } = createHost();
    filter.catch(new ForbiddenException({ message: 'Monthly AI prompt quota exceeded', code: 'QUOTA_EXCEEDED' }), host);

    expect(captured.status).toBe(HttpStatus.FORBIDDEN);
    expect(captured.body).toEqual({ message: 'Monthly AI prompt quota exceeded', code: 'QUOTA_EXCEEDED' });
  });

  it('derives a SNAKE_CASE code from the status for a default NestJS exception', () => {
    const { host, captured } = createHost();
    filter.catch(new NotFoundException('Notebook not found'), host);

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toEqual({ message: 'Notebook not found', code: 'NOT_FOUND' });
  });

  it('flattens a ValidationPipe message array into one string', () => {
    const { host, captured } = createHost();
    filter.catch(new BadRequestException(['title must not be empty', 'title must be a string']), host);

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body?.code).toBe('BAD_REQUEST');
    expect(captured.body?.message).toBe('title must not be empty; title must be a string');
  });

  it('handles an HttpException built from a raw string response', () => {
    const { host, captured } = createHost();
    filter.catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), host);

    expect(captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(captured.body).toEqual({ message: 'Teapot', code: 'ERROR' });
  });

  it('maps an unknown error to 500 without leaking internals', () => {
    const { host, captured } = createHost();
    filter.catch(new Error('DB password is hunter2 at pg://secret-host'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({ message: 'Internal server error', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(captured.body)).not.toContain('hunter2');
  });

  it('logs 5xx with a stack and stays silent in the response body', () => {
    const { host } = createHost();
    const errorSpy = filter['logger'].error as jest.Mock;
    filter.catch(new Error('boom'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores non-HTTP contexts (legacy Socket.io gateway)', () => {
    const { host, captured } = createHost('ws');
    filter.catch(new Error('ws error'), host);

    expect(captured.status).toBeUndefined();
    expect(captured.body).toBeUndefined();
  });
});
