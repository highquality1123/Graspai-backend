import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private readonly username = process.env.ADMIN_STATS_BASIC_AUTH_LOGIN;
  private readonly password = process.env.ADMIN_STATS_BASIC_AUTH_PASS;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response: Response = context.switchToHttp().getResponse();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      response.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
      response.status(401).send('Authentication required');
      return false;
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username !== this.username || password !== this.password) {
      response.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
      response.status(401).send('Invalid credentials');
      return false;
    }

    return true;
  }
}
