import { ResourceType } from './job.types';

/**
 * ⚠️ PROVISOIRE — estimations grossières de durée par type de ressource, servant à remplir
 * `estimatedSeconds` du 202. Ce ne sont PAS des mesures réelles ni un SLA : à AFFINER quand
 * les vrais handlers arriveront (mesurer la durée observée par resourceType). Un domaine peut
 * déjà passer sa propre estimation via `EnqueueInput.estimatedSeconds` pour surcharger celle-ci.
 */
export const PROVISIONAL_ESTIMATED_SECONDS: Record<ResourceType, number> = {
  document: 60,
  summary: 30,
  quiz: 30,
  flashcards: 30,
  video: 120,
  podcast: 120,
  mindmap: 30,
};
