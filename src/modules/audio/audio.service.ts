import { HttpException, Injectable } from "@nestjs/common";
import { LanguageEnum } from "src/modules/documents/model/LanguageEnum";
import { SupabaseClient } from "@supabase/supabase-js";
import { v4 } from "uuid";
import { S3Service } from "../s3/s3.service";
import { RecordingDto } from "src/modules/audio/model/RecordingDto";
import { StatsService } from "../stats/stats.service";
import { DocumentDto } from "../documents/model/DocumentDto";
import { DocumentTypeEnum } from "../documents/model/DocumentTypeEnum";
import { DocumentSourceTypeEnum } from "../documents/model/DocumentSourceTypeEnum";
import { HttpStatusCode } from "axios";
import { AiService } from "../ai/ai.service";
import { SupabaseService } from "../supabase/supabase.service";
import * as ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import * as fs from "fs";

const CHUNK_DURATION_SECONDS = 30;

const ffprobeAsync = promisify(ffmpeg.ffprobe);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class AudioService {
  private supabase: SupabaseClient;
  private musicMetadata: any;

  constructor(
    private readonly s3Service: S3Service,
    private readonly statsService: StatsService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async transcribeAndGetAudioChunks(file: any, documentId: string, language: LanguageEnum) {
    const fileBlob = new Blob([file.buffer]);
    const audioFile = new File([fileBlob], file.originalname, {
      type: file.mimetype,
    });

    const transcriptionRes = await this.aiService.transcribeAudioFile(audioFile, language);

    return this.mergeChunks(transcriptionRes.segments, documentId);
  }

  public async getAudioDurationSeconds(file: any): Promise<number> {
    try {
      // Cache the music-metadata module after first import
      if (!this.musicMetadata) {
        this.musicMetadata = await import('music-metadata');
      }

      const metadata = await this.musicMetadata.parseBlob(
        new Blob([file.buffer], {
          type: file.mimetype,
        }),
        { duration: true },
      );
      return metadata.format.duration;
    } catch (err) {
      console.error('Error reading audio metadata:', err);
      const tmpFilePath = "/tmp/" + v4()
      try {
        await writeFileAsync(tmpFilePath, file.buffer);
        const metadata = await ffprobeAsync(tmpFilePath);
        return metadata.format.duration;
      } catch (err) {
        console.error('Error getting audio duration using ffmpeg:', err);
        return 0;
      } finally {
        await unlinkAsync(tmpFilePath).catch(() => null);
      }
    }
  }

  public async getAudioChunksFromRecording(recording: RecordingDto, documentId: string) {
    const { data: recordingChunks } = await this.supabase
      .from('recording_chunks')
      .select('*')
      .eq('recording_id', recording.id)
      .order('index', {
        ascending: true,
      });

    return this.mergeChunks(recordingChunks, documentId);
  }

  private mergeChunks(chunks: Array<{ start: number; end: number; text: string }>, documentId: string) {
    const mergedChunks = [];
    let chunkContent = '';
    let chunkDuration = 0;
    let chunkStart = 0;
    let chunkEnd = 0;
    chunks.forEach((segment) => {
      if (chunkDuration == 0) {
        chunkStart = segment.start;
      }
      chunkEnd = segment.end;
      chunkContent += segment.text + ' ';
      chunkDuration += segment.end - segment.start;
      if (chunkDuration >= CHUNK_DURATION_SECONDS) {
        mergedChunks.push({
          content: chunkContent,
          page: mergedChunks.length + 1,
          doc_id: documentId,
          duration: chunkDuration,
          start: chunkStart,
          end: chunkEnd,
        });
        chunkContent = '';
        chunkDuration = 0;
        chunkStart = 0;
        chunkEnd = 0;
      }
    });
    if (chunkDuration != 0) {
      mergedChunks.push({
        content: chunkContent,
        page: mergedChunks.length + 1,
        doc_id: documentId,
        duration: chunkDuration,
        start: chunkStart,
        end: chunkEnd,
      });
    }
    return mergedChunks;
  }

  public async startRecording(params: {
    language: LanguageEnum;
    userId: string;
    type: string;
    name: string;
    initialContainerId: string;
  }): Promise<string> {
    const recordingId = v4();

    const queryRes = await this.supabase
      .from('recordings')
      .insert([
        {
          id: recordingId,
          language: params.language,
          user_id: params.userId,
          type: params.type,
          name: params.name,
          initial_container_id: params.initialContainerId,
        },
      ])
      .select();

    return new Promise((resolve, reject) => {
      if (queryRes.error) {
        reject(queryRes.error);
      } else {
        resolve(recordingId);
      }
    });
  }

  public async stopRecording(params: { recordingId: string; userId: string }) {
    const recording = await this.verifyAccessAndGetRecording(params.userId, params.recordingId);

    if (recording.is_processed) {
      throw new HttpException('Recording already processed', 400);
    }

    const { data: recordingChunks } = await this.supabase
      .from('recording_chunks')
      .select('*')
      .eq('recording_id', params.recordingId)
      .order('index', {
        ascending: true,
      });
    const fetchPromises = [];
    let duration = 0;
    recordingChunks.forEach((chunk) => {
      fetchPromises[chunk.index] = fetch(chunk.url).then((r) => r.blob());
      duration += chunk.end - chunk.start;
    });

    const blobsPromises = await Promise.all(fetchPromises);
    const blobs = await Promise.all(blobsPromises);
    const audioFileName = recording.id + this.getExtensionByMimeType(recording.type);
    const combinedBlob = new Blob(blobs, {
      type: recording.type,
    });

    const s3Res = await this.s3Service.uploadFile(
      {
        mimetype: recording.type,
        buffer: Buffer.from(await combinedBlob.arrayBuffer()),
      },
      audioFileName,
    );

    const recordingUpdated = await this.supabase
      .from('recordings')
      .update([
        {
          url: s3Res.Location,
          duration,
          is_processed: true,
        },
      ])
      .eq('id', recording.id)
      .select();

    await this.s3Service.deleteFiles(recordingChunks.map((chunk) => chunk.url));

    return await this.createDocumentFromRecording(params.userId, recording.id, duration);
  }

  private async createDocumentFromRecording(
    userId: string,
    recordingId: string,
    duration: number,
  ): Promise<{
    message: string;
    document: DocumentDto;
  }> {
    try {
      console.time('Create document from recording');

      const recording = await this.verifyAccessAndGetRecording(userId, recordingId);

      const document = await this.saveDocumentMeta(
        userId,
        recording.name,
        recording.url,
        DocumentTypeEnum.AUDIO,
        recording.language,
        recording.initial_container_id,
        duration,
      );

      await this.aiService.buildEmbeddings(
        userId,
        document,
        DocumentSourceTypeEnum.RECORDING,
        recording,
        async (document: DocumentDto, source: any) => {
          return await this.getAudioChunksFromRecording(source, document.id);
        },
      );

      await this.statsService.registerAudioUsage(userId);

      await this.aiService.generateChapters(userId, document.id);

      console.timeEnd('Create document from recording');

      return {
        message: 'Document created successfully',
        document,
      };
    } catch (error) {
      throw new HttpException(error.message || 'Unknown error', error.status || HttpStatusCode.InternalServerError);
    }
  }

  private async saveDocumentMeta(
    userId: string,
    documentName: string,
    fileUrl: string,
    documentType: DocumentTypeEnum,
    language: LanguageEnum,
    containerId: string,
    duration: number = 0,
  ) {
    const documentId = v4();

    const newDocument = {
      id: documentId,
      user_id: userId,
      name: documentName,
      pages_count: 0,
      length: Math.round(duration),
      tokens: 0,
      url: fileUrl,
      type: documentType,
      language: language,
      container_id: containerId,
    };

    const {
      error: documentError,
      status: documentStatus,
      data: createdDocuments,
    } = await this.supabase.from('documents').insert([newDocument]).select();
    if (documentError) {
      console.log('[Audio] Insert document failed', documentError);
      throw new HttpException(documentError?.message, documentStatus);
    }

    return createdDocuments[0] as DocumentDto;
  }

  private getExtensionByMimeType(mimeType: string) {
    const mimeTypeClean = mimeType.split(';')[0];
    if (mimeTypeClean == 'audio/webm') {
      return '.webm';
    } else if (mimeTypeClean == 'audio/mp4') {
      return '.mp4';
    } else {
      return '';
    }
  }

  public async uploadRecordingChunk(params: {
    recordingId: string;
    userId: string;
    chunkRawFile: any;
    chunkPlayableBlob: Blob;
    start: number;
    end: number;
    index: number;
    isSilent: string;
    language: string;
  }) {
    const recording = await this.verifyAccessAndGetRecording(params.userId, params.recordingId);

    await this.statsService.registerTranscriptionMinutesUsage(params.userId, (params.end - params.start) / 60.0);

    let transcription = '';
    if (params.isSilent !== 'true') {
      transcription = await this.getChunkTranscription(params.chunkPlayableBlob, params.language as LanguageEnum);
    }

    const s3Res = await this.s3Service.uploadFile(params.chunkRawFile, `${recording.id}-${params.index}`);

    const queryRes = await this.supabase
      .from('recording_chunks')
      .insert([
        {
          recording_id: params.recordingId,
          url: s3Res.Location,
          start: params.start,
          end: params.end,
          index: params.index,
          text: transcription,
        },
      ])
      .select();

    if (queryRes.error) {
      throw new HttpException(queryRes.error, 500);
    }

    return {
      id: queryRes.data[0].id,
      transcription,
    };
  }

  public async verifyAccessAndGetRecording(userId: string, recordingId: string) {
    const recording = await this.getUserRecordingById(userId, recordingId);
    if (recording.user_id != userId) {
      throw new HttpException('Forbidden', 403);
    }
    return recording;
  }

  private async getUserRecordingById(userId: string, recordingId: string) {
    const {
      data: recordings,
      error,
      status,
    } = await this.supabase.from('recordings').select('*').eq('id', recordingId).eq('user_id', userId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!recordings || recordings.length === 0) {
      throw new HttpException('Recording not found', 404);
    }

    return recordings[0];
  }

  private async getChunkTranscription(chunk: Blob, language: LanguageEnum) {
    const audioFileName = 'audio.wav';
    const audioFile = new File([chunk], audioFileName, {
      type: 'audo/wav',
    });

    try {
      const chunkContent = await this.aiService.transcribeAudioChunk(audioFile, language);

      return chunkContent;
    } catch (e) {
      console.log('Transcription error', e);
      return '[Transcription error]';
    }
  }

  public async updateRecordingChunk(params: { chunkId: number; userId: string; text: string }) {
    await this.validateRecordingChunkById(params.userId, params.chunkId);

    const queryRes = await this.supabase
      .from('recording_chunks')
      .update({
        text: params.text,
      })
      .eq('id', params.chunkId)
      .select('id, text');

    if (queryRes.error) {
      throw new HttpException(queryRes.error, queryRes.status);
    }

    return {
      ...queryRes.data[0],
    };
  }

  private async validateRecordingChunkById(userId: string, chunkId: number) {
    const { data, error, status } = await this.supabase
      .from('recording_chunks')
      .select('id, recordings(user_id)')
      .eq('id', chunkId);
    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!data || data.length === 0) {
      throw new HttpException('Chunk not found', 404);
    }

    if ((data[0].recordings as any).user_id != userId) {
      throw new HttpException('Forbidden', 403);
    }
  }

  public async getMyRecordingsList(params: { userId: string }) {
    const queryRes = await this.supabase
      .from('recordings')
      .select('*, recording_chunks(id, text, start, end,  index)')
      .eq('user_id', params.userId)
      .order('index', { referencedTable: 'recording_chunks', ascending: true })
      .order('created_at', { ascending: false });

    if (queryRes.error) {
      throw new HttpException(queryRes.error, queryRes.status);
    }

    return queryRes.data;
  }
}
