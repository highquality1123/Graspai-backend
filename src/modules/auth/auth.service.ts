// Nest JS Imports
import { HttpException, HttpStatus, Injectable, Request } from '@nestjs/common';

// Supabase imports
import { AuthResponse, Session, SupabaseClient } from '@supabase/supabase-js';

// Interfaces Imports
import { resetPasswordDto } from './model/resetPassword.dto';
import { RegisterUserDto, VerifyConfirmationOtpDTO } from './model/registerUser.dto';
import { AuthDTO, SessionDTO } from './model/auth.dto';
import { newPassDto } from './model/newPassword.dto';
import { verifyOtpDto } from './model/verifyOtp.dto';
import { IUserDTO } from './model/login.dto';
import { AUTH_ROLES } from 'src/modules/auth/model/user.enum';

// services
import formatter from 'src/services/formatter';
import generator from 'src/services/generator';
import mailService from 'src/services/mail';

import { ContainersService } from '../containers/containers.service';
import { StripeStatus } from '../stripe/model/stripe.enums';
import { CustomerioService } from "../customerio/customerio.service";
import { AmplitudeService } from "../amplitude/amplitude.service";
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly containersService: ContainersService,
    private readonly customerioService: CustomerioService,
    private readonly amplitudeService: AmplitudeService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  // =================== POST: User Login ======================
  /**
   * Logs in a user and returns a JWT token.
   * @param {AuthDTO} user - The user's email address and password.
   * @returns {Promise<IUserDTO>} Returns a Promise that resolves to a User object.
   */
  async login(user: AuthDTO): Promise<{ user: IUserDTO; session: SessionDTO }> {
    try {
      const { data: authUser, error: authUserError } = await this.supabase
        .from('profiles')
        .select('sso_enabled')
        .eq('email', user.email.toLowerCase())
        .single();
      // Find the user in the `auth.users` table to check the provider
      if (authUserError) {
        throw new HttpException(authUserError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Check if the user signed up via Google OAuth
      if (authUser.sso_enabled) {
        throw new HttpException('Email registered with gmail, please login with Google', HttpStatus.BAD_REQUEST);
      }

      const {
        data: { session, user: userObject },
        error: loginError,
      } = await this.supabase.auth.signInWithPassword({
        email: user.email.toLowerCase(),
        password: user.password,
      });

      if (loginError) {
        throw new HttpException(loginError.message, loginError.status);
      }

      const {
        error: getProfileError,
        data: profilesFound,
        status: getProfileStatus,
      } = await this.supabase.from('profiles').select('*, subscriptions(subscription_status)').eq('id', userObject.id);

      if (getProfileError) {
        throw new HttpException(getProfileError.message, getProfileStatus);
      }

      const userProfile = profilesFound.length > 0 ? profilesFound[0] : null;

      if (!userProfile) {
        throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
      }

      const safeUser = {
        id: userObject.id,
        email: userObject.email,
        full_name: userProfile.full_name,
        created_at: userProfile.created_at,
        updated_at: userProfile.updated_at,
        profile_picture: userProfile.profile_picture,
        profile_status: userProfile.profile_status,
        role: userProfile.role,
        isSubscribed: this.getIsSubscribed(userProfile)
      };

      return {
        user: safeUser,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private getIsSubscribed(userProfile: any) {
    return userProfile.subscriptions.filter((s) => s.subscription_status != StripeStatus.DELETED).length !== 0;
  }

  // ---------------------------------------------------
  //
  //             Google OAuth Business Logic
  //
  // ---------------------------------------------------
  /**
   * @description This method generates a URL for initiating the Google OAuth authentication process, allowing users to sign in with their Google accounts.
   *
   * @returns {Promise<string>} - Returns a Promise that resolves to the Google OAuth sign-in URL.
   *
   * @throws {HttpException} - Throws an exception if there is an error retrieving the OAuth URL, such as a failure in the authentication service.
   *
   * @example
   * const googleAuthUrl = await getGoogleAuthUrl(); // the URL for Google sign-in
   */
  async getGoogleAuthUrl(): Promise<string> {
    const backend_url = process.env.BACKEND_URL ?? 'https://test-api.graspr.ai';
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${backend_url}/auth/google/callback`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      throw new HttpException(
        error?.message || 'Failed to retrieve Google OAuth URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return data.url;
  }

  // ---------------------------------------------------
  //
  //         Google OAuth Callback Business Logic
  //
  // ---------------------------------------------------
  /**
   * @description This method handles the Google OAuth callback by exchanging the provided authorization code for a user session.
   * It verifies the user's existence in the application's profiles database and creates a new profile if necessary.
   *
   * @param {Object} options - An object containing the authorization code for the OAuth process.
   * @param {string} options.code - The authorization code received from Google after user consent.
   *
   * @returns {Promise<Session>} - Returns a Promise that resolves to the user session if successful.
   *
   * @throws {HttpException} - Throws an exception for various errors, including unauthorized access, user not found,
   * database errors, and unexpected issues during the process.
   *
   * @example
   * const session = await googleAuthCallback({ code: 'authorization_code_here' });
   */
  async googleAuthCallback({ code }: { code: string }): Promise<Session> {
    try {
      // Step 1: Exchange authorization code for a session
      const { data, error: exchangeError } = await this.supabase.auth.exchangeCodeForSession(code);

      if (exchangeError || !data?.session) {
        throw new HttpException(
          exchangeError?.message || 'Failed to exchange OAuth code for session.',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const { session } = data;
      const { user: supabaseUser } = session;

      if (!supabaseUser) {
        throw new HttpException('User not found in session.', HttpStatus.UNAUTHORIZED);
      }

      // Step 2: Check if user exists in 'profiles'
      const { data: existingProfiles, error: profileError } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .maybeSingle(); // Fetch at most one record

      if (profileError) {
        throw new HttpException('Database error while fetching user profile.', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      let profile: IUserDTO = existingProfiles;

      // Step 3: If user does not exist, insert into 'profiles'
      if (!profile) {
        const newProfile: IUserDTO = {
          id: supabaseUser.id,
          full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
          email: supabaseUser.email,
          profile_picture: supabaseUser.user_metadata.picture || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          profile_status: 'complete',
          role: AUTH_ROLES.USER,
          confirmed: true,
          sso_enabled: true,
        };

        const { error: insertError } = await this.supabase.from('profiles').insert([newProfile]);

        if (insertError) {
          throw new HttpException('Failed to register new user.', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        profile = newProfile; // Use the inserted profile directly
        await this.trackProfileCreation(profile);
      }

      await this.createDefaultContainerForUserIfNeeded(profile.id);

      // update profile and set sso_enabled to true
      await this.supabase
        .from('profiles')
        .update({
          profile_picture: supabaseUser.user_metadata.picture || null,
          sso_enabled: true,
        })
        .eq('id', profile.id);

      return session;
    } catch (err) {
      console.log('googleAuthCallback', err);
      throw new HttpException(err.message || 'Unexpected error occurred.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ---------------------------------------------------
  //
  //         Token Verification Business Logic
  //
  // ---------------------------------------------------
  /**
   * @description This method verifies an access token and retrieves the associated user information from the database.
   * It first checks the validity of the access token using Supabase and then fetches the user's profile from the 'profiles' table.
   *
   * @param {Object} options - An object containing the access token for verification.
   * @param {string} options.accessToken - The access token to be verified.
   *
   * @returns {Promise<Object>} - Returns a Promise that resolves to an object containing structured user data, including
   * user ID, email, full name, profile picture, profile status, role, and timestamps.
   *
   * @throws {HttpException} - Throws an exception for various errors, including invalid or expired tokens,
   * profile not found, and other issues during the verification process.
   *
   * @example
   * const user = await verifyTokenAndReturnUser({ accessToken: 'your_access_token_here' });
   */
  async verifyTokenAndReturnUser({ accessToken }: { accessToken: string }): Promise<Object> {
    // Step 1: Verify the access token with Supabase
    const { data, error } = await this.supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }

    const { user } = data;

    // Step 2: Fetch user's profile from 'profiles' table
    const { data: profiles, error: profileError } = await this.supabase.from('profiles').select('*, subscriptions(subscription_status)').eq('id', user.id);

    if (profileError || !profiles.length) {
      throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    }

    const profile = profiles[0];

    // Step 3: Return structured user data
    return {
      id: user.id,
      email: user.email,
      full_name: profile.full_name,
      profile_picture: profile.profile_picture,
      profile_status: profile.profile_status,
      role: profile.role,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      isSubscribed: this.getIsSubscribed(profile)
    };
  }

  // =================== POST: User Registration ======================
  /**
   * Registers a new user
   * @args User - The user object containing user registration details.
   * @returns {Promise<IUser>} Returns a Promise that resolves to a User object.
   */
  async register(userDocument: RegisterUserDto): Promise<{ user: IUserDTO } | { message: string }> {
    try {
      // check if user exists
      const {
        data: usersFound,
        error: getUsersError,
        status: getUsersStatus,
      } = await this.supabase.from('profiles').select('*').eq('email', userDocument.email.toLowerCase());

      // handle error
      if (getUsersError) {
        throw new HttpException(getUsersError.message, getUsersStatus);
      }

      const userFound = usersFound.length && usersFound[0];
      // if user exists and is confirmed
      if (userFound && userFound.confirmed) {
        throw new HttpException('Email is already registered', HttpStatus.CONFLICT);
      }

      // if user did not confirm email
      if (userFound && userFound.confirmed === false) {
        const { error: updateUserError } = await this.supabase.auth.admin.updateUserById(userFound.id, {
          password: userDocument.password,
        });

        if (updateUserError) {
          throw new HttpException(updateUserError.message, updateUserError.status);
        }

        const { error: updateUserProfileError, status: updateUserProfileStatus } = await this.supabase
          .from('profiles')
          .update({
            confirmation_otp: null,
            confirmation_otp_expiry: null,
            full_name: userDocument.fullName,
          })
          .eq('id', userFound.id);

        if (updateUserProfileError) {
          throw new HttpException(updateUserProfileError.message, updateUserProfileStatus);
        }

        return await this.resendConfirmationOTP({ email: userDocument.email.toLowerCase() });
      }

      // if user does not exist, create user
      const {
        error: createUserError,
        data: { user: savedUser },
      } = await this.supabase.auth.admin.createUser({
        email: userDocument.email.toLowerCase(),
        password: userDocument.password,
        email_confirm: false,
      });

      // if error with creating user
      if (createUserError) {
        throw new HttpException(createUserError.message, createUserError.status);
      }

      // user created, now create the profile
      const userObject: IUserDTO = {
        id: savedUser.id,
        email: savedUser.email,
        full_name: userDocument.fullName,
        created_at: savedUser.created_at,
        updated_at: savedUser.updated_at,
        profile_picture: null,
        profile_status: 'incomplete',
        role: AUTH_ROLES.USER,
      };
      
      const confirmation_otp_expiry = formatter.dateToPostgresTimestampWithTimezone(
        new Date(new Date().getTime() + 15 * 60000),
      );
      const confirmation_otp = Number(generator.generateOTPCode(6));

      // save the profile
      const { error: createUserProfileError, status: createUserProfileStatus } = await this.supabase
        .from('profiles')
        .insert([
          {
            ...userObject,
            confirmation_otp,
            confirmation_otp_expiry,
          },
        ]);

      // if error with creating user profile
      if (createUserProfileError) {
        throw new HttpException(createUserProfileError.message, createUserProfileStatus);
      }

      await this.createDefaultContainerForUserIfNeeded(savedUser.id);
      await this.trackProfileCreation(userObject);

      // send otp to user
      const emailTo = userObject.email;
      const emailSubject = `OTP for registration with GrasprAI`;
      const emailBody = `
        <html>
          <body>
            <p>Hello ${userObject.full_name},</p>
            <p>Thank you for registering with GrasprAI! Please use the following OTP to complete your registration:</p>
            <p>OTP: ${confirmation_otp}</p>
            <p>This OTP will expire in 15 minutes.</p>
            <p>If you did not register with GrasprAI, please ignore this email.</p>
            <p>Best regards,</p>
            <p>GrasprAI Team</p>
          </body>
        </html>
      `;

      await mailService.sendEmail(emailTo, emailSubject, emailBody, (error) => {
        if (error) {
          throw new HttpException(
            error?.message ? error.message : 'FAILED TO SEND EMAIL',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      });

      // return user
      return {
        user: userObject,
      };
    } catch (error) {
      console.log('[AUTH] signup error: ', error);
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  private async createDefaultContainerForUserIfNeeded(userId: string) {
    const userContainers = await this.containersService.getContainersByUserId(userId);
    if (userContainers.length === 0) {
      this.containersService.createContainer(userId, {
        name: 'New Chat',
      });
    }
  }

  // =================== POST: Resend Confirmation OTP ======================
  /**
   * @description Resend confirmation otp to user
   * @param {email} email - The user's email address.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  async resendConfirmationOTP({ email }: { email: string }): Promise<{ message: string }> {
    const {
      data: users,
      error: getUserError,
      status: getUserStatus,
    } = await this.supabase
      .from('profiles')
      .select('id,full_name, email, confirmation_otp, confirmation_otp_expiry')
      .eq('email', email.toLowerCase());

    if (getUserError) {
      throw new HttpException(getUserError.message, getUserStatus);
    }
    if (!users.length) {
      throw new HttpException('USER NOT FOUND', HttpStatus.NOT_FOUND);
    }

    const user = users[0];

    const expiryDate = new Date(user.confirmation_otp_expiry).getTime();
    const currentDate = new Date().getTime();

    let isOTPExpired = true;

    if (expiryDate < currentDate) {
      isOTPExpired = true;
    }

    const confirmation_otp_expiry = isOTPExpired
      ? formatter.dateToPostgresTimestampWithTimezone(new Date(new Date().getTime() + 15 * 60000))
      : user.confirmation_otp_expiry;
    const confirmation_otp = isOTPExpired ? Number(generator.generateOTPCode(6)) : user.confirmation_otp;

    const { error: updateUserError, status: updateUserStatus } = await this.supabase
      .from('profiles')
      .update({ confirmation_otp, confirmation_otp_expiry })
      .eq('id', user.id);

    if (updateUserError) {
      throw new HttpException(updateUserError.message, updateUserStatus);
    }

    // send otp to user
    const emailTo = user.email;
    const emailSubject = `OTP for registration with GrasprAI`;
    const emailBody = `
      <html>
        <body>
          <p>Hello ${user.full_name},</p>
          <p>Thank you for registering with GrasprAI! Please use the following OTP to complete your registration:</p>
          <p>OTP: ${confirmation_otp}</p>
          <p>This OTP will expire in 15 minutes.</p>
          <p>If you did not register with GrasprAI, please ignore this email.</p>
          <p>Best regards,</p>
          <p>GrasprAI Team</p>
        </body>
      </html>
    `;

    await mailService.sendEmail(emailTo, emailSubject, emailBody, (error) => {
      if (error) {
        throw new HttpException(
          error?.message ? error.message : 'FAILED TO SEND EMAIL',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    return {
      message: 'OTP has been sent to your email!',
    };
  }

  // =================== POST: Verify Confirmation OTP ======================
  /**
   *
   */
  async verifyConfirmationOTP({ otp, email, password }: VerifyConfirmationOtpDTO): Promise<{
    session: SessionDTO;
    user: IUserDTO;
  }> {
    try {
      if (!otp || !email || !password) {
        throw new HttpException('email, password and otp are required', HttpStatus.NOT_ACCEPTABLE);
      }

      const {
        data: users,
        error: getUserError,
        status: getUserStatus,
      } = await this.supabase
        .from('profiles')
        .select('id, email, confirmation_otp, confirmation_otp_expiry')
        .eq('email', email.toLowerCase());

      if (getUserError) {
        throw new HttpException(getUserError, getUserStatus);
      }

      if (!users.length) {
        throw new HttpException('USER NOT FOUND', HttpStatus.NOT_FOUND);
      }

      const user = users[0];

      const expiryDate = new Date(user.confirmation_otp_expiry).getTime();
      const currentDate = new Date().getTime();

      if (expiryDate < currentDate) {
        throw new HttpException('OTP Expired', HttpStatus.BAD_REQUEST);
      }
      if (otp != user.confirmation_otp) {
        throw new HttpException('Invalid OTP', HttpStatus.BAD_REQUEST);
      }

      const { error: confirmationError } = await this.supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
      if (confirmationError) {
        throw new HttpException(confirmationError.message, confirmationError.status);
      }

      const { error: updateProfileError, status: updateProfileStatus } = await this.supabase
        .from('profiles')
        .update({
          confirmation_otp: null,
          confirmation_otp_expiry: null,
          confirmed: true,
        })
        .eq('id', user.id);
      if (updateProfileError) {
        throw new HttpException(updateProfileError.message, updateProfileStatus);
      }

      // user confirmed, now login and get the session
      const {
        data: { session },
        error: loginError,
      } = await this.supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });
      if (loginError) {
        throw new HttpException(loginError.message, loginError.status);
      }

      // get user profile
      const {
        data: userProfiles,
        error: getUserProfileError,
        status: getUserProfileStatus,
      } = await this.supabase
        .from('profiles')
        .select('id,full_name,email,created_at,updated_at,profile_picture,profile_status,role')
        .eq('id', user.id);
      if (getUserProfileError) {
        throw new HttpException(getUserProfileError, getUserProfileStatus);
      }

      if (!userProfiles.length) {
        throw new HttpException('USER NOT FOUND', HttpStatus.NOT_FOUND);
      }

      const userProfile = userProfiles[0];

      return {
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
        },
        user: userProfile,
      };
    } catch (error) {
      throw new HttpException(error?.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // =================== POST: Reset Password ======================
  /**
   * Requests reset pass and returns otp on email.
   * @param {resetPasswordDTO} resetPasswordDTO - The user's email address.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  async requestResetPassword(resetPasswordDTO: resetPasswordDto): Promise<{ message: string }> {
    const {
      error: userFoundError,
      data: existingUsers,
      status: userFoundStatus,
    } = await this.supabase.from('profiles').select('id,email').eq('email', resetPasswordDTO.email.toLowerCase());

    if (userFoundError) {
      throw new HttpException(userFoundError.message, userFoundStatus);
    }

    if (!existingUsers.length) {
      throw new HttpException('No account with provided email', HttpStatus.NOT_FOUND);
    }
    // User Exists!

    // Generate OTP
    const otpCode = generator.generateOTPCode(6);
    const currentTime = new Date().getTime();
    const expiryTime = new Date(currentTime + 15 * 60000).getTime(); // 15 minutes expiry time

    // If existing OTP exists and has not expired, use it
    const {
      error: existingOtpError,
      data: existingOTPsData,
      status: existingOtpStatus,
    } = await this.supabase
      .from('profiles')
      .select('id,email,password_reset_otp,password_reset_otp_expiry')
      .eq('email', resetPasswordDTO.email.toLowerCase());

    if (existingOtpError) {
      throw new HttpException(existingOtpError.message, existingOtpStatus);
    }

    if (!existingOTPsData.length) {
      throw new HttpException('No OTP found', HttpStatus.NOT_FOUND);
    }

    const existingOtpData = existingOTPsData[0];

    const existingOtp = existingOtpData;
    const existingOtpExpiry = existingOtp?.password_reset_otp_expiry
      ? new Date(existingOtp.password_reset_otp_expiry).getTime()
      : null;
    const isExistingOtpValid = existingOtp && existingOtpExpiry && existingOtpExpiry > currentTime;

    if (isExistingOtpValid) {
      // Use existing OTP
      const otpData = {
        password_reset_otp: existingOtp.password_reset_otp,
        password_reset_otp_expiry: formatter.dateToPostgresTimestampWithTimezone(new Date(expiryTime)),
      };
      const { error: updateOtpError, status: updateOtpStatus } = await this.supabase
        .from('profiles')
        .update(otpData)
        .eq('id', existingOtp.id);

      if (updateOtpError) {
        throw new HttpException(updateOtpError.message, updateOtpStatus);
      }
    } else {
      // Create new OTP
      const otpData = {
        password_reset_otp: otpCode,
        password_reset_otp_expiry: formatter.dateToPostgresTimestampWithTimezone(new Date(expiryTime)),
      };
      const { error: createOtpError, status: createOtpStatus } = await this.supabase
        .from('profiles')
        .update(otpData)
        .eq('id', existingOtp.id);

      if (createOtpError) {
        throw new HttpException(createOtpError.message, createOtpStatus);
      }
    }

    // Email the OTP
    try {
      const emailTo = resetPasswordDTO.email.toLowerCase();
      const emailSubject = 'Graspr AI | OTP for Reset Password';
      const emailBody = `
        <h1>Your code is ${isExistingOtpValid ? existingOtp.password_reset_otp : otpCode}</h1>
        <p>OTP will expire in 15 minutes</p>
        <p>Do not share this code with anyone</p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `;

      mailService.sendEmail(emailTo, emailSubject, emailBody, (error) => {
        if (error) {
          throw new HttpException('Error sending mail', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      });
    } catch (error) {
      console.log('Error sending email:', error);
      throw new HttpException('Error sending OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      message: 'OTP has been sent to your email!',
    };
  }

  // =================== POST: Verify Reset Password ======================
  /**
   * Verify otp and returns success message.
   * @param {resetPasswordDTO} verifyOtpDto - The otp and email.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  async verifyResetPasswordOtp(resetPasswordDTO: verifyOtpDto): Promise<{ message: string }> {
    try {
      const givenOTP = !Number.isNaN(Number(resetPasswordDTO.code)) ? Number(resetPasswordDTO.code) : null;

      const currentTime = new Date().getTime();
      const {
        error: existingOtpError,
        data: existingOtps,
        status: existingOtpStatus,
      } = await this.supabase
        .from('profiles')
        .select('id,email,password_reset_otp,password_reset_otp_expiry')
        .eq('email', resetPasswordDTO.email.toLowerCase());

      if (existingOtpError) {
        throw new HttpException(existingOtpError.message, existingOtpStatus);
      }

      if (!existingOtps.length) {
        throw new HttpException('No OTP found', HttpStatus.NOT_FOUND);
      }

      const existingOtp = existingOtps[0];

      const existingOtpExpiry = existingOtp?.password_reset_otp_expiry
        ? new Date(existingOtp.password_reset_otp_expiry).getTime()
        : null;
      const isExistingOtpValid = existingOtp && existingOtpExpiry && existingOtpExpiry > currentTime;

      if (!isExistingOtpValid) {
        throw new HttpException('OTP expired. Please generate new!', HttpStatus.NOT_FOUND);
      }

      if (Number(existingOtp.password_reset_otp) !== givenOTP) {
        throw new HttpException('Invalid OTP code', HttpStatus.NOT_FOUND);
      }

      return {
        message: 'OTP verified successfully!',
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // =================== POST: Reset New Pass ======================
  /**
   * New Pass and token will send and returns success message.
   * @param {newPassDto} newPass - The otp, password to be set and email.
   * @returns {Promise<{message: string}>} Returns a Promise that resolves to a string.
   */
  async resetPass(newPass: newPassDto): Promise<{ message: string }> {
    try {
      const dataForVerifyOtp = {
        email: newPass.email.toLowerCase(),
        code: newPass.code,
      };

      // Verify OTP
      const { message } = await this.verifyResetPasswordOtp(dataForVerifyOtp);

      if (message !== 'OTP verified successfully!') {
        throw new HttpException(message, HttpStatus.NOT_FOUND);
      }

      // user Id
      const {
        error: userFoundError,
        data: existingUsers,
        status: userFoundStatus,
      } = await this.supabase.from('profiles').select('id,email').eq('email', newPass.email.toLowerCase());

      if (userFoundError) {
        throw new HttpException(userFoundError.message, userFoundStatus);
      }

      if (!existingUsers.length) {
        throw new HttpException('No account with provided email', HttpStatus.NOT_FOUND);
      }

      const existingUser = existingUsers[0]; // User Exists!

      // Reset Password
      const { error: resetPassError } = await this.supabase.auth.admin.updateUserById(existingUser.id, {
        email: newPass.email.toLowerCase(),
        password: newPass.password,
      });

      if (resetPassError) {
        throw new HttpException(resetPassError.message, resetPassError.status);
      }

      // Reset OTP

      const otpData = {
        password_reset_otp: null,
        password_reset_otp_expiry: null,
      };

      const { error: resetOtpError, status: resetOtpStatus } = await this.supabase
        .from('profiles')
        .update(otpData)
        .eq('id', existingUser.id);

      if (resetOtpError) {
        throw new HttpException(resetOtpError.message, resetOtpStatus);
      }

      return {
        message: 'Password reset successfully!',
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async trackProfileCreation(profile: IUserDTO) {
    // Track in Customer.io
    let cusData = {
      "email": profile.email.toLowerCase(),
      "created_at": Math.floor(Date.now() / 1000),
      "full_name": profile.full_name
    }
    await this.customerioService.identifyCustomer(profile.id, cusData);

    // Track in Amplitude
    await this.amplitudeService.trackAccountCreated(profile.id);
  }
}
