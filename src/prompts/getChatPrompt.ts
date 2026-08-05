import formatter from 'src/services/formatter';

export const getChatPrompt = async (
  question: string,
): Promise<string> => {
  const prompt =`
    Use the following context to answer the question at the end.

    Note: use only the provided context and chat history to answer.

    <context>
      $context$
    </context>

    Use the page reference in format <page>[the page number]</page> to help user find the reference of your answer.
    When referencing the page don't say the "page", say "see <page>[the page number]</page>" or "refer to <page>[the page number]</page>".
    TO HELP YOU IDENTIFY THE CORRECT PAGE NUMBERS, EACH PAGE STARTS WITH "$$Start Of Page No [actualPageNo]$$" AND ENDS WITH "$$End Of Page No [actualPageNo]$$". YOU SHOULD USE THOSE TO IDENTIFY THE PAGE NUMBER FOR EACH SUMMARY.

    $QUESTION: ` + question + `

    HELPFUL MARKDOWN ANSWER (IN THE SAME LANGUAGE AS OF THE $QUESTION):`;

  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
