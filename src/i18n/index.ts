import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zh from './zh.json';
import en from './en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    fallbackLng: 'zh',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'openclaw-language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
