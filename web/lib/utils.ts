import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import DOMPurify from "dompurify"
import { currentLang } from "@/lib/i18n"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sanitize untrusted email HTML before rendering it inside an iframe.
// DOMPurify strips scripts, event handlers, and other active content.
export function sanitizeHtml(html: string): string {
  if (!html) return ""
  if (typeof window === "undefined") {
    // DOMPurify has no DOM on the server; every call site is a client
    // component, so this only fires if one is ever rendered server-side.
    console.warn("sanitizeHtml called without a DOM - returning empty content")
    return ""
  }
  try {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  } catch (e) {
    console.warn("Failed to sanitize email HTML", e)
    return ""
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Localized relative time ("5 minutes ago" / "5分钟前" / "5分前") via Intl,
// so every one of the supported languages is covered without extra keys.
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  try {
    const rtf = new Intl.RelativeTimeFormat(currentLang(), { numeric: 'auto' })
    if (diffMins < 1) return rtf.format(0, 'minute')
    if (diffMins < 60) return rtf.format(-diffMins, 'minute')
    if (diffHours < 24) return rtf.format(-diffHours, 'hour')
    if (diffDays < 7) return rtf.format(-diffDays, 'day')
  } catch {
    // Intl 不可用时回退到本地日期
  }

  return past.toLocaleDateString(currentLang())
}

export async function copyToClipboard(text: string): Promise<void> {
  // Clipboard API 只在安全上下文（HTTPS/localhost）可用；HTTP 部署时回退到
  // execCommand("copy") 兼容路径，保证复制功能在所有环境可用。
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // 继续走兼容路径
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "-9999px"
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const prevRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }

  document.body.removeChild(textarea)
  if (prevRange && selection) {
    selection.removeAllRanges()
    selection.addRange(prevRange)
  }

  if (!ok) throw new Error("Copy failed")
}
