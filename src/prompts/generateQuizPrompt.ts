import formatter from 'src/services/formatter';
import { getQuizLanguageDisplayName, getTrueFalseLabels } from 'src/modules/quiz/quizLanguage';

const difficultyLevelMap = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
  mixed: 'a mix of easy, medium, and hard',
};

const questionTypeMap = {
  multiple_choice: 'multiple_choice',
  true_false: 'true_false',
  mixed: 'a mix of multiple_choice and true_false',
};

export const generateQuizPrompt = async ({
  query,
  questionsCount,
  difficultyLevel,
  questionsType,
  language,
  previousQuestions = []
}): Promise<string> => {
  const [trueLabel, falseLabel] = getTrueFalseLabels(language);
  const trueFalseOptions = `['${trueLabel}', '${falseLabel}']`;
  const languageName = getQuizLanguageDisplayName(language);
  const trueFalseOptionsDescription = `${trueLabel} / ${falseLabel}`;
  const trueFalseBlock = `
    **true_false Questions**
    - The \`questionType\` field MUST be exactly: "true_false" (lowercase with underscore, not "True/False")
    - Use exactly the options: ${trueFalseOptions}
    - Ensure a balanced number of true and false statements across the quiz.
    - The statement must be unambiguously true or false based on the context.
    - Vary the position of the correct answer across questions.
  `;
  const multipleChoiseBlock = `
    **multiple_choice Questions**
    - The \`questionType\` field MUST be exactly: "multiple_choice" (lowercase with underscore)
    - Provide 4 total options per question.
    - Include **exactly one correct answer**; all other options must be plausible distractors.

    **Creating Plausible Distractors:**
    Distractors are incorrect answers that appear reasonable and test true understanding. Good distractors:
    1. **Sound believable**: Use terminology and concepts from the context that relate to the topic
    2. **Are specific and detailed**: Avoid vague options like "none of the above" or "all of the above"
    3. **Represent common misconceptions**: Include answers students might choose if they misunderstood the material
    4. **Are parallel in structure**: Match the grammatical form and length of the correct answer
    5. **Don't contain absolute words**: Avoid "always," "never," "all," "none" which often signal wrong answers
    6. **Are logically distinct**: Each distractor should represent a different incorrect concept
    7. **Use similar complexity**: Match the detail level of the correct answer

    Examples of GOOD distractors:
    - If the correct answer is "Mitochondria produce ATP through cellular respiration," good distractors would be:
      ✓ "Mitochondria store ATP produced by the nucleus"
      ✓ "Mitochondria convert glucose directly into energy without oxygen"
      ✓ "Mitochondria synthesize proteins for energy production"

    Examples of BAD distractors:
    - ✗ "None of the above" (too vague)
    - ✗ "Mitochondria do nothing" (obviously wrong)
    - ✗ "Something else" (not specific)

    - Randomize the order of answers.
  `;
  let questionTypeBlocks;
  let mixedInstructions = '';

  if (questionsType === 'mixed') {
    questionTypeBlocks = trueFalseBlock + multipleChoiseBlock;
    mixedInstructions = `
    **IMPORTANT - MIXED QUESTION TYPE DISTRIBUTION:**
    Since questionType is "mixed", you MUST create a BALANCED MIX of both question types:
    - Approximately 50% should be "multiple_choice" questions (with 4 options each)
    - Approximately 50% should be "true_false" questions (options must be exactly the two labels: ${trueFalseOptionsDescription})
    - ALTERNATE between question types to ensure variety (e.g., multiple_choice, true_false, multiple_choice, true_false...)
    - Do NOT generate only one type - both types MUST be present in the quiz
    - If generating ${questionsCount} questions, aim for ${Math.ceil(questionsCount / 2)} of each type
    `;
  }
  else if (questionsType === 'true_false') {
    questionTypeBlocks = trueFalseBlock;
  }
  else {
    questionTypeBlocks = multipleChoiseBlock;
  }

  let previousQuestionsBlock = '';
  if (previousQuestions.length > 0) {
    const questionsList = previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    previousQuestionsBlock = `
    ### Previously Generated Questions (DO NOT DUPLICATE)
    The following questions have already been generated. You MUST NOT generate any question that is similar or duplicate to these:

${questionsList}

    **IMPORTANT**: Generate exactly ${questionsCount} NEW questions that are completely different from the above list.
    `;
  }

  const prompt = `
    You are an expert quiz generator. Your task is to create a quiz strictly based on the provided context and user query.

    ### Quiz Parameters
    - Number of questions: ${questionsCount}
    - \`difficultyLevel\`: ${difficultyLevelMap[difficultyLevel]}
    - \`questionType\`: ${questionTypeMap[questionsType]}
    - Language: ${languageName}
${previousQuestionsBlock}
${mixedInstructions}

    ### Question Generation Guidelines

    **General**
    - All content must be derived from the provided context.
    - Ensure clarity, grammatical correctness, and factual accuracy.
    - Use page markers in the format \`$$Start Of Page No [n]$$\` and \`$$End Of Page No [n]$$\` to understand where information comes from.
    - Ensure exactly ${questionsCount} valid and distinct questions.
    - correctAnswer must be **exactly the same** as one of the options.

    **CRITICAL FORMAT REQUIREMENTS:**
    - \`questionType\` must be EXACTLY "true_false" or "multiple_choice" (lowercase with underscore)
    - \`difficultyLevel\` must be EXACTLY "easy", "medium", or "hard" (lowercase only) - distribute evenly across questions
    - Do NOT use "True/False", "True-False", or any other variation for questionType
    - If questionType parameter is "mixed", you MUST generate BOTH multiple_choice AND true_false questions (not just one type)
    - ALL 8 required fields must be present in each question: question, correctAnswer, pageNumber, questionType, options, difficultyLevel, explanation, citation
    - Ensure ALL fields are at the ROOT level of each question object, NOT nested inside options array
    - Ensure valid JSON syntax with proper closing brackets and commas
    - The \`options\` field must ONLY contain the answer choices as strings, nothing else
    - For multiple_choice: options array must have exactly 4 items
    - For true_false: options array must have exactly 2 items (${trueFalseOptions})

    ${questionTypeBlocks}

    ### Output Structure
    Each question must follow this EXACT structure (do not deviate):

    For multiple_choice:
    {
      "question": "question text here",
      "correctAnswer": "exact matching option",
      "pageNumber": number,
      "questionType": "multiple_choice",
      "options": ["option1", "option2", "option3", "option4"],
      "difficultyLevel": "easy" or "medium" or "hard",
      "explanation": "explanation text",
      "citation": "exact quote from document"
    }

    For true_false:
    {
      "question": "question text here",
      "correctAnswer": "${trueLabel} or ${falseLabel}",
      "pageNumber": number,
      "questionType": "true_false",
      "options": ${trueFalseOptions},
      "difficultyLevel": "easy" or "medium" or "hard",
      "explanation": "explanation text",
      "citation": "exact quote from document"
    }

    ### User Query
    "${formatter.sanitizeTextForAI(query)}"

    <context>
      $context$
    </context>
`;

  return formatter.sanitizeTextForAI(prompt).replace('$context$', '{context}');
};
