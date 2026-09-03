import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import DOMPurify from "dompurify"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sanitize untrusted email HTML before rendering it inside an iframe.
// DOMPurify strips scripts, event handlers, and other active content.
export function sanitizeHtml(html: string): string {
  if (!html) return ""
  try {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  } catch {
    return ""
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return past.toLocaleDateString()
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
