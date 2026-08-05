import formatter from 'src/services/formatter';

export const getSummaryPrompt = (chapterNames: string[]) => {
  const contextTemplate = `
    Answer/Respond from this document/book/pdf/text:
    <context>$context$<context>
  `;

  const chapterNamesTemplate = `
    Summarize the following chapters in the exact same order and do not miss any,
    in JSON include objects for all even if you were unable to find the summary for some chapters:
    ${JSON.stringify(chapterNames)}
  `;

  const responseMustBeInJSON = `
    RESPONSE MUST BE A VALID JSON ARRAY OF OBJECTS WITH THE FOLLOWING FORMAT:
    [
      {{
        "heading": "Topic 1 or chapter one",
        "summary": "Three paragraphs, each containing at least three lines with a minimum of ten words per line. Answer in the language of the context wether it is English or French",
        "pageNumber": 1
      }},
      ...
    ]

    TO HELP YOU IDENTIFY THE CORRECT PAGE NUMBERS, EACH PAGE STARTS WITH "$$Start Of Page No [actualPageNo]$$" AND ENDS WITH "$$End Of Page No [actualPageNo]$$". YOU SHOULD USE THOSE TO IDENTIFY THE PAGE NUMBER FOR EACH SUMMARY.
  `;

  const finalPrompt = contextTemplate + chapterNamesTemplate + responseMustBeInJSON;

  return formatter.sanitizeTextForAI(finalPrompt).replace('$context$', '{context}');
};
