import { SupabaseService } from '../../supabase/supabase.service';
import { allocateBudgets, SUMMARY_CONTEXT_TOKEN_BUDGET, SummarySourceReader } from './summary-source-reader';

// ── allocateBudgets : les 4 scénarios chiffrés du plan goal 1 ────────────────

describe('allocateBudgets (budget équitable avec redistribution en cascade)', () => {
  it('mono-document sous le budget : tout passe (dégénère en legacy)', () => {
    expect(allocateBudgets([40_000], 100_000)).toEqual([40_000]);
  });

  it('mono-document au-dessus : budget entier, divider legacy (ceil(250k/100k) = 3)', () => {
    const [budget] = allocateBudgets([250_000], 100_000);
    expect(budget).toBe(100_000);
    expect(Math.ceil(250_000 / budget)).toBe(3);
  });

  it('hétérogène : les petits docs passent intégralement, le gros hérite du reste', () => {
    // 1 doc de 950k + 9 docs de 5k : les 9 petits (45k) intégraux, le gros reçoit 55k.
    const totals = [950_000, ...Array(9).fill(5_000)];
    const budgets = allocateBudgets(totals, 100_000);

    for (let i = 1; i < 10; i++) expect(budgets[i]).toBe(5_000);
    expect(budgets[0]).toBeCloseTo(55_000, 5);
    expect(Math.ceil(950_000 / budgets[0])).toBe(18); // échantillonné 1 page sur 18
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100_000);
  });

  it('total sous le budget : chaque doc passe intégralement, aucun échantillonnage', () => {
    const budgets = allocateBudgets([30_000, 20_000, 10_000], 100_000);
    expect(budgets).toEqual([30_000, 20_000, 10_000]);
  });

  it('cas limite : beaucoup de docs → part mince mais jamais nulle (représentation garantie)', () => {
    const budgets = allocateBudgets(Array(50).fill(500_000), 100_000);
    for (const b of budgets) expect(b).toBeCloseTo(2_000, 5);
  });
});

// ── read : lecture + application du budget par document ──────────────────────

type Row = { document_id: string; token: number; content: string; page_number: number };

function chainFor(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'eq', 'is', 'in', 'order'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

function readerWith(embeddingsRows: Row[], docs: { id: string; name: string }[]) {
  const byTable: Record<string, ReturnType<typeof chainFor>> = {
    documents: chainFor({ data: docs, error: null }),
    embeddings: chainFor({ data: embeddingsRows, error: null }),
  };
  const client = { from: jest.fn((table: string) => byTable[table]) };
  return new SummarySourceReader({ getClient: () => client } as unknown as SupabaseService);
}

function pages(documentId: string, count: number, tokensPerPage: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    document_id: documentId,
    token: tokensPerPage,
    content: `${documentId} page ${i + 1}`,
    page_number: i + 1,
  }));
}

describe('SummarySourceReader.read', () => {
  it('keeps everything for a small document and labels the source', async () => {
    const reader = readerWith(pages('doc-1', 3, 100), [{ id: 'doc-1', name: 'Cours.pdf' }]);

    const sources = await reader.read(['doc-1']);

    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe('Cours.pdf');
    expect(sources[0].pieces).toHaveLength(3);
  });

  it('samples an oversized document with the legacy modular filter (page % divider === 1)', async () => {
    // 1000 pages × 250 tokens = 250k > 100k → divider 3 → pages 1, 4, 7, …
    const reader = readerWith(pages('doc-1', 1000, 250), [{ id: 'doc-1', name: 'Gros.pdf' }]);

    const [source] = await reader.read(['doc-1']);

    expect(source.pieces.length).toBe(Math.ceil(1000 / 3));
    expect(source.pieces[0].page).toBe(1);
    expect(source.pieces[1].page).toBe(4);
  });

  it('multi-source : the small document survives intact next to a huge one', async () => {
    const rows = [...pages('doc-big', 2000, 250), ...pages('doc-small', 4, 250)]; // 500k + 1k tokens
    const reader = readerWith(rows, [
      { id: 'doc-big', name: 'Manuel.pdf' },
      { id: 'doc-small', name: 'Fiche.pdf' },
    ]);

    const sources = await reader.read(['doc-big', 'doc-small']);

    const small = sources.find((s) => s.documentId === 'doc-small');
    const big = sources.find((s) => s.documentId === 'doc-big');
    expect(small?.pieces).toHaveLength(4); // intégral — jamais évincé par le gros
    // Le gros est échantillonné dans le budget restant (~99k) : divider 6 → ~334 pages.
    expect(big?.pieces.length).toBe(Math.ceil(2000 / 6));
    const keptTokens = sources.flatMap((s) => s.pieces).length * 250;
    expect(keptTokens).toBeLessThanOrEqual(SUMMARY_CONTEXT_TOKEN_BUDGET * 1.05); // marge d'arrondi par page
  });

  it('returns an empty pieces list for a document without embeddings (deleted between POST and run)', async () => {
    const reader = readerWith([], [{ id: 'doc-gone', name: 'Parti.pdf' }]);
    const [source] = await reader.read(['doc-gone']);
    expect(source.pieces).toEqual([]);
  });
});
