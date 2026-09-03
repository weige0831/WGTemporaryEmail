"use client"

import { Languages } from "lucide-react"
import { LANGUAGES, useI18n } from "@/lib/i18n"

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n()

  return (
    <div className="relative inline-flex items-center">
      <Languages className="h-4 w-4 text-muted-foreground pointer-events-none absolute left-2" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Language"
        className="appearance-none rounded-md border border-input bg-background pl-8 pr-6 py-1.5 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>option]:text-foreground [&>option]:bg-background"
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
