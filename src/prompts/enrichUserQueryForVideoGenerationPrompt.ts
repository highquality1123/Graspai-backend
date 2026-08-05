export const enrichUserQueryForVideoGenerationPrompt = (userQuery: string, documentContext: string, documentLanguage: string): string => {
  const languageInstruction = documentLanguage === 'fr' 
    ? 'IMPORTANT: The document is in French. Generate the enriched prompt in French to match the document language.'
    : 'IMPORTANT: The document is in English. Generate the enriched prompt in English to match the document language.';

  return `You are an AI assistant helping to create educational video content. 

The user has asked: "${userQuery}"

Here is relevant information from the document they're working with:
${documentContext}

${languageInstruction}

Please create an enriched, detailed prompt for video generation that:
1. Keeps the user's original intent and question
2. Incorporates relevant information from the document
3. Provides clear, educational content suitable for video explanation
4. Is concise but comprehensive (aim for 2-3 sentences)
5. Focuses on the most important concepts from the document that relate to the user's question
6. Is written in the same language as the document (${documentLanguage === 'fr' ? 'French' : 'English'})

Return only the enriched prompt, nothing else.`;
};
