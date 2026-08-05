import { SummaryFormat, SummaryLength } from '../model/summary.types';
import { DocumentSource } from './summary-source-reader';

/**
 * Prompts V2 — dérivés des acquis legacy (`getChapterNamesForSummaryPrompt` /
 * `getSummaryPrompt` : stratégie 2 passes, ≤ 30 chapitres, langue du contexte, repères de
 * page) mais paramétrés `length`/`format` et à sortie structurée `{title, body}` (markdown),
 * conformes au contrat. La sortie JSON est garantie par `response_format: json_schema`
 * (strict) côté API — les prompts ne portent que les consignes de contenu.
 */

/** Consignes de longueur : une CIBLE indicative dans le prompt, jamais une validation dure. */
const LENGTH_GUIDANCE: Record<SummaryLength, string> = {
  brief: 'Aim for approximately 150-250 words in total: only the essential takeaways.',
  standard: 'Aim for approximately 400-600 words in total: a balanced, complete overview.',
  detailed: 'Aim for approximately 900-1200 words in total: a thorough, in-depth summary.',
};

const FORMAT_GUIDANCE: Record<SummaryFormat, string> = {
  paragraphs: 'Write flowing markdown prose organized in paragraphs (no bullet lists).',
  bullet_points: 'Write markdown bullet lists (- item), grouped under short bold lead-ins where helpful.',
  outline: 'Write a hierarchical markdown outline using # and ## headings with short entries under each.',
};

/**
 * Contexte sérialisé : sections par document + repères de page legacy (`combineDocuments`,
 * ai.service.ts:354-368) — le LLM garde ses repères de structure, étendus au multi-source.
 */
export function serializeContext(sources: DocumentSource[]): string {
  return sources
    .map((source) => {
      const pages = source.pieces
        .map((p) => `$$Start Of Page No ${p.page}$$${p.content}$$End Of Page No ${p.page}$$`)
        .join('\n\n');
      return `$$Document: ${source.label || source.documentId}$$\n${pages}`;
    })
    .join('\n\n');
}

/** Passe 1 — extraction des chapitres (consignes legacy conservées, étendues multi-document). */
export function buildChapterNamesInstructions(): string {
  return [
    'Extract the chapters from the given context (one or several documents).',
    'The chapters may not be explicitly labeled: identify them by significant shifts in content, theme or narrative structure.',
    'If several documents are present, cover ALL of them — do not focus on a single document.',
    'YOU MUST GIVE NO MORE THAN 30 CHAPTERS. KEEP EDGE CHAPTERS, SKIP INTERMEDIATE.',
  ].join('\n');
}

/** Passe 2 — le résumé, paramétré par le contrat. */
export function buildSummaryInstructions(chapterNames: string[], length: SummaryLength, format: SummaryFormat): string {
  return [
    'Summarize the given context following these chapters, in the same order, without skipping any:',
    JSON.stringify(chapterNames),
    LENGTH_GUIDANCE[length],
    FORMAT_GUIDANCE[format],
    'Also produce a short, specific title for the summary (a few words, no generic "Summary").',
    'Answer in the language of the context.',
    'Page markers ($$Start Of Page No X$$ … $$End Of Page No X$$) and document markers ($$Document: …$$) delimit the sources — never reproduce them in the output.',
  ].join('\n');
}
