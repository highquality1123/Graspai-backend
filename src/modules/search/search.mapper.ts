import { ContainerHitRow, DocumentHit, DocumentHitRow, NoteHit, NoteHitRow, NotebookHit } from './model/search.types';

const EXCERPT_MAX = 160;

/** Ligne `containers` → hit notebook (contrat) : `name` -> title, aucune autre colonne. */
export function toNotebookHit(row: ContainerHitRow): NotebookHit {
  return { id: row.id, title: row.name ?? '' };
}

/** Ligne `documents` → hit document : `container_id` -> notebookId ; rien d'autre ne sort. */
export function toDocumentHit(row: DocumentHitRow): DocumentHit {
  return { id: row.id, name: row.name ?? '', notebookId: row.container_id };
}

/** Ligne `notes` → hit note : `content` -> excerpt (borné) ; `container_id` -> notebookId. */
export function toNoteHit(row: NoteHitRow): NoteHit {
  return { id: row.id, excerpt: buildExcerpt(row.content), notebookId: row.container_id };
}

/** Extrait borné du contenu d'une note (affichage top-bar). */
function buildExcerpt(content: string): string {
  const s = (content ?? '').trim();
  return s.length > EXCERPT_MAX ? `${s.slice(0, EXCERPT_MAX)}…` : s;
}
