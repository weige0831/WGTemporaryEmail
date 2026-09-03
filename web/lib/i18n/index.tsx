"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { en, type Dict } from "./en"
import { zhCN } from "./zh-CN"
import { zhTW } from "./zh-TW"
import { ja } from "./ja"
import { ko } from "./ko"
import { es } from "./es"
import { fr } from "./fr"
import { de } from "./de"
import { pt } from "./pt"
import { ru } from "./ru"
import { ar } from "./ar"
import { hi } from "./hi"
import { it } from "./it"
import { tr } from "./tr"
import { id } from "./id"
import { vi } from "./vi"

// 语言注册表：语言代码 -> 词典（Partial 缺键时回退英文）
export const DICTS: Record<string, Partial<Dict>> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  es,
  fr,
  de,
  pt,
  ru,
  ar,
  hi,
  it,
  tr,
  id,
  vi,
}

// 语言列表（以各自母语显示）
export const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "it", name: "Italiano" },
  { code: "tr", name: "Türkçe" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "vi", name: "Tiếng Việt" },
]

// 需要 RTL 布局的语言
export const RTL_LANGUAGES = new Set(["ar"])

const STORAGE_KEY = "wgtempemail_lang"
const DEFAULT_LANG = "en"

function resolveLang(raw: string | null): string {
  if (raw && DICTS[raw]) return raw
  const nav = (raw || "").toLowerCase()
  if (nav.startsWith("zh")) {
    return nav.includes("tw") || nav.includes("hk") || nav.includes("mo") ? "zh-TW" : "zh-CN"
  }
  const base = nav.split("-")[0]
  if (base && DICTS[base]) return base
  return DEFAULT_LANG
}

function detectLang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return resolveLang(saved)
  } catch {
    // localStorage 不可用时忽略
  }
  return resolveLang(navigator.language || navigator.languages?.[0] || null)
}

function applyDocument(lang: string) {
  if (typeof document === "undefined") return
  document.documentElement.lang = lang
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? "rtl" : "ltr"
}

interface I18nContextValue {
  lang: string
  setLang: (code: string) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
})

function getValue(dict: Partial<Dict>, path: string): unknown {
  const parts = path.split(".")
  let node: unknown = dict
  for (const p of parts) {
    if (node && typeof node === "object") {
      node = (node as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return node
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<string>(DEFAULT_LANG)

  useEffect(() => {
    const detected = detectLang()
    setLangState(detected)
    applyDocument(detected)
  }, [])

  const setLang = useCallback((code: string) => {
    if (!DICTS[code]) return
    setLangState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // 忽略存储失败
    }
    applyDocument(code)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let value = getValue(DICTS[lang] ?? {}, key)
      if (typeof value !== "string") {
        value = getValue(en, key)
      }
      let s = typeof value === "string" ? value : key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v))
        }
      }
      return s
    },
    [lang],
  )

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
