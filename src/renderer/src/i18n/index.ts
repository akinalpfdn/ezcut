import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import tr from './locales/tr.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['tr', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: SupportedLanguage = 'tr'

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en }
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n
