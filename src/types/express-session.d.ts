import 'express-session';
import { IUserDTO } from '../modules/auth/model/login.dto';

declare module 'express-session' {
  interface SessionData {
    user?: IUserDTO; // Add the user property to the session
  }
}
