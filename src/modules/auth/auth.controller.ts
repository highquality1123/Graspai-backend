// NestJS
import { Body, Controller, Get, HttpException, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';

import { Response as ExpressResponse } from 'express';

// Nest Swagger
import { ApiBody, ApiHeaders, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

// Auth Data Transfer Object (DTO)
import { AuthDTO, SessionDTO } from './model/auth.dto';
import { RegisterUserDto, VerifyConfirmationOtpDTO } from './model/registerUser.dto';
import { resetPasswordDto } from './model/resetPassword.dto';
import { newPassDto } from './model/newPassword.dto';

// Types
import { Request } from 'express';
import { AuthService } from './auth.service';
import { IUserDTO } from './model/login.dto';
import { verifyOtpDto } from './model/verifyOtp.dto';

import { SessionService } from '../session/session.service';
import { Public } from '../../core/auth/public.decorator';

/**
 * Auth Controller
 *
 * @param authData - The authentication data containing user credentials
 * @returns A promise that resolves to an object containing the user and the authentication token
 */
@ApiTags('Auth')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  // =================== POST: User Login ======================
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
        password: {
          type: 'string',
        },
      },
    },
  })
  async login(@Body() authData: AuthDTO): Promise<{ user: IUserDTO; session: SessionDTO }> {
    return await this.authService.login(authData);
  }

  // -----------------------------------------------
  //
  //             Google OAuth Endpoint
  //
  // -----------------------------------------------
  @ApiOperation({ summary: 'Google Auth' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Post Created Successfully',
    type: AuthDTO,
  })
  @Get('google')
  async googleAuth(@Res() res: ExpressResponse) {
    try {
      const redirectUrl = await this.authService.getGoogleAuthUrl();
      return res.redirect(redirectUrl);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // -----------------------------------------------
  //
  //           Google OAuth Callback Endpoint
  //
  // -----------------------------------------------
  @Get('google/callback')
  async googleAuthCallback(@Query('code') code: string, @Res() res: ExpressResponse) {
    try {
      const { access_token, expires_in, refresh_token } = await this.authService.googleAuthCallback({ code });
      return res.redirect(
        `${process.env.WEBSITE_URL}/session-guard?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`,
      );
    } catch (error) {
      console.error('google/callback', error);
      // On error, redirect somewhere else
      return res.redirect(302, `${process.env.WEBSITE_URL}/login?status=error`);
    }
  }

  // -----------------------------------------------
  //
  //           Verify G-OAuth Endpoint
  //
  // -----------------------------------------------
  @Get('verify-OAuth')
  async getMe(@Req() req: Request) {
    try {
      // Extract Bearer Token from Authorization Header
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException('Missing access token', HttpStatus.UNAUTHORIZED);
      }
      const accessToken = authHeader.split(' ')[1]; // Extract token

      // Call AuthService to validate the token and get user data
      const user = await this.authService.verifyTokenAndReturnUser({ accessToken });
      return { user };
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // =================== POST: User Registration ======================
  /**
   * Registers a new user and creates a Stripe customer account for the user.
   * @Body {RegisterUserDto} user - The user object con`taining user registration details.
   * @returns {Promise<IUser>} Returns a Promise that resolves to a User objec`t.
   */
  @Post('/register')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: {
          type: 'string',
        },
        email: {
          type: 'string',
        },
        password: {
          type: 'string',
        },
      },
    },
  })
  async register(@Body() user: RegisterUserDto): Promise<{ user: IUserDTO } | { message: string }> {
    return await this.authService.register(user);
  }

  // =================== POST: User Resend Verification ======================
  /**
   * Resends verification otp.
   * @Body {RegisterUserDto} user - The user object containing user registration details.
   * @returns {Promise<IUser>} Returns a Promise that resolves to a User object.
   */
  @Post('/resendVerification')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
      },
    },
  })
  async resendVerification(@Body() { email }: { email: string }): Promise<{ message: string }> {
    return await this.authService.resendConfirmationOTP({ email });
  }

  // =================== POST: User Verification ======================
  /**
   * verifies new user accounts.
   * @Body {VerifyConfirmationOtpDTO} payload - takes id and otp as payload.
   * @returns {Promise<boolean>} Returns a Promise that resolves to a boolean value.
   */
  @Post('/verify')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
        otp: {
          type: 'number',
        },
        password: {
          type: 'string',
        },
      },
    },
  })
  async verifyOtp(@Body() payload: VerifyConfirmationOtpDTO): Promise<{ session: SessionDTO; user: IUserDTO }> {
    return await this.authService.verifyConfirmationOTP(payload);
  }

  // =================== POST: Request Reset Password ======================
  /**
   * Requests reset pass and returns otp on email.
   * @Body {resetPasswordDTO} resetPasswordDTO - The user's email address.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  @Post('/requestResetPassword')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
      },
    },
  })
  async requestResetPassword(@Body() reqBody: resetPasswordDto): Promise<{ message: string }> {
    return await this.authService.requestResetPassword(reqBody);
  }

  // =================== POST: Verify Reset Password ======================
  /**
   * Verify otp and returns success message.
   * @Body {resetPasswordDTO} resetPasswordDTO - The otp and email.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  @Post('/verifyResetPasswordOtp')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
        code: {
          type: 'string',
        },
      },
    },
  })
  async verifyResetPasswordOtp(@Body() reqBody: verifyOtpDto): Promise<{ message: string }> {
    return await this.authService.verifyResetPasswordOtp(reqBody);
  }

  // =================== POST: Reset New Pass ======================
  /**
   * New Pass and token will send and returns success message.
   * @Body {newPassDto} newPass - The otp, password to be set and email.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  @Post('/resetPassword')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
        },
        code: {
          type: 'string',
        },
        password: {
          type: 'string',
        },
      },
    },
  })
  async resetPassword(@Body() reqBody: newPassDto): Promise<{ message: string }> {
    return await this.authService.resetPass(reqBody);
  }

  // =================== GET: User ======================
  /**
   * Get user by token.
   * @returns {Promise<IUserDTO>} Returns a Promise that resolves to a IUserDTO object.
   */
  @Get('/getUser')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  public async getUser(@Req() req: Request): Promise<IUserDTO> {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const safeUser: IUserDTO = {
      id: user.id,
      email: user.email,
      full_name: user.profile.full_name,
      profile_picture: user.profile.profile_picture,
      profile_status: user.profile.profile_status,
      role: user.profile.role,
      subscriptions: user.profile.subscriptions,
      stats: user.profile.stats,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return safeUser;
  }
}
