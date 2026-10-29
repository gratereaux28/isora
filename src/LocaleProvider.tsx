import { createContext, useContext, type ReactNode } from 'react';
import { translator, type Language } from './i18n';
const LanguageContext = createContext<Language>('en');
export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const language = useContext(LanguageContext);
  return { language, t: translator(language) };
}
