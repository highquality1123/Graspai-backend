import formatter from 'src/services/formatter';

export const getChapterNamesForSummaryPrompt = (): string => {
  const prompt = `
    <context>
      $context$
    </context>

    Please extract the chapters from the given context.
    The chapters may not be explicitly labeled, but they can be identified by significant shifts in content, theme, or narrative structure.
    Look for natural breaks in the story or any notable transitions in topics, locations, or character focus.
    If the content suggests a chapter-like structure, such as a new phase in the narrative or a new perspective, consider it the beginning of a new chapter.
    
    YOU MUST GIVE NO MORE THAN 30 CHAPTERS, KEEP EDGE CHAPTERS, SKIP INTERMEDIATE.

    YOU MUST ONLY RESPOND IN THE FOLLOWING VALID JSON FORMAT:
    \`\`\`json
    ["Name of Chapter 1", "Name of Chapter 2", ...]
    \`\`\`
  `;
  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
