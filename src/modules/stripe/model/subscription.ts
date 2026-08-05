export interface ISubscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
}
