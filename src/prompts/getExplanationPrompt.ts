import formatter from 'src/services/formatter';

export const getExplanationPrompt = (highlightedText): string => {
  const prompt = ` 
<context>
  $context$
</context>

Student has highlighted following text from the document/book:
<highlighted_text>
${highlightedText}
</highlighted_text>

Suppose this is a conversation between a student (user) and a tutor (you the AI). In this conversation, the student is asking the tutor to explain a concept.
YOU MUST ANSWER IN THE SAME LANGUAGE AS THE HIGHLIGHTED TEXT.
Answer the student's question in a way that is helpful and easy to understand in the language of the context wether it is English, French, etc.
Use the page reference in format <page>[the page number]</page> to help user find the reference of your answer.
When referencing the page don't say the "page", say "see <page>[the page number]</page>" or "refer to <page>[the page number]</page>".

TO HELP YOU IDENTIFY THE CORRECT PAGE NUMBERS, EACH PAGE STARTS WITH "$$Start Of Page No [actualPageNo]$$" AND ENDS WITH "$$End Of Page No [actualPageNo]$$". YOU SHOULD USE THOSE TO IDENTIFY THE PAGE NUMBER FOR EACH SUMMARY.

Your answer in given nicely in plain text:
`;

  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
