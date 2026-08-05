/**
 * Quiz copy and Zod constraints must use the same true/false labels per document language.
 */
const TRUE_FALSE_BY_LANGUAGE: Record<string, [string, string]> = {
  en: ['True', 'False'],
  fr: ['Vrai', 'Faux'],
  it: ['Vero', 'Falso'],
  es: ['Verdadero', 'Falso'],
  de: ['Wahr', 'Falsch'],
  da: ['Sandt', 'Falsk'],
  pt: ['Verdadeiro', 'Falso'],
  nb: ['Sant', 'Usant'],
};

export function getTrueFalseLabels(language: string): [string, string] {
  const code = (language || 'en').trim().toLowerCase();
  return TRUE_FALSE_BY_LANGUAGE[code] ?? TRUE_FALSE_BY_LANGUAGE.en;
}

export function getQuizLanguageDisplayName(language: string): string {
  const code = (language || 'en').trim().toLowerCase();
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = displayNames.of(code);
    if (name && name.toLowerCase() !== code) {
      return name;
    }
  } catch {
    // fall through
  }
  return code.toUpperCase();
}
