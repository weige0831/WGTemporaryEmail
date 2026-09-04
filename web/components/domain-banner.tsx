"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { useI18n } from "@/lib/i18n"

const DISMISS_KEY = "wgtempemail_domain_banner_dismissed"

// 域名引导横幅：当用户通过非正式域名（MX 主机名、IP 等）访问时，
// 顶部提示切换到配置的面板访问域名。
export function DomainBanner({ webHostname }: { webHostname: string }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!webHostname) return
    const target = webHostname.toLowerCase()
    const current = (window.location.hostname || "").toLowerCase()
    if (current === target) return
    try {
      if (localStorage.getItem(DISMISS_KEY) === target) return
    } catch {
      // localStorage 不可用时忽略
    }
    setVisible(true)
  }, [webHostname])

  if (!visible) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, webHostname.toLowerCase())
    } catch {
      // 忽略存储失败
    }
    setVisible(false)
  }

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-100">
      <div className="container mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs sm:text-sm">
        <p className="truncate">
          {t("banner.text", { host: window.location.hostname })}{" "}
          <a href={`https://${webHostname}/`} className="font-semibold underline break-all">
            https://{webHostname}/
          </a>
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a href={`https://${webHostname}/`} className="inline-flex items-center gap-1 font-semibold hover:underline whitespace-nowrap">
            {t("banner.goto")}
          </a>
          <button
            onClick={dismiss}
            aria-label={t("banner.dismiss")}
            title={t("banner.dismiss")}
            className="hover:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
