import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { IUserDTO } from 'src/modules/auth/model/login.dto';
import { StripeStatus } from 'src/modules/stripe/model/stripe.enums';
import { SupabaseService } from 'src/modules/supabase/supabase.service';

@Injectable()
export class SessionService {
  private supabase: SupabaseClient;

  constructor(private readonly supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.getClient();
  }

  async getUserSession(req: Request) {
    const access_token = req.headers['access'] as string;
    const refresh_token = req.headers['refresh'] as string;

    if (!access_token || !refresh_token) {
      return { user: null, session: null };
    }

    // Validate JWT using auth.getUser (recommended for server-side)
    const { data: { user }, error } = await this.supabase.auth.getUser(access_token);

    if (error || !user) {
      console.log('session error', error);
      return { user: null, session: null };
    }

    // Parallel queries for better performance
    const [profileResult, planStatsResult] = await Promise.all([
      this.supabase
        .from('profiles')
        .select('*, subscriptions(*)')
        .eq('id', user.id),
      
      this.supabase
        .from('user_subscription_statistics')
        .select('*, subscription_plans(*)')
        .eq('user_id', user.id)
        .order('date_from', { ascending: false })
        .limit(1),
    ]);

    if (profileResult.error) {
      console.log('profile Error', profileResult.error);
      return { user: null, session: null };
    }

    const profile = profileResult.data[0] as IUserDTO;
    if (
      profile &&
      profile.subscriptions &&
      profile.subscriptions.length &&
      profile.subscriptions[0].subscription_status === StripeStatus.DELETED
    ) {
      profile.subscriptions.splice(0, 1);
    }

    if (!planStatsResult.error && planStatsResult.data) {
      profile.stats = planStatsResult.data;
    }

    return {
      user: {
        ...user,
        profile,
      },
      session: {
        access_token,
        refresh_token,
      },
    };
  }
}

