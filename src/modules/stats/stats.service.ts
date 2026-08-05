import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { FREE_SUBSCRIPTION } from './model/FreeSubscription';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class StatsService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly supabaseService: SupabaseService
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async registerSubscriptionPlanChange(
    userId: string,
    planName: string,
    timestampFrom?: number,
    timestampTo?: number,
  ) {
    if (!timestampFrom) {
      const dateFrom = new Date();
      const dateTo = new Date(new Date(dateFrom).setMonth(dateFrom.getMonth() + 1));
      timestampFrom = dateFrom.getTime();
      timestampTo = dateTo.getTime();
    }
    const {
      error,
      status,
      data: planStats,
    } = await this.supabase
      .from('user_subscription_statistics')
      .insert({
        user_id: userId,
        subscription_plan_name: planName,
        date_from: new Date(Number(timestampFrom)),
        date_to: new Date(Number(timestampTo)),
      })
      .select('*, subscription_plans(*)')
      .limit(1)
      .single();
    if (error) {
      throw new HttpException(error.message, status);
    }
    return planStats;
  }

  private async getSuscriptionPlanStats(userId: string) {
    let {
      error,
      status,
      data: planStats,
    } = await this.supabase
      .from('user_subscription_statistics')
      .select('*, subscription_plans(*)')
      .eq('user_id', userId)
      .order('date_from', { ascending: false })
      .limit(1);
    if (error) {
      throw new HttpException(error.message, status);
    }
    if (planStats.length == 0 || new Date(planStats[0].date_to).getTime() < new Date().getTime()) {
      return this.registerSubscriptionPlanChange(
        userId,
        planStats.length == 0 ? FREE_SUBSCRIPTION : planStats[0].subscription_plan_name,
      );
    } else {
      return planStats[0];
    }
  }

  private async updateUsageStatistics(row: any) {
    const planStats = await this.getSuscriptionPlanStats(row.user_id);

    const newPdfPagesCount = planStats.pdf_pages + row.pdf_pages;
    const newTranscriptionMinutesCount = planStats.transcription_minutes + row.transcription_minutes;
    const newAiPromptsCount = planStats.ai_prompts + row.ai_prompts;
    const newVideoMinutesCount = planStats.video_minutes + row.video_minutes;

    const newPdfCount = planStats.pdf_count + row.pdf_count;
    const newAudioCount = planStats.audio_count + row.audio_count;
    const newVideoCount = planStats.video_count + row.video_count;
    const newGeneratedVideoCount = planStats.generated_video_count + row.generated_video_count;

    const maxPdfPagesCount = planStats?.subscription_plans?.pdf_pages ?? 0;
    const maxTranscriptionMinutesCount = planStats?.subscription_plans?.transcription_minutes ?? 0;
    const maxAiPromptsCount = planStats?.subscription_plans?.ai_prompts ?? 0;
    const maxVideoMinutesCount = planStats?.subscription_plans?.video_minutes ?? 0;

    const maxPdfCount = planStats?.subscription_plans?.pdf_count ?? 0;
    const maxAudioCount = planStats?.subscription_plans?.audio_count ?? 0;
    const maxVideoCount = planStats?.subscription_plans?.video_count ?? 0;
    const maxGeneratedVideoCount = planStats?.subscription_plans?.generated_video_count ?? 0;

    if (
      newPdfPagesCount > maxPdfPagesCount ||
      newTranscriptionMinutesCount > maxTranscriptionMinutesCount ||
      newAiPromptsCount > maxAiPromptsCount ||
      newVideoMinutesCount > maxVideoMinutesCount ||
      newPdfCount > maxPdfCount ||
      newAudioCount > maxAudioCount ||
      newVideoCount > maxVideoCount ||
      newGeneratedVideoCount > maxGeneratedVideoCount
    ) {
      throw new HttpException('Subscription plan limits exceeded', HttpStatus.PAYMENT_REQUIRED);
    }

    const userSubscriptionStatsUpdateResponse = await this.supabase
      .from('user_subscription_statistics')
      .update({
        pdf_pages: newPdfPagesCount,
        transcription_minutes: newTranscriptionMinutesCount,
        ai_prompts: newAiPromptsCount,
        video_minutes: newVideoMinutesCount,
        pdf_count: newPdfCount,
        audio_count: newAudioCount,
        video_count: newVideoCount,
        generated_video_count: newGeneratedVideoCount,
        updated_at: new Date(),
      })
      .eq('id', planStats.id);

    if (userSubscriptionStatsUpdateResponse.error) {
      throw new HttpException(
        userSubscriptionStatsUpdateResponse.error.message,
        userSubscriptionStatsUpdateResponse.status,
      );
    }
  }

  public async registerPdfPagesUsage(userId: string, pdfPagesCount: number) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: pdfPagesCount,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerTranscriptionMinutesUsage(userId: string, transcriptionMinutesCount: number) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: transcriptionMinutesCount,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerAiPromptsUsage(userId: string, aiPromptsCount: number) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: aiPromptsCount,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerVideoMinutesUsage(userId: string, videoMinutesCount: number) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: videoMinutesCount,
      pdf_count: 0,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerPdfUsage(userId: string) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 1,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerAudioUsage(userId: string) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 1,
      video_count: 0,
      generated_video_count: 0,
    });
  }

  public async registerVideoUsage(userId: string) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 0,
      video_count: 1,
      generated_video_count: 0,
    });
  }

  public async registerGeneratedVideoUsage(userId: string) {
    await this.updateUsageStatistics({
      user_id: userId,
      pdf_pages: 0,
      transcription_minutes: 0,
      ai_prompts: 0,
      video_minutes: 0,
      pdf_count: 0,
      audio_count: 0,
      video_count: 0,
      generated_video_count: 1,
    });
  }
}
