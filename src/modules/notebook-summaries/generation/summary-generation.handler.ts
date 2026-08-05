import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JobContext, JobHandler } from '../../jobs/job-handler';
import { JobRow } from '../../jobs/model/job.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { SummaryGenerationPayload } from '../model/summary.types';
import { SummaryGenerator } from './summary-generator';
import { SummarySourceReader } from './summary-source-reader';

/**
 * Handler de génération des résumés (registre `JOB_HANDLERS`, resourceType 'summary').
 * Pas de `stage` (le contrat le réserve à l'ingestion) — `progress` seulement :
 * 10 sources lues → 40 chapitres extraits → 80 résumé généré → insert → ready.
 * La ligne `summaries` NAÎT ICI, à la complétion (le 202 ne renvoie pas d'id — contrat) ;
 * `markReady` pose son id dans `Job.resourceId`. Sources disparues entre le POST et le
 * run → throw → retry ×3 → `failed` avec message clair.
 */
@Injectable()
export class SummaryGenerationHandler implements JobHandler {
  readonly resourceType = 'summary' as const;
  private readonly logger = new Logger(SummaryGenerationHandler.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly reader: SummarySourceReader,
    private readonly generator: SummaryGenerator,
  ) {}

  async run(job: JobRow, ctx: JobContext): Promise<{ resourceId: string }> {
    const payload = job.payload as Partial<SummaryGenerationPayload> | null;
    if (!payload?.notebookId || !payload.documentIds?.length || !payload.length || !payload.format) {
      throw new Error(`Summary job ${job.id} has an invalid payload`);
    }

    const sources = await this.reader.read(payload.documentIds);
    if (sources.every((s) => s.pieces.length === 0)) {
      throw new Error('No source content found — the documents were deleted or their index is empty');
    }
    await ctx.setProgress(10);

    const generated = await this.generator.generate(sources, payload.length, payload.format, {
      afterChapters: () => ctx.setProgress(40),
    });
    await ctx.setProgress(80);

    const summaryId = uuidv4();
    const wordCount = generated.body.split(/\s+/).filter(Boolean).length;
    const { error } = await this.supabaseService.getClient().from('summaries').insert({
      id: summaryId,
      user_id: job.user_id,
      container_id: payload.notebookId,
      title: generated.title,
      body: generated.body,
      word_count: wordCount,
      source_document_ids: payload.documentIds,
      length: payload.length,
      format: payload.format,
    });
    if (error) {
      throw new Error(`Could not persist summary: ${error.message}`);
    }

    this.logger.log(`Summary ${summaryId} generated (${wordCount} words, ${sources.length} source(s))`);
    return { resourceId: summaryId };
  }
}
