import { toDocumentHit, toNoteHit, toNotebookHit } from './search.mapper';

describe('search mappers', () => {
  it('toNotebookHit maps a container row to {id, title} only', () => {
    expect(toNotebookHit({ id: 'nb-1', name: 'Biology' })).toEqual({ id: 'nb-1', title: 'Biology' });
  });

  it('toNotebookHit coerces a null name to an empty title', () => {
    expect(toNotebookHit({ id: 'nb-1', name: null }).title).toBe('');
  });

  it('toDocumentHit maps to {id, name, notebookId} and never leaks container_id', () => {
    const hit = toDocumentHit({ id: 'd-1', name: 'Bio intro.pdf', container_id: 'nb-1' });
    expect(hit).toEqual({ id: 'd-1', name: 'Bio intro.pdf', notebookId: 'nb-1' });
    expect(hit).not.toHaveProperty('container_id');
  });

  it('toNoteHit builds an excerpt from content, maps notebookId, and never leaks content/title', () => {
    const hit = toNoteHit({ id: 'n-1', title: 'T', content: 'Short body', container_id: 'nb-1' });
    expect(hit).toEqual({ id: 'n-1', excerpt: 'Short body', notebookId: 'nb-1' });
    expect(hit).not.toHaveProperty('content');
    expect(hit).not.toHaveProperty('container_id');
  });

  it('toNoteHit truncates a long content excerpt with an ellipsis', () => {
    const hit = toNoteHit({ id: 'n-1', title: 'T', content: 'a'.repeat(300), container_id: 'nb-1' });
    expect(hit.excerpt.endsWith('…')).toBe(true);
    expect(hit.excerpt.length).toBeLessThanOrEqual(161);
  });
});
