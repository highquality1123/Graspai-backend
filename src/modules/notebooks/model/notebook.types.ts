import { NotebookDocument } from '../../notebook-documents/model/document.types';

export const VISIBILITIES = ['private', 'shared'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

// ── Formes de réponse (openapi.yaml, au champ près) ────────────────────────

/** openapi.yaml → schema Notebook. */
export interface Notebook {
  id: string;
  title: string;
  folderId: string | null;
  pinned: boolean;
  visibility: Visibility;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** openapi.yaml → schema NotebookDetail (Notebook + documents ingérés). */
export interface NotebookDetail extends Notebook {
  documents: NotebookDocument[];
}

/** openapi.yaml → schema NotebookListItem (forme allégée du sidebar). */
export interface NotebookListItem {
  id: string;
  title: string;
  pinned: boolean;
  documentCount: number;
  lastAccessedAt: string | null;
}

/** openapi.yaml → schema NotebookFolder. */
export interface NotebookFolder {
  id: string;
  label: string;
  notebooks: NotebookListItem[];
}

/** openapi.yaml → schema NotebookTree (racine de GET /notebooks). */
export interface NotebookTree {
  folders: NotebookFolder[];
  rootNotebooks: NotebookListItem[];
}

/** openapi.yaml → schema Folder. */
export interface Folder {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

// ── Lignes DB internes (snake_case) — ne sortent JAMAIS telles quelles ─────

/** Ligne `public.containers` (stockage d'un notebook V2). */
export interface ContainerRow {
  id: string;
  name: string | null;
  folder_id: string | null;
  user_id: string | null;
  pinned: boolean;
  visibility: Visibility;
  prompt: string | null;
  last_accessed_at: string | null;
  schema_version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  migration_document_id: string | null;
}

/** Ligne `public.folders`. */
export interface FolderRow {
  id: string;
  name: string | null;
  user_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
