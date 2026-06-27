import { createI18n } from 'vue-i18n'
import en from './en.json'
import zh from './zh.json'

/** 整站默认语言（无 localStorage 记录时使用） */
export const DEFAULT_LOCALE = 'zh'

export function resolveStoredLocale() {
  const saved = localStorage.getItem('lang')
  return saved === 'en' || saved === 'zh' ? saved : DEFAULT_LOCALE
}

const initialLocale = resolveStoredLocale()

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en,
    zh
  }
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale === 'zh' ? 'zh-CN' : 'en'
}

export function setLanguage(lang) {
  i18n.global.locale.value = lang
  localStorage.setItem('lang', lang)
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

export default i18n