import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AdminStatsService {
  private supabase: SupabaseClient;

  public constructor(private readonly supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.getClient();
  }

  public async getStats(res: Response) {
    const { count: usersCount } = await this.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .not('email', 'eq', 'yann@graspr.ai')
      .not('email', 'eq', 'beta@graspr.ai')
      .not('email', 'eq', 'test@graspr.ai');

    const { data: activeSubscriptions } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('subscription_status', 'active');

    const subscriptionsStats = {};
    for (const activeSubscription of activeSubscriptions) {
      const priceId = activeSubscription.stripe_price_id;
      if (!subscriptionsStats[priceId]) {
        const { data: prices } = await this.supabase
          .from('subscription_plans_prices')
          .select('*')
          .eq('stripe_price_id', priceId);
          subscriptionsStats[priceId] = {
            name: prices[0]?.subscription_plan_name,
            tenure: prices[0]?.tenure,
            count: 0
          };
      }
      subscriptionsStats[priceId].count++;
    }

    const { data: usageRows } = await this.supabase
      .rpc('get_stats_by_user')
      .not('subscription_plan_name', 'eq', 'gold');

    const pdfPages = usageRows.reduce((sum, row) => {
      return sum + row.pdf_pages;
    }, 0);
    const transcriptionMinutes = usageRows.reduce((sum, row) => {
      return sum + row.transcription_minutes;
    }, 0);
    const aiPrompts = usageRows.reduce((sum, row) => {
      return sum + row.ai_prompts;
    }, 0);
    const pdfCount = usageRows.reduce((sum, row) => {
      return sum + row.pdf_count;
    }, 0);
    const audioCount = usageRows.reduce((sum, row) => {
      return sum + row.audio_count;
    }, 0);
    const videoCount = usageRows.reduce((sum, row) => {
      return sum + row.video_count;
    }, 0);
    const generatedVideoCount = usageRows.reduce((sum, row) => {
      return sum + row.generated_video_count;
    }, 0);
    const videoMinutes = usageRows.reduce((sum, row) => {
      return sum + row.video_minutes;
    }, 0);

    let subscriptionsCountHtml = '';
    for (const subscriptionStatsKey of Object.keys(subscriptionsStats)) {
      subscriptionsCountHtml += `<p>${subscriptionsStats[subscriptionStatsKey].name} / ${subscriptionsStats[subscriptionStatsKey].tenure}: ${subscriptionsStats[subscriptionStatsKey].count}</p>`;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Protected Page</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #333; }
          </style>
      </head>
      <body>
          <h1>Graspr statistics</h1>
          <p><i>(statistics excludes yann@graspr.ai, beta@graspr.ai, test@graspr.ai)</i></p>
          <p>Users in the DB: ${usersCount ?? 0}</p>
          <p>Subscriptions active: ${activeSubscriptions?.length}</p>
          <hr />
          ${subscriptionsCountHtml}
          <hr />
          <b>Next statistics means approximate by a month</b>
          <p>PDF files uploaded: ${pdfCount}</p>
          <p>PDF pages uploaded: ${pdfPages}</p>
          <p>Audio transcribed: ${audioCount}</p>
          <p>Audio transcription minutes: ${transcriptionMinutes}</p>
          <p>Video transcribed: ${videoCount}</p>
          <p>Video transcription minutes: ${videoMinutes}</p>
          <p>Video generated: ${generatedVideoCount}</p>
          <p>AI prompts: ${aiPrompts}</p>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  }
}
