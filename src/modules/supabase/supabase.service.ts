import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_SECRET as string,
      {
        auth: {
          flowType: 'pkce', // PKCE flow for secure authentication
        },
        global: {
          headers: {
            'x-application-name': 'graspr-backend',
          },
        },
      },
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }

}

