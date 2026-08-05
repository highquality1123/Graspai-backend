import OpenAI from 'openai';
import { SummaryGenerator } from './summary-generator';
import { DocumentSource } from './summary-source-reader';

function sources(): DocumentSource[] {
  return [
    { documentId: 'doc-1', label: 'Cours.pdf', pieces: [{ content: 'La cellule est…', page: 1 }] },
    { documentId: 'doc-2', label: 'Fiche.pdf', pieces: [{ content: 'La mitose…', page: 1 }] },
  ];
}

function openaiMock(responses: string[]) {
  const create = jest.fn();
  for (const content of responses) {
    create.mockResolvedValueOnce({ choices: [{ message: { content } }] });
  }
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

describe('SummaryGenerator', () => {
  it('runs the two legacy-style passes with gpt-4o-mini at temperature 0.1 and strict json_schema', async () => {
    const { client, create } = openaiMock([
      JSON.stringify({ chapters: ['La cellule', 'La mitose'] }),
      JSON.stringify({ title: 'Biologie cellulaire', body: '- La cellule…\n- La mitose…' }),
    ]);
    const afterChapters = jest.fn();

    const result = await new SummaryGenerator(client).generate(sources(), 'brief', 'bullet_points', {
      afterChapters,
    });

    expect(create).toHaveBeenCalledTimes(2);
    for (const call of create.mock.calls) {
      expect(call[0]).toMatchObject({ model: 'gpt-4o-mini', temperature: 0.1 });
      expect(call[0].response_format.type).toBe('json_schema');
      expect(call[0].response_format.json_schema.strict).toBe(true);
    }
    expect(afterChapters).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ title: 'Biologie cellulaire', body: '- La cellule…\n- La mitose…' });
  });

  it('injects length/format guidance and the pass-1 chapters into the pass-2 prompt', async () => {
    const { client, create } = openaiMock([
      JSON.stringify({ chapters: ['Chap A'] }),
      JSON.stringify({ title: 'T', body: 'B' }),
    ]);

    await new SummaryGenerator(client).generate(sources(), 'detailed', 'outline');

    const pass2System: string = create.mock.calls[1][0].messages[0].content;
    expect(pass2System).toContain('900-1200 words'); // length = consigne, pas de validation dure
    expect(pass2System).toContain('outline');
    expect(pass2System).toContain('Chap A');
    expect(pass2System).toContain('language of the context'); // règle de langue legacy conservée
  });

  it('serializes the context with document and page markers (multi-source)', async () => {
    const { client, create } = openaiMock([
      JSON.stringify({ chapters: [] }),
      JSON.stringify({ title: 'T', body: 'B' }),
    ]);

    await new SummaryGenerator(client).generate(sources(), 'brief', 'paragraphs');

    const context: string = create.mock.calls[0][0].messages[1].content;
    expect(context).toContain('$$Document: Cours.pdf$$');
    expect(context).toContain('$$Document: Fiche.pdf$$');
    expect(context).toContain('$$Start Of Page No 1$$La cellule est…$$End Of Page No 1$$');
  });

  it('falls back to the legacy title when the LLM returns an empty one', async () => {
    const { client } = openaiMock([
      JSON.stringify({ chapters: ['A'] }),
      JSON.stringify({ title: '  ', body: 'Contenu' }),
    ]);

    const result = await new SummaryGenerator(client).generate(sources(), 'brief', 'paragraphs');

    expect(result.title).toBe('Summary');
  });

  it('fails cleanly at usage when OPENAI_API_KEY is not configured (socle philosophy)', async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(new SummaryGenerator().generate(sources(), 'brief', 'paragraphs')).rejects.toThrow(/OPENAI_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});
