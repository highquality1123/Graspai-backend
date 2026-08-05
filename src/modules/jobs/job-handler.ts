import { JobRow, JobStage, ResourceType } from './model/job.types';

/** Callbacks de progression fournis au handler pendant l'exécution. */
export interface JobContext {
  setStage(stage: JobStage): Promise<void>;
  setProgress(progress: number): Promise<void>;
}

/**
 * Traitement métier d'un type de ressource. Fourni par chaque domaine (documents, summary…)
 * quand il arrive, via le token multi `JOB_HANDLERS`. Le worker route le job vers le handler
 * dont le `resourceType` correspond.
 */
export interface JobHandler {
  readonly resourceType: ResourceType;
  run(job: JobRow, ctx: JobContext): Promise<{ resourceId: string }>;
}

/**
 * Token du registre des handlers, construit par `jobs.module.ts` : Nest n'a pas de providers
 * `multi: true` à la Angular — le registre est un tableau assemblé explicitement par une
 * `useFactory` (`JobsModule` importe le module de chaque handler et l'ajoute au tableau).
 * Premier inscrit : `DocumentIngestionHandler`. Le worker injecte le tableau en `@Optional`
 * (vide si aucun domaine branché).
 */
export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
