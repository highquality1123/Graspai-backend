import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { SummaryFormat, SummaryLength } from '../model/summary.types';
import { buildChapterNamesInstructions, buildSummaryInstructions, serializeContext } from './prompts';
import { DocumentSource } from './summary-source-reader';

/** Parité legacy : `CHAT_MODEL` / `CHAT_TEMPERATURE` (ai.service.ts:23,25) — fidélité > créativité. */
const SUMMARY_MODEL = 'gpt-4o-mini';
const SUMMARY_TEMPERATURE = 0.1;

export interface GeneratedSummary {
  title: string;
  body: string;
}

const CHAPTERS_SCHEMA = {
  type: 'object',
  properties: { chapters: { type: 'array', items: { type: 'string' } } },
  required: ['chapters'],
  additionalProperties: false,
} as const;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, body: { type: 'string' } },
  required: ['title', 'body'],
  additionalProperties: false,
} as const;

/**
 * Génération du résumé — 2 passes (stratégie legacy conservée : chapitres d'abord, résumé
 * chapitre par chapitre ensuite), sortie structurée via `response_format: json_schema`
 * strict (remplace le `parseJSONFromAI` legacy, plus fiable). Appel OpenAI DIRECT — pas
 * d'`AiModule` (il reste confiné à l'adaptateur d'indexation de notebook-documents).
 * `OPENAI_API_KEY` non requise au boot (philosophie socle) : échec propre à l'usage.
 */
@Injectable()
export class SummaryGenerator {
  private readonly logger = new Logger(SummaryGenerator.name);
  private client?: OpenAI;

  // Client injectable pour les tests uniquement ; en prod, instancié depuis l'env à l'usage.
  // @Optional : aucun provider Nest ne fournit OpenAI, le DI doit injecter undefined.
  constructor(@Optional() openai?: OpenAI) {
    this.client = openai;
  }

  async generate(
    sources: DocumentSource[],
    length: SummaryLength,
    format: SummaryFormat,
    hooks?: { afterChapters?: () => Promise<void> },
  ): Promise<GeneratedSummary> {
    const context = serializeContext(sources);

    const { chapters } = await this.completeJson<{ chapters: string[] }>(
      buildChapterNamesInstructions(),
      context,
      'chapter_names',
      CHAPTERS_SCHEMA,
    );
    this.logger.log(`Pass 1: ${chapters.length} chapters identified across ${sources.length} source(s)`);
    await hooks?.afterChapters?.();

    const generated = await this.completeJson<GeneratedSummary>(
      buildSummaryInstructions(chapters, length, format),
      context,
      'notebook_summary',
      SUMMARY_SCHEMA,
    );

    // Cible de longueur = consigne de prompt uniquement — jamais de validation dure ici.
    return { title: generated.title?.trim() || 'Summary', body: generated.body };
  }

  private async completeJson<T>(
    instructions: string,
    context: string,
    schemaName: string,
    schema: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.getClient().chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: SUMMARY_TEMPERATURE,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: context },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema: schema as never },
      },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty LLM response for ${schemaName}`);
    }
    return JSON.parse(content) as T;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured (summary generation unavailable)');
      }
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }
}
