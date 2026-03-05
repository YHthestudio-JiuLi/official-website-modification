import { createI18n } from 'vue-i18n'
import en from './en.json'
import zh from './zh.json'

const savedLang = localStorage.getItem('lang') || 'en'

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'en',
  messages: {
    en,
    zh
  }
})

export function setLanguage(lang) {
  i18n.global.locale.value = lang
  localStorage.setItem('lang', lang)
  document.documentElement.lang = lang
}

export default i18n