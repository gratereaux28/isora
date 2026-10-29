import spanish from './locales/es.json';
import english from './locales/en.json';

export type Language = 'es' | 'en';
export type LanguageChoice = 'auto' | Language;
export type MessageKey = keyof typeof spanish;
export type MessageValues = Record<string, unknown>;
export type Translator = (key: MessageKey, values?: MessageValues) => string;
const catalogs: Record<Language, Record<MessageKey, string>> = {
  es: spanish,
  en: english,
};
const prefix = '@isora-message:';

export function resolveLanguage(
  choice: LanguageChoice = 'auto',
  hotel?: string,
): Language {
  if (choice === 'es' || choice === 'en') return choice;
  return hotel?.trim().toLowerCase() === 'game-es.habbo.com' ? 'es' : 'en';
}

// A language-neutral reference crosses IPC or stays in logs until it is displayed.
// User chat, names, outfits and protocol identifiers never enter this conversion.
export function messageRef(key: MessageKey, values?: MessageValues): string {
  return prefix + JSON.stringify({ key, values });
}
function interpolate(
  text: string,
  language: Language,
  values: MessageValues = {},
  depth = 0,
): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    if (!Object.hasOwn(values, key)) return placeholder;
    const value = values[key];
    return typeof value === 'string' && value.startsWith(prefix)
      ? display(value, language, depth + 1)
      : String(value ?? '');
  });
}
function display(value: string, language: Language, depth: number): string {
  if (depth > 12) return value;
  const diagnostic = /^(\[[^\]\n]+\] )(.*)$/s.exec(value);
  if (diagnostic)
    return diagnostic[1] + display(diagnostic[2], language, depth + 1);
  if (!value.startsWith(prefix)) return value;
  try {
    const reference = JSON.parse(value.slice(prefix.length));
    if (
      !reference ||
      typeof reference.key !== 'string' ||
      !Object.hasOwn(spanish, reference.key)
    )
      return value;
    if (
      reference.values !== undefined &&
      (!reference.values ||
        typeof reference.values !== 'object' ||
        Array.isArray(reference.values))
    )
      return value;
    return interpolate(
      catalogs[language][reference.key as MessageKey],
      language,
      reference.values,
      depth,
    );
  } catch {
    return value;
  }
}
export function formatMessage(value: string, language: Language): string {
  return display(value, language, 0);
}
export function translate(
  key: MessageKey,
  language: Language,
  values?: MessageValues,
): string {
  return interpolate(catalogs[language][key], language, values);
}
export const translator =
  (language: Language): Translator =>
  (key, values) =>
    translate(key, language, values);
