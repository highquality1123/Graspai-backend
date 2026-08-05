import { Request } from 'express';

export interface AuthUser {
  userId: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
