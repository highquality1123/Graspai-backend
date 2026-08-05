const parseJSONFromAI = (jsonStr: string): any | false => {
  try {
    // Extract the JSON string from the jsonStr
    const jsonString = jsonStr.split('```json\n')[1].split('\n```')[0];

    // Try to parse the JSON string
    const parsedJson = JSON.parse(jsonString);

    return parsedJson;
  } catch (error) {
    try {
      const parsedJson = JSON.parse(jsonStr);
      return parsedJson;
    } catch (error) {
      console.log(
        '🚀 ~ parseJSONFromAI ~ jsonStr [string to parse was]:',
        jsonStr,
      );
      console.log('🚀 ~ parseJSONFromAI ~ error:', error);
      // If an error occurs during parsing, return false
      return false;
    }
  }
};

export default parseJSONFromAI;
