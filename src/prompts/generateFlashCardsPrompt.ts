import formatter from 'src/services/formatter';

interface GenerateFlashCardsPromptParams {
  cardsCount: number;
  previousFlashcards?: string[];
}

export const generateFlashCardsPrompt = ({ cardsCount, previousFlashcards = [] }: GenerateFlashCardsPromptParams): string => {
  let previousFlashcardsBlock = '';
  if (previousFlashcards.length > 0) {
    const flashcardsList = previousFlashcards.map((q, i) => `${i + 1}. ${q}`).join('\n');
    previousFlashcardsBlock = `
    ### Previously Generated Flashcards (DO NOT DUPLICATE)
    The following flashcard questions have already been generated. You MUST NOT generate any flashcard that is similar or duplicate to these:

${flashcardsList}

    **IMPORTANT**: Generate exactly ${cardsCount} NEW flashcards that are completely different from the above list.
    `;
  }

  const prompt = `
    You are a subject specialist and expert flashcard generator. Your task is to create flashcards strictly based on the provided context.

    ### Flashcard Parameters
    - Number of flashcards to generate: **EXACTLY ${cardsCount}**
${previousFlashcardsBlock}

    ### Flashcard Generation Guidelines

    **CRITICAL REQUIREMENTS:**
    - You MUST generate EXACTLY ${cardsCount} flashcards - no more, no less.
    - Each flashcard must have all required fields: question, answer, pageNumber.
    - Definitions should be exact in wording from the context.
    - Create questions only using information from the given context.
    - Reference the page number from the document for each flashcard.

    **Quality Guidelines:**
    - Questions should be clear and test understanding of key concepts.
    - Answers should be complete and accurate based on the context.
    - Cover different topics/sections from the context for variety.
    - Avoid duplicate or very similar questions.

    ### Page Number Identification
    Each page in the context starts with "$$Start Of Page No [actualPageNo]$$" and ends with "$$End Of Page No [actualPageNo]$$". Use these markers to identify the correct page number for each flashcard.

    ### Localization
    Answer in the same language as the context.

    <context>
      $context$
    </context>

    **REMINDER: Generate EXACTLY ${cardsCount} flashcards.**
  `;

  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
