import ptBr from './pt-br'
import en from './en'
import es from './es'

const LANGS = { 'pt-br': ptBr, en, es } as const
type LangKey = keyof typeof LANGS

function getLang(): LangKey {
  const saved = localStorage.getItem('hpe_lang')
  if (saved && saved in LANGS) return saved as LangKey
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('pt')) return 'pt-br'
  if (nav.startsWith('es')) return 'es'
  return 'en'
}

let currentLang: LangKey = getLang()

export function setLang(lang: LangKey) {
  currentLang = lang
  localStorage.setItem('hpe_lang', lang)
}

export function getCurrentLang(): LangKey {
  return currentLang
}

const t = new Proxy({} as typeof ptBr, {
  get(_, key: string) {
    return (LANGS[currentLang] as any)[key] ?? (LANGS['pt-br'] as any)[key] ?? key
  }
})

export default t
export { LANGS, type LangKey }
