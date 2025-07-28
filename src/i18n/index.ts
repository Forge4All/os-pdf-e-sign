import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/translation.json';
import ptBR from './locales/pt-BR/translation.json';
import de from './locales/de/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    resources: {
      en: {
        translation: en,
      },
      'pt-BR': {
        translation: ptBR,
      },
      de: {
        translation: de,
      },
      es: {
        translation: es,
      },
      fr: {
        translation: fr,
      },
    },
  });

export default i18n;
