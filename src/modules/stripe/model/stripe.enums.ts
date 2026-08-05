export enum StripeStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  DELETED = 'deleted',

  FREE = 'free',
  UNPAID = 'unpaid',

  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  USER_HAS_ALREADY_SUBSCRIBED = 'user_has_already_subscribed',
  SUBSCRIPTION_ID_NOT_FOUND = 'subscription_id_not_found',
  DISCOUNT_APPLIED = 'discount_applied',
}
