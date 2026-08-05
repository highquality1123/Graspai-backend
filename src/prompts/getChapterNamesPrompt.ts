import formatter from 'src/services/formatter';

export const getChapterNamesPrompt = (maxChaptersCount: number, language: string): string => {
  const languageName = language === 'fr' ? 'French' : 'English';
  const prompt = `
    <context>
      $context$
    </context>

    Extract and name up to ${maxChaptersCount} chapters from the given context in ${languageName}.

    Instructions:
    - Chapters may not be explicitly labeled but should be inferred from:
      * Major shifts in theme, location, or characters
      * Natural narrative breaks or new phases in the story
      * Transitions in topic or perspective
    - Use the **original language of the context** when naming each chapter.
    - Always include the **first and last chapters**
    - **Skip intermediate** chapters unless they are critical for understanding the narrative flow

    To help you identify positions:
    - Each page starts with: \`$$Start Of Page No [pageNumber]$$\`
    - Each page ends with: \`$$End Of Page No [pageNumber]$$\`
    - Time markers may appear as: \`$$Time [timestamp]$$\`

    Return structured chapter data based on the schema.
  `;

  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
