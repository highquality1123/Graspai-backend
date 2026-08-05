export interface IUserDTO {
  id: string;
  full_name: string;
  email: string;

  profile_picture: string;
  profile_status: 'incomplete' | 'complete';
  role: 'user' | 'admin';

  subscriptions?: any;
  stats?: any;
  confirmed?: boolean;
  sso_enabled?: boolean;
  created_at: string;
  updated_at: string;
}
