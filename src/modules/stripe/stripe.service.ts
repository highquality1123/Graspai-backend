import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { subscriptionCancelledEmail } from 'src/email-templates/subscription-cancelled';
import { subscriptionPaymentFailedEmail } from 'src/email-templates/subscription-payment-failed';
import { subscriptionPlanDowngradedEmail } from 'src/email-templates/subscription-plan-downgraded';
import { subscriptionRenewalEmail } from 'src/email-templates/subscription-renewal';
import { subscriptionSuccessEmail } from 'src/email-templates/subscription-success';
import formatter from 'src/services/formatter';
import mailService from 'src/services/mail';
import { StripeStatus } from 'src/modules/stripe/model/stripe.enums';
import { ISubscription } from 'src/modules/stripe/model/subscription';
import Stripe from 'stripe';
import { v4 } from 'uuid';
import { subscriptionAutoRenewalEmail } from 'src/email-templates/subscription-auto-renewal';
import { StatsService } from '../stats/stats.service';
import { FREE_SUBSCRIPTION } from '../stats/model/FreeSubscription';
import { AmplitudeService } from '../amplitude/amplitude.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class StripeService {
  private supabase: SupabaseClient;
  private stripe: Stripe;

  public constructor(
    private readonly statsService: StatsService,
    private readonly amplitudeService: AmplitudeService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2023-10-16',
    });
  }

  private logStripeData(label: string, data: any): void {
    console.log(`[Stripe Webhook] ${label}`, JSON.stringify(data, null, 2));
  };

  public async getUserPortalUrl(userId: string) {
    const {
      data: user,
      error,
      status,
    } = await this.supabase.from('profiles').select('*, subscriptions(stripe_customer_id)').eq('id', userId).single();
    if (error) {
      throw new HttpException(error.message, status);
    }
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (user.subscriptions.length == 0 || !user.subscriptions[0].stripe_customer_id) {
      throw new HttpException('User has no subscriptions', HttpStatus.NOT_FOUND);
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.subscriptions[0].stripe_customer_id,
      return_url: process.env.WEBSITE_URL,
    });

    return {
      portalUrl: session.url,
    };
  }

  public async getCustomerSession(userId: string) {
    const {
      data: user,
      error,
      status,
    } = await this.supabase.from('profiles').select('*, subscriptions(stripe_customer_id)').eq('id', userId).single();
    if (error) {
      throw new HttpException(error.message, status);
    }
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (user.subscriptions.length == 0 || !user.subscriptions[0].stripe_customer_id) {
      return {
        clientSecret: '',
      };
    }

    const session = await this.stripe.customerSessions.create({
      customer: user.subscriptions[0].stripe_customer_id,
      components: {
        pricing_table: {
          enabled: true,
        },
      },
    });

    return {
      clientSecret: session.client_secret,
    };
  }

  /**
   * @description Handle Stripe Webhook Event
   * @param {any} payload - stripe payload
   * @param {string} signature - stripe signature
   * @param {string} endpointSecret - stripe webhook secret
   * @returns {Promise<void>}
   */
  public async handleWebhookEvent(payload: any, signature: string): Promise<void> {
    try {
      const timestamp = new Date().getTime();
      console.time(`[Stripe Webhook] [${timestamp}] Stripe Webhook Event Processing Time`);

      if (!signature) {
        console.log('[Stripe Webhook] Missing stripe-signature header');
        throw new BadRequestException('Missing stripe-signature header');
      }

      const event = this.stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);

      this.logStripeData('EVENT', event);

      switch (event.type) {
        case 'checkout.session.completed': {
          await this.createSubscription(event);
          break;
        }
        case 'customer.subscription.deleted': {
          await this.deleteSubscription(event);
          break;
        }
        case 'customer.subscription.updated': {
          await this.updateSubscription(event);
          break;
        }
        default: {
          console.log('[Stripe Webhook] Web Hook / Unhandled Event', event.type);
        }
      }

      console.timeEnd(`[Stripe Webhook] [${timestamp}] Stripe Webhook Event Processing Time`);
    } catch (err) {
      console.log('[Stripe Webhook] Error', err);
      throw new HttpException(err?.message ?? 'Internal Server Error', err?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async updateSubscription(event: Stripe.CustomerSubscriptionUpdatedEvent) {
    console.log('[Stripe Webhook] Subscription Renewed Event');

    const checkoutSession = event.data.object;
    const previousAttributes = event.data.previous_attributes;

    const cancelSubscriptionEvent =
      previousAttributes.cancel_at_period_end === false && checkoutSession.cancel_at_period_end === true;
    const renewSubscriptionEvent =
      previousAttributes.cancel_at_period_end === true && checkoutSession.cancel_at_period_end === false;
    const autoBillSubscriptionEvent =
      previousAttributes.current_period_end &&
      previousAttributes.current_period_end < checkoutSession.current_period_end &&
      checkoutSession.status === StripeStatus.ACTIVE;
    const deactivateSubscriptionEvent =
      previousAttributes.status === StripeStatus.ACTIVE && checkoutSession.status === StripeStatus.PAST_DUE;
    const activateSubscriptionEvent =
      previousAttributes.status === StripeStatus.PAST_DUE && checkoutSession.status === StripeStatus.ACTIVE;

    const subscription = await this.stripe.subscriptions.retrieve(checkoutSession.id, {
      expand: ['items.data.price.product'],
    });

    // Log detailed subscription data for debugging
    this.logStripeData('SUBSCRIPTION DETAILS', subscription);

    const stripeCustomerId = subscription.customer as string;

    const {
      error: fetchSubscriptionError,
      status: fetchSubscriptionStatus,
      data: subscriptions,
    } = await this.supabase
      .from('subscriptions')
      .select(
        `
              id,
              user_id,
              stripe_customer_id,
              stripe_subscription_id,
              subscription_status,
              created_at,
              updated_at,
              profiles (
                id,
                email,
                full_name,
                confirmed
              )
              `,
      )
      .eq('stripe_customer_id', stripeCustomerId);

    if (fetchSubscriptionError) {
      console.log('[Stripe Webhook] Error fetching subscription', fetchSubscriptionError);
      throw new HttpException(
        fetchSubscriptionError?.message ?? 'Internal Server Error',
        fetchSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const subscriptionFromDB = Array.isArray(subscriptions) ? subscriptions[0] : subscriptions;
    const user = Array.isArray(subscriptionFromDB?.profiles)
      ? subscriptionFromDB?.profiles[0]
      : subscriptionFromDB?.profiles;

    if (!subscriptionFromDB || !user) {
      console.log('[Stripe Webhook] Subscription Update Event | Subscription not found', {
        subscription,
        subscriptionFromDB,
        user,
      });
      throw new HttpException('Subscription not found', HttpStatus.NOT_FOUND);
    }

    if (cancelSubscriptionEvent) {
      console.log('[Stripe Webhook] Subscription Updated / Subscription Canceled Event');

      const { error: updateSubscriptionError, status: updateSubscriptionStatus } = await this.supabase
        .from('subscriptions')
        .update({
          subscription_status: StripeStatus.CANCELED,
          updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
        })
        .eq('id', subscriptionFromDB.id);

      if (updateSubscriptionError) {
        console.log('[Stripe Webhook] Error updating subscription', updateSubscriptionError);
        throw new HttpException(
          updateSubscriptionError?.message ?? 'Internal Server Error',
          updateSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.sendEmail(user.full_name, user.email, 'subscription-cancelled');
    } else if (autoBillSubscriptionEvent) {
      console.log('[Stripe Webhook] Subscription Auto Renewed Event');
      await this.trackSubscriptionRenewalRevenue(user.id, subscription);
      await this.sendEmail(user.full_name, user.email, 'plan-auto-renewal');
    } else if (deactivateSubscriptionEvent) {
      console.log('[Stripe Webhook] Subscription Updated / Subscription Deactivate Event');

      const { error: updateSubscriptionError, status: updateSubscriptionStatus } = await this.supabase
        .from('subscriptions')
        .update({
          subscription_status: StripeStatus.UNPAID,
          updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
        })
        .eq('id', subscriptionFromDB.id);

      this.statsService.registerSubscriptionPlanChange(user.id, FREE_SUBSCRIPTION);

      if (updateSubscriptionError) {
        console.log('[Stripe Webhook] Error updating subscription', updateSubscriptionError);
        throw new HttpException(
          updateSubscriptionError?.message ?? 'Internal Server Error',
          updateSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.sendEmail(user.full_name, user.email, 'payment-failed');
    } else if (activateSubscriptionEvent) {
      console.log('[Stripe Webhook] Subscription Updated / Subscription Activate Event');

      const { error: updateSubscriptionError, status: updateSubscriptionStatus } = await this.supabase
        .from('subscriptions')
        .update({
          subscription_status: StripeStatus.ACTIVE,
          updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
        })
        .eq('id', subscriptionFromDB.id);

      const paidPlanInfo = await this.getPaidPlanInfoByStripeSubscriptionId(
        subscriptionFromDB.stripe_subscription_id as string,
      );
      const paidPlanName = paidPlanInfo.name;
      this.statsService.registerSubscriptionPlanChange(
        user.id,
        paidPlanName,
        new Date().getTime(),
        Number(checkoutSession.current_period_end) * 1000, // in milliseconds
      );

      if (updateSubscriptionError) {
        console.log('[Stripe Webhook] Error updating subscription', updateSubscriptionError);
        throw new HttpException(
          updateSubscriptionError?.message ?? 'Internal Server Error',
          updateSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.trackSubscriptionRenewalRevenue(user.id, subscription);
      await this.sendEmail(user.full_name, user.email, 'plan-renewal');
    } else if (renewSubscriptionEvent) {
      console.log('[Stripe Webhook] Subscription Renewed Event');

      const { error: updateSubscriptionError, status: updateSubscriptionStatus } = await this.supabase
        .from('subscriptions')
        .update({
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription?.items?.data[0]?.price?.id,
          subscription_status: StripeStatus.ACTIVE,
          updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
        })
        .eq('id', subscriptionFromDB.id);

      if (updateSubscriptionError) {
        console.log('[Stripe Webhook] Error updating subscription', updateSubscriptionError);
        throw new HttpException(
          updateSubscriptionError?.message ?? 'Internal Server Error',
          updateSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      await this.sendEmail(user.full_name, user.email, 'plan-renewal');
    } else {
      console.log('[Stripe Webhook] Subscription Updated Event | Unhandled Event');
    }
  }

  private async createSubscription(event: Stripe.CheckoutSessionCompletedEvent) {
    console.log('[Stripe Webhook] Web Hook / Payment Successful Event', JSON.stringify(event));

    const checkoutSession = event.data.object;
    const userId = checkoutSession.client_reference_id ?? checkoutSession.metadata.client_reference_id;
    const {
      error: fetchUserError,
      status: fetchUserStatus,
      data: user,
    } = await this.supabase
      .from('profiles')
      .select(`id,email,full_name,confirmed,subscriptions(*)`)
      .eq('id', userId)
      .limit(1)
      .single();

    if (fetchUserError || !user) {
      console.log('[Stripe Webhook] Error fetching user', fetchUserError);
      throw new HttpException(
        fetchUserError?.message ?? 'Internal Server Error',
        fetchUserStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    console.log('[Stripe Webhook] Web Hook / Payment Successful / User ', {
      name: user.full_name,
      email: user.email,
    });

    const paidPlanInfo = await this.getPaidPlanInfoByStripeSubscriptionId(checkoutSession.subscription as string);
    const paidPlanName = paidPlanInfo.name;

    let subscriptionId = v4();
    if (user.subscriptions && user.subscriptions.length > 0) {
      subscriptionId = user.subscriptions[0].id;
    }

    const newSubscription: ISubscription = {
      id: subscriptionId,
      user_id: user.id,
      stripe_customer_id: checkoutSession.customer as string,
      stripe_subscription_id: checkoutSession.subscription as string,
      stripe_price_id: paidPlanInfo.price_id,
      subscription_status: paidPlanName ? StripeStatus.ACTIVE : StripeStatus.FREE,
      created_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
      updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
    };

    console.log('[Stripe Webhook] Web Hook / Payment Successful / New Subscription', newSubscription);

    const { error: insertSubscriptionError, status: insertSubscriptionStatus } = await this.supabase
      .from('subscriptions')
      .upsert([newSubscription]);

    // If there is an error while inserting the subscription, throw an error.
    if (insertSubscriptionError) {
      console.log('[Stripe Webhook] Error inserting subscription', insertSubscriptionError);
      throw new HttpException(
        insertSubscriptionError?.message ?? 'Internal Server Error',
        insertSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.statsService.registerSubscriptionPlanChange(user.id, paidPlanName ?? FREE_SUBSCRIPTION);

    await this.sendEmail(user.full_name, user.email, 'subscription-success');
    if (paidPlanName) {
      await this.trackSubscriptionCreatedAnalytics(user.id, newSubscription.id, paidPlanName, paidPlanInfo.price_id);
    }
    console.log(
      '[Stripe Webhook] Web Hook / Payment Successful / Subscription Inserted | User Subscribed to Paid Plan',
    );
  }

  private async getPaidPlanInfoByStripeSubscriptionId(stripeSubscriptionId: string) {
    const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['items.data.price.product'],
    });
    console.log('[Stripe] Get Subscription', stripeSubscriptionId, subscription);
    const productId = subscription.items.data[0].plan.product as string;
    console.log('[Stripe] Get Product ID', productId);
    const product = await this.stripe.products.retrieve(productId);
    console.log('[Stripe] Get Product', product);

    const {
      error: fetchPlansError,
      status: fetchPlansStatus,
      data: paidSubscriptionPlans,
    } = await this.supabase.from('subscription_plans').select('*').neq('name', 'free');

    if (fetchPlansError) {
      console.log('Error fetching subscription plans', fetchPlansError);
      throw new HttpException(
        fetchPlansError?.message ?? 'Internal Server Error',
        fetchPlansStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const paidPlan = paidSubscriptionPlans.find((plan) => {
      return plan.name.toLowerCase() === `${product.name}`.toLowerCase();
    });
    console.log('[Stripe] Get Paid Plan Row', paidPlan);

    return {
      name: paidPlan?.name,
      price_id: subscription?.items?.data[0]?.price?.id as string,
    };
  }

  private async deleteSubscription(event: Stripe.CustomerSubscriptionDeletedEvent) {
    console.log('[Stripe Webhook] Delete Subscription Event');

    const checkout_session = event.data.object;
    console.log('[Stripe Webhook] Web Hook / Delete Subscription Event / Checkout Session ', checkout_session);
    const {
      error: fetchUserError,
      status: fetchUserStatus,
      data: subscriptions,
    } = await this.supabase
      .from('subscriptions')
      .select(
        `
        id,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        user_id,
        profiles (
          id,
          email,
          full_name,
          confirmed
        )
        `,
      )
      .eq('stripe_subscription_id', checkout_session.id);

    if (fetchUserError) {
      console.log('[Stripe Webhook] Error fetching user', fetchUserError);
      throw new HttpException(
        fetchUserError?.message ?? 'Internal Server Error',
        fetchUserStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const subscription = Array.isArray(subscriptions) ? subscriptions[0] : subscriptions;
    const user = Array.isArray(subscription?.profiles) ? subscription?.profiles[0] : subscription?.profiles;

    if (!subscription || !user) {
      console.log('[Stripe Webhook] Delete Subscription Event | Subscription not found', {
        checkout_session,
        subscription,
        user,
      });
      throw new HttpException('Subscription not found', HttpStatus.NOT_FOUND);
    }

    const { error: updateSubscriptionError, status: updateSubscriptionStatus } = await this.supabase
      .from('subscriptions')
      .update({
        subscription_status: StripeStatus.DELETED,
        updated_at: formatter.dateToPostgresTimestampWithTimezone(new Date()),
      })
      .eq('id', subscription.id);

    if (updateSubscriptionError) {
      console.log('[Stripe Webhook] Error updating subscription', updateSubscriptionError);
      throw new HttpException(
        updateSubscriptionError?.message ?? 'Internal Server Error',
        updateSubscriptionStatus ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.statsService.registerSubscriptionPlanChange(user.id, FREE_SUBSCRIPTION);

    await this.trackSubscriptionCanceledAnalytics(user.id, checkout_session);
    await this.sendEmail(user.full_name, user.email, 'plan-downgraded');

    console.log(
      `[Stripe Webhook] Web Hook / Delete Subscription Event | User '${user.id}' Unsubscribed from Paid Plan`,
    );
  }

  /**
   * @description Send Email
   * @param {string} name - user name
   * @param {string} email - user email
   * @param {string} type - subscription-success | subscription-cancelled | plan-renewal | payment-failed
   * @returns {Promise<boolean>}
   */
  private async sendEmail(
    name: string,
    email: string,
    type:
      | 'subscription-success'
      | 'subscription-cancelled'
      | 'plan-renewal'
      | 'plan-auto-renewal'
      | 'plan-downgraded'
      | 'payment-failed',
  ): Promise<boolean> {
    switch (type) {
      case 'subscription-success': {
        await mailService.sendEmail(...subscriptionSuccessEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      case 'subscription-cancelled': {
        await mailService.sendEmail(...subscriptionCancelledEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      case 'plan-renewal': {
        await mailService.sendEmail(...subscriptionRenewalEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      case 'plan-auto-renewal': {
        await mailService.sendEmail(...subscriptionAutoRenewalEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      case 'payment-failed': {
        await mailService.sendEmail(...subscriptionPaymentFailedEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      case 'plan-downgraded': {
        await mailService.sendEmail(...subscriptionPlanDowngradedEmail(name, email), (error) => {
          if (error) {
            throw new HttpException(
              error?.message ? error.message : 'FAILED TO SEND EMAIL',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        });
        break;
      }
      default: {
        throw new BadRequestException('Invalid email type');
      }
    }

    return true;
  }

  // -----------------------------------------------
  //
  //    Stripe Fetch Customer Business Logic
  //
  // -----------------------------------------------
  /**
   * @description This method retrieves a Stripe customer by their email address.
   * It searches for customers with the specified email and returns the first matching customer if found.
   *
   * @param {Object} options - An object containing the email address to search for.
   * @param {string} options.email - The email address of the customer to retrieve.
   *
   * @returns {Promise<Stripe.Customer | null>} - Returns a Promise that resolves to the Stripe customer object if found,
   * or null if no customer with the given email exists.
   *
   * @example
   * const customer = await getCustomerByEmail({ email: 'customer@example.com' });
   */
  async getCustomerByEmail({ email }: { email: string }): Promise<Stripe.Customer | null> {
    const customers = await this.stripe.customers.search({ query: `email~"${email}"` });
    return customers.data.length > 0 ? customers.data.sort((cus1, cus2) => cus2.created - cus1.created)[0] : null;
  }

  // -----------------------------------------------
  //
  //    Stripe Checkout Session Business Logic
  //
  // -----------------------------------------------
  /**
   * @description This method creates a Stripe checkout session for a subscription based on the provided email and price ID.
   * It first checks if a customer with the specified email exists; if not, it creates a new customer.
   * Then, it generates a checkout session for the subscription, linking it to the customer.
   *
   * @param {Object} options - An object containing the necessary parameters for creating the checkout session.
   * @param {string} options.email - The email address of the customer.
   * @param {string} options.priceId - The price ID of the subscription product.
   *
   * @returns {Promise<Object>} - Returns a Promise that resolves to an object containing the redirect URL for the checkout session.
   *
   * @throws {HttpException} - Throws an exception if any errors occur during customer retrieval, creation, or session creation.
   *
   * @example
   * const { redirectUrl } = await getCheckoutSession({ email: 'customer@example.com', priceId: 'price_123' });
   */
  public async getCheckoutSession({
    userId,
    email,
    priceId,
  }: {
    userId: string;
    email: string;
    priceId: string;
  }): Promise<{ redirectUrl: string }> {
    try {
      let stripe_customer = await this.getCustomerByEmail({ email });

      // If the customer does not exist, create a new one
      if (!stripe_customer) {
        stripe_customer = await this.stripe.customers.create({ email });
      }

      // Create a checkout session for the subscription
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: stripe_customer.id, // Attach the customer to the session
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.WEBSITE_URL}/?success=true`,
        cancel_url: `${process.env.WEBSITE_URL}/`,
        metadata: {
          client_reference_id: userId,
        },
      });

      return {
        redirectUrl: session.url,
      };
    } catch (error) {
      console.error(error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  public async getPricingPlans(): Promise<any> {
    try {
      const { error, status, data } = await this.supabase
        .from('subscription_plans')
        .select(`*, prices:subscription_plans_prices(*)`)
        .order('index', {
          ascending: true,
        });
      if (error) {
        console.log('Error getting subscription plans ', error);
        throw new HttpException(error?.message ?? 'Internal Server Error', status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return data;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async trackSubscriptionCreatedAnalytics(
    userId: string,
    subscriptionId: string,
    subscriptionName: string,
    priceId: string
  ): Promise<void> {
    try {
      // Get subscription price from Stripe
      const stripePrice = await this.stripe.prices.retrieve(priceId);
      const subscriptionPrice = stripePrice.unit_amount ? stripePrice.unit_amount / 100 : 0; // Convert from cents
      const subscriptionPlan = stripePrice.recurring?.interval === 'year' ? 'yearly' : 'monthly';

      await this.amplitudeService.trackSubscriptionCreated({
        userId: userId,
        subscriptionId: subscriptionId,
        subscriptionName: subscriptionName,
        subscriptionPrice: subscriptionPrice,
        subscriptionPlan: subscriptionPlan
      });

      // Track Revenue for subscription start
      await this.amplitudeService.trackRevenue({
        userId: userId,
        revenue: subscriptionPrice,
        productId: priceId,
        price: subscriptionPrice,
      });
    } catch (amplitudeError) {
      console.error('[Stripe Webhook] Error tracking subscription in Amplitude:', amplitudeError);
      // Don't throw error - subscription creation should not fail due to analytics
    }
  }

  private async trackSubscriptionRenewalRevenue(userId: string, subscription: Stripe.Subscription): Promise<void> {
    try {
      const stripePriceId = subscription?.items?.data[0]?.price?.id;
      if (stripePriceId) {
        const stripePrice = await this.stripe.prices.retrieve(stripePriceId);
        const renewalPrice = stripePrice.unit_amount ? stripePrice.unit_amount / 100 : 0; // Convert from cents

        // Track Revenue for subscription renewal
        await this.amplitudeService.trackRevenue({
          userId: userId,
          revenue: renewalPrice,
          productId: stripePriceId,
          price: renewalPrice,
        });

        await this.amplitudeService.trackSubscriptionRenewed({
          userId: userId,
          subscriptionId: subscription.id,
          stripeCustomerId: subscription.customer as string,
          stripeProductId: typeof subscription.items.data[0]?.price.product === 'string'
            ? subscription.items.data[0]?.price.product
            : subscription.items.data[0]?.price.product?.id,
          stripePlanId: subscription.items.data[0]?.plan.id,
          stripePlanAmount: subscription.items.data[0]?.plan.amount / 100,
          stripePlanCurrency: subscription.items.data[0]?.plan.currency,
          stripePlanInterval: subscription.items.data[0]?.plan.interval,
        });
      }
    } catch (amplitudeError) {
      console.error('[Stripe Webhook] Error tracking renewal revenue in Amplitude:', amplitudeError);
      // Don't throw error - subscription renewal should not fail due to analytics
    }
  }

  private async trackSubscriptionCanceledAnalytics(userId: string, subscription: Stripe.Subscription): Promise<void> {
    try {
      await this.amplitudeService.trackSubscriptionCanceled({
        userId: userId,
        subscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        stripeProductId: typeof subscription.items.data[0]?.price.product === 'string'
          ? subscription.items.data[0]?.price.product
          : subscription.items.data[0]?.price.product?.id,
        stripePlanId: subscription.items.data[0]?.plan.id,
        stripePlanAmount: subscription.items.data[0]?.plan.amount / 100,
        stripePlanCurrency: subscription.items.data[0]?.plan.currency,
        stripePlanInterval: subscription.items.data[0]?.plan.interval,
        cancelReason: subscription.cancellation_details?.reason,
        cancelComment: subscription.cancellation_details?.comment,
        cancelFeedback: subscription.cancellation_details?.feedback,
      });
    } catch (amplitudeError) {
      console.error('[Stripe Webhook] Error tracking subscription cancellation in Amplitude:', amplitudeError);
      // Don't throw error - subscription cancellation should not fail due to analytics
    }
  }
}
