// ── Formes de réponse (openapi.yaml → schema SearchResult, au champ près) ────

/** openapi.yaml → SearchResult.notebooks[]. */
export interface NotebookHit {
  id: string;
  title: string;
}

/** openapi.yaml → SearchResult.documents[]. */
export interface DocumentHit {
  id: string;
  name: string;
  notebookId: string;
}

/** openapi.yaml → SearchResult.notes[]. `excerpt` = extrait du contenu (affichage). */
export interface NoteHit {
  id: string;
  excerpt: string;
  notebookId: string;
}

/** openapi.yaml → schema SearchResult (racine de GET /search). */
export interface SearchResult {
  notebooks: NotebookHit[];
  documents: DocumentHit[];
  notes: NoteHit[];
}

// ── Lignes DB internes (snake_case) — ne sortent JAMAIS telles quelles ──────

/** Sous-ensemble lu de `public.containers`. */
export interface ContainerHitRow {
  id: string;
  name: string | null;
}

/** Sous-ensemble lu de `public.documents`. `container_id` -> notebookId. */
export interface DocumentHitRow {
  id: string;
  name: string | null;
  container_id: string;
}

/** Sous-ensemble lu de `public.notes`. `content` -> excerpt ; `container_id` -> notebookId. */
export interface NoteHitRow {
  id: string;
  title: string;
  content: string;
  container_id: string;
}
