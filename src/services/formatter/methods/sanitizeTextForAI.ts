const sanitizeTextForAI = (input: string) => {
  let str = input;

  // First, replace the standalone curly brackets before manipulating spaces and other characters
  str = str.replace(/(?<!\{)\{(?!\{)|(?<!\})\}(?!\})/g, (match) =>
    match === '{' ? '{{' : '}}',
  );

  // Remove or replace problematic Unicode characters
  // This regex targets null characters and other control characters (\u0000-\u001F)
  str = str.replace(/[\u0000-\u001F]/g, ''); // Option to remove these characters

  // Now perform the other replacements
  str = str
    .replaceAll('. .', ' ')
    .replaceAll('.  .', ' ')
    .replaceAll('`', "'")
    .trim();

  return str;
};

export default sanitizeTextForAI;
