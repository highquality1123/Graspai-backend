import parseJSONFromAI from './methods/parseJSONFromAI';
import sanitizeTextForAI from './methods/sanitizeTextForAI';
import { birthYearToAge, timestampWithTimezone } from './methods/time';

const formatter = {
  dateToPostgresTimestampWithTimezone: timestampWithTimezone,
  birthYearToAge,
  sanitizeTextForAI,
  parseJSONFromAI,
};

export default formatter;
