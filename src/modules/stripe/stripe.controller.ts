import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Request,
} from '@nestjs/common';
import { Request as RequestExpress } from 'express';
import { StripeService } from './stripe.service';
import { SessionService } from '../session/session.service';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/public.decorator';

// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('stripe')
@ApiTags('Stripe')
export class StripeController {
  public constructor(
    private readonly stripeService: StripeService,
    private readonly sessionService: SessionService,
  ) {}

  @Get('/portalUrl')
  public async getStripePortal(@Req() req: RequestExpress) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      return await this.stripeService.getUserPortalUrl(user.id);
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/customerSession')
  public async getCustomerSession(@Req() req: RequestExpress) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      return await this.stripeService.getCustomerSession(user.id);
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // -----------------------------------------------
  //
  //    Stripe Checkout Session Endpoint
  //
  // -----------------------------------------------
  @ApiOperation({ summary: 'Get Checkout Session' })
  @ApiQuery({
    name: 'priceId',
    type: 'string',
    required: true,
    description: 'The price ID of the product',
  })
  @Get('/checkoutSession')
  public async getCheckoutSession(@Query('priceId') priceId: string, @Req() req: RequestExpress) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      return await this.stripeService.getCheckoutSession({
        userId: user.id,
        email: user.email,
        priceId,
      });
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/webhook')
  public async stripeWebHookHandler(
    @Request() request: RawBodyRequest<Request>,
    @Headers('Stripe-Signature') signature: string,
  ) {
    try {
      await this.stripeService.handleWebhookEvent(request.rawBody, signature);
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/plans')
  public async getPricingPlans() {
    try {
      return await this.stripeService.getPricingPlans();
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
