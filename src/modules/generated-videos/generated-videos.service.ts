import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateGeneratedVideoDto } from './model/CreateGeneratedVideo.dto';
import { UpdateGeneratedVideoDto } from './model/UpdateGeneratedVideo.dto';
import { DocumentsService } from '../documents/documents.service';
import { LanguageEnum } from '../documents/model/LanguageEnum';
import { AiService } from '../ai/ai.service';
import * as WebSocket from 'ws';
import { StatsService } from '../stats/stats.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class GeneratedVideosService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly documentsService: DocumentsService,
    private readonly aiService: AiService,
    private readonly statsService: StatsService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async create(userId: string, videoData: CreateGeneratedVideoDto) {
    let created_video: any = null;

    try {
      if (!videoData.user_query || !videoData.document_id) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      if (videoData.user_query.length > 1024) {
        throw new HttpException('User query must not exceed 1024 characters', HttpStatus.BAD_REQUEST);
      }

      await this.documentsService.verifyUserAccessAndGetDocument(userId, videoData.document_id);

      await this.statsService.registerGeneratedVideoUsage(userId);

      // Enrich user prompt using AI and document RAG
      console.log(`Starting AI prompt enrichment for document: ${videoData.document_id}`);
      const aiStartTime = Date.now();
      const enrichedPrompt = await this.aiService.enrichUserPromptWithDocumentRAG(videoData.user_query, videoData.document_id);
      const aiEndTime = Date.now();
      const aiDuration = aiEndTime - aiStartTime;
      console.log(`AI prompt enrichment completed in ${aiDuration}ms (${(aiDuration / 1000).toFixed(2)}s)`);

      const newVideo = {
        document_id: videoData.document_id,
        name: videoData.user_query,
        user_query: videoData.user_query,
        generated_prompt: enrichedPrompt,
        link: '', // Will be updated after generation
        vtt_link: null,
        srt_link: null,
        generation_time_sec: null, // Will be updated after generation
      };

      const { data: created_video_data, error } = await this.supabase
        .from('generated_videos')
        .insert(newVideo)
        .select('*')
        .single();

      created_video = created_video_data;

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Start video generation process and wait for completion
      console.log(`Starting video generation for video UUID: ${created_video.uuid}`);
      const startTime = Date.now();

      const generationResult = await this.generateVideo(created_video.uuid, enrichedPrompt, videoData.document_id);

      const endTime = Date.now();
      const duration = endTime - startTime;
      const generationTimeSec = Math.round(duration / 1000);
      console.log(`Video generation completed for UUID: ${created_video.uuid} in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      // Update the video record with generation time
      await this.supabase
        .from('generated_videos')
        .update({ generation_time_sec: generationTimeSec })
        .eq('uuid', created_video.uuid);

      return {
        ...created_video,
        link: generationResult.link,
        vtt_link: generationResult.vtt_link,
        srt_link: generationResult.srt_link,
        generation_time_sec: generationTimeSec,
      };
    } catch (error) {
      console.log(error);

      // If we have a created video but generation failed, update it with error status
      if (created_video) {
        await this.supabase
          .from('generated_videos')
          .update({
            generation_time_sec: 0,
            error_message: `Error: ${error?.message || 'Video generation failed'}`
          })
          .eq('uuid', created_video.uuid);
      }

      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async generateVideo(videoUuid: string, userQuery: string, documentId: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const wsStartTime = Date.now();
      try {
        const { data: document, error: docError } = await this.supabase
          .from('documents')
          .select('language')
          .eq('id', documentId)
          .single();

        if (docError || !document) {
          console.error('Error fetching document language:', docError);
          await this.updateVideoWithError(videoUuid, 'Failed to fetch document language');
          reject(new Error('Failed to fetch document language'));
          return;
        }

        const uri = process.env.KNOWLIFY_API_HOST;
        const websocket = new WebSocket(uri);

        websocket.onopen = async () => {
          let payload: any = {
            action: "finetuned_live_gen",
            task: userQuery,
            api_key: process.env.KNOWLIFY_API_KEY,
            logo: "https://graspr-s3-prod.s3.ca-central-1.amazonaws.com/logo/graspr-ai-logo.svg",
            background_color: "#ffffff"
          };

          // French-specific parameters if document is in French
          if (document.language === LanguageEnum.FR) {
            payload.language = "fr-CA";
            payload.voice_name = "fr-CA-Chirp3-HD-Sulafat";
          }

          websocket.send(JSON.stringify(payload));
        };

        websocket.onmessage = async (event) => {
          try {
            const data = event.data.toString();
            const response = JSON.parse(data);
            console.log("Received response:", response);
            if (response.link) {
              const totalTime = Date.now() - wsStartTime;
              console.log(`Video generation completed for UUID: ${videoUuid} in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
              await this.updateVideoAfterGeneration(videoUuid, response);
              websocket.close();
              resolve(response);
            } else {
              console.log("Intermediate response for video:", videoUuid, response);
            }
          } catch (error) {
            console.error("Error processing WebSocket message:", error);
            reject(error);
          }
        };

        websocket.onclose = () => {
          console.log("WebSocket connection closed for video:", videoUuid);
        };

        websocket.onerror = (error) => {
          console.error("WebSocket error for video:", videoUuid, error);
          this.updateVideoWithError(videoUuid, error.message);
          reject(error);
        };

      } catch (error) {
        console.error("Error in generateVideo:", error);
        await this.updateVideoWithError(videoUuid, error.message);
        reject(error);
      }
    });
  }

  private async updateVideoAfterGeneration(videoUuid: string, response: any) {
    try {
      const updateData: any = {};

      // Handle both 'link' and 'video_link' field names (just in case)
      if (response.link) {
        updateData.link = response.link;
      } else if (response.video_link) {
        updateData.link = response.video_link;
      }
      if (response.vtt_link) {
        updateData.vtt_link = response.vtt_link;
      }
      if (response.srt_link) {
        updateData.srt_link = response.srt_link;
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await this.supabase
          .from('generated_videos')
          .update(updateData)
          .eq('uuid', videoUuid);

        if (error) {
          console.error("Error updating video in database:", error);
        } else {
          console.log("Successfully updated video record for:", videoUuid);
        }
      }
    } catch (error) {
      console.error("Error updating video after generation:", error);
    }
  }

  private async updateVideoWithError(videoUuid: string, errorMessage: string) {
    try {
      await this.supabase
        .from('generated_videos')
        .update({
          error_message: `Error: ${errorMessage}`,
          link: '',
        })
        .eq('uuid', videoUuid);
    } catch (error) {
      console.error("Error updating video with error:", error);
    }
  }

  public async update(userId: string, videoData: UpdateGeneratedVideoDto & { uuid: string }) {
    try {
      if (!videoData.uuid) {
        throw new HttpException('Video UUID is required', HttpStatus.BAD_REQUEST);
      }

      await this.verifyUserAccessAndGetVideo(userId, videoData.uuid);

      if (videoData.name.length > 1024) {
        throw new HttpException('Name must not exceed 1024 characters', HttpStatus.BAD_REQUEST);
      }

      const updateData: any = {};
      if (videoData.name) updateData.name = videoData.name;

      const { data: videos, error } = await this.supabase
        .from('generated_videos')
        .update(updateData)
        .eq('uuid', videoData.uuid)
        .select('*');

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        videos,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async getVideosByDocumentId(userId: string, documentId: string) {
    try {
      if (!documentId) {
        throw new HttpException('Document id is required', HttpStatus.BAD_REQUEST);
      }

      await this.documentsService.verifyUserAccessAndGetDocument(userId, documentId);

      const { data: videos, error } = await this.supabase
        .from('generated_videos')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        videos,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async getVideoById(userId: string, videoUuid: string) {
    try {
      if (!videoUuid) {
        throw new HttpException('Video UUID is required', HttpStatus.BAD_REQUEST);
      }

      const { data: videos, error } = await this.supabase
        .from('generated_videos')
        .select('*')
        .eq('uuid', videoUuid);

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const video = videos.length > 0 ? videos[0] : null;
      if (!video) {
        throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
      }

      // Verify user has access to the document this video belongs to
      await this.documentsService.verifyUserAccessAndGetDocument(userId, video.document_id);

      return video;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async deleteVideo(userId: string, videoUuid: string) {
    try {
      if (!videoUuid) {
        throw new HttpException('Video UUID is required', HttpStatus.BAD_REQUEST);
      }

      await this.verifyUserAccessAndGetVideo(userId, videoUuid);

      const { error, status } = await this.supabase
        .from('generated_videos')
        .delete()
        .eq('uuid', videoUuid);

      if (error) {
        console.log(error);
        throw new HttpException(error.message, status);
      }

      return { message: 'Video deleted' };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async verifyUserAccessAndGetVideo(userId: string, videoUuid: string) {
    const video = await this.getVideoById(userId, videoUuid);
    return video;
  }

}
