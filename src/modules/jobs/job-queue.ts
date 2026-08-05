import { ResourceType } from './model/job.types';

export interface EnqueueInput {
  resourceType: ResourceType;
  /** Données dont le handler aura besoin (documentId, prompt, options…). Persisté en `payload`. */
  payload?: unknown;
  /** Estimation fournie par le domaine ; à défaut, une valeur provisoire par resourceType est utilisée. */
  estimatedSeconds?: number;
}

/** Réponse du 202 (openapi.yaml → JobAccepted). */
export interface JobAccepted {
  jobId: string;
  estimatedSeconds: number;
}

/**
 * Couture de la file d'attente. Les domaines (documents, summary…) déclencheront un traitement
 * asynchrone en injectant `JOB_QUEUE` et en appelant `enqueue`, sans connaître le mécanisme sous-jacent.
 * Implémentation actuelle : table `jobs` (DbJobQueue). Un swap vers BullMQ/Redis se fait en
 * rebranchant ce token, sans toucher aux domaines.
 */
export interface JobQueue {
  enqueue(userId: string, input: EnqueueInput): Promise<JobAccepted>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');
