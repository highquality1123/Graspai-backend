import { Injectable, Logger } from '@nestjs/common';
import * as amplitude from '@amplitude/analytics-node';

export const AMPLITUDE_EVENTS = {
  ACCOUNT_CREATED: 'Account Created',
  SUBSCRIPTION_CREATED: 'Subscription Created',
  SUBSCRIPTION_RENEWED: 'Subscription Renewed',
  SUBSCRIPTION_CANCELED: 'Subscription Canceled',
  REVENUE: 'Revenue',
} as const;


export interface AmplitudeEvent {
  eventType: string;
  userId: string;
  eventProperties?: Record<string, any>;
  userProperties?: Record<string, any>;
}

@Injectable()
export class AmplitudeService {
  private readonly logger = new Logger(AmplitudeService.name);
  private amplitude: any;
  private apiKey = process.env.AMPLITUDE_API_KEY;
  private isEnabled = process.env.AMPLITUDE_ENABLED === 'true';

  constructor() {
    if (!this.apiKey) {
      this.logger.warn('AMPLITUDE_API_KEY not found. Analytics will be disabled.');
      return;
    }

    if (!this.isEnabled) {
      this.logger.warn('AMPLITUDE_ENABLED is not set to true. Analytics will be disabled.');
      return;
    }

    amplitude.init(this.apiKey, {
      serverZone: 'US'
    });

    this.amplitude = amplitude;
    this.logger.log('Amplitude analytics initialized');
  }

  async track(event: AmplitudeEvent): Promise<void> {
    if (!this.amplitude || !this.isEnabled) {
      this.logger.debug('Amplitude not enabled or initialized, skipping event:', event.eventType);
      return;
    }

    try {
      // identify
      if (event.userProperties && Object.keys(event.userProperties).length > 0) {
        const identifyObj = new amplitude.Identify();
        Object.entries(event.userProperties).forEach(([key, value]) => {
          identifyObj.set(key, value);
        });
        this.amplitude.identify(identifyObj, {
          user_id: event.userId,
        });
      }

      // track
      this.amplitude.track(event.eventType, event.eventProperties, {
        user_id: event.userId,
        session_id: -1, // avoid server sessionization
      });

    } catch (error) {
      this.logger.error('Failed to track Amplitude event:', error);
    }
  }

  async trackAccountCreated(userId: string): Promise<void> {
    await this.track({
      eventType: AMPLITUDE_EVENTS.ACCOUNT_CREATED,
      userId,
      eventProperties: {
        'user id': userId,
      },
    });
  }

  async trackSubscriptionCreated(params: {
    userId: string;
    subscriptionId: string;
    subscriptionName: string;
    subscriptionPrice: number;
    subscriptionPlan: 'monthly' | 'yearly';
  }): Promise<void> {
    const { userId, subscriptionId, subscriptionName, subscriptionPrice, subscriptionPlan } = params;

    await this.track({
      eventType: AMPLITUDE_EVENTS.SUBSCRIPTION_CREATED,
      userId,
      eventProperties: {
        'subscription id': subscriptionId,
        'subscription name': subscriptionName,
        'subscription price': subscriptionPrice,
        'subscription plan': subscriptionPlan,
      },
      userProperties: {
        'subscriber status': 'paid',
        'subscription id': subscriptionId,
        'subscriber plan': subscriptionPlan,
      },
    });
  }

  async trackSubscriptionRenewed(params: {
    userId: string;
    subscriptionId: string;
    stripeCustomerId: string;
    stripeProductId?: string;
    stripePlanId?: string;
    stripePlanAmount?: number;
    stripePlanCurrency?: string;
    stripePlanInterval?: string;
  }): Promise<void> {
    const { 
      userId, 
      subscriptionId, 
      stripeCustomerId,
      stripeProductId,
      stripePlanId,
      stripePlanAmount,
      stripePlanCurrency,
      stripePlanInterval
    } = params;

    await this.track({
      eventType: AMPLITUDE_EVENTS.SUBSCRIPTION_RENEWED,
      userId,
      eventProperties: {
        'stripe subscription id': subscriptionId,
        'stripe customer id': stripeCustomerId,
        'stripe product id': stripeProductId,
        'stripe plan id': stripePlanId,
        'stripe plan amount': stripePlanAmount,
        'stripe plan currency': stripePlanCurrency,
        'stripe plan interval': stripePlanInterval
      },
      userProperties: {
        'subscription id': subscriptionId,
        'user id': userId,
        'subscriber status': 'paid',
      },
    });
  }

  async trackSubscriptionCanceled(params: {
    userId: string;
    subscriptionId: string;
    stripeCustomerId: string;
    cancelReason?: string;
    cancelComment?: string;
    cancelFeedback?: string;
    stripeProductId?: string;
    stripePlanId?: string;
    stripePlanAmount?: number;
    stripePlanCurrency?: string;
    stripePlanInterval?: string;
  }): Promise<void> {
    const {
      userId,
      subscriptionId,
      stripeCustomerId,
      cancelReason,
      cancelComment,
      cancelFeedback,
      stripeProductId,
      stripePlanId,
      stripePlanAmount,
      stripePlanCurrency,
      stripePlanInterval
    } = params;

    await this.track({
      eventType: AMPLITUDE_EVENTS.SUBSCRIPTION_CANCELED,
      userId,
      eventProperties: {
        'stripe subscription id': subscriptionId,
        'stripe customer id': stripeCustomerId,
        'stripe product id': stripeProductId,
        'stripe plan id': stripePlanId,
        'stripe plan amount': stripePlanAmount,
        'stripe plan currency': stripePlanCurrency,
        'stripe plan interval': stripePlanInterval,
        'stripe cancel reason': cancelReason,
        'stripe cancel comment': cancelComment,
        'stripe cancel feedback': cancelFeedback,
      },
      userProperties: {
        'user id': userId,
        'subscriber status': 'canceled',
        'subscription id': subscriptionId,
        'stripe cancel reason': cancelReason,
        'stripe cancel comment': cancelComment,
        'stripe cancel feedback': cancelFeedback,
      },
    });
  }

  async trackRevenue(params: {
    userId: string;
    revenue: number;
    productId: string;
    price: number;
  }): Promise<void> {
    const { userId, revenue, productId, price } = params;

    await this.track({
      eventType: AMPLITUDE_EVENTS.REVENUE,
      userId,
      eventProperties: {
        'revenue': revenue,
        'product id': productId,
        'price': price,
      },
    });
  }

}
