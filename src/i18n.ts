import i18n from 'i18next'
import type { TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import jaCommon from './locales/ja/common.json'
import jaScreens from './locales/ja/screens.json'
import jaLegal from './locales/ja/legal.json'
import jaHouseRules from './locales/ja/houseRules.json'

import enCommon from './locales/en/common.json'
import enScreens from './locales/en/screens.json'
import enLegal from './locales/en/legal.json'
import enHouseRules from './locales/en/houseRules.json'

import viCommon from './locales/vi/common.json'
import viScreens from './locales/vi/screens.json'
import viLegal from './locales/vi/legal.json'
import viHouseRules from './locales/vi/houseRules.json'

const ja = { ...jaCommon, ...jaScreens, ...jaLegal, ...jaHouseRules }
const en = { ...enCommon, ...enScreens, ...enLegal, ...enHouseRules }
const vi = { ...viCommon, ...viScreens, ...viLegal, ...viHouseRules }

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      vi: { translation: vi },
    },
    fallbackLng: 'ja',
    supportedLngs: ['ja', 'en', 'vi'],
    /** en-US などを en に寄せ、リソースキーと一致させる */
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  })

/** returnObjects で読む配列が欠損・フォールバック文字列のときに落ちないようにする */
export function translationStringArray(t: TFunction, key: string): string[] {
  const v = t(key, { returnObjects: true })
  return Array.isArray(v) ? (v as string[]) : []
}

export default i18n
