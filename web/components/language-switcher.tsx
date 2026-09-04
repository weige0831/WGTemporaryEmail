"use client"

import { Languages } from "lucide-react"
import { LANGUAGES, useI18n } from "@/lib/i18n"

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n()

  return (
    <div className="relative inline-flex items-center">
      <Languages className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground pointer-events-none absolute left-1.5" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Language"
        className="appearance-none rounded-md border border-input bg-background pl-6 sm:pl-8 pr-5 py-1 sm:py-1.5 text-xs sm:text-sm max-w-[104px] sm:max-w-[150px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>option]:text-foreground [&>option]:bg-background"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  )
}
