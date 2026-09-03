"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  Mail,
  Users,
  Globe,
  Settings,
  Trash2,
  LogOut,
  ExternalLink,
  ShieldCheck,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { getAdminToken, clearAdminToken, API_URL } from "@/lib/admin-api"

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/admin/emails", label: "邮件管理", icon: Mail },
  { href: "/admin/addresses", label: "地址管理", icon: Users },
  { href: "/admin/domains", label: "域名管理", icon: Globe },
  { href: "/admin/config", label: "系统配置", icon: Settings },
  { href: "/admin/cleanup", label: "数据清理", icon: Trash2 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  const isLoginPage = pathname === "/admin"

  useEffect(() => {
    ;(async () => {
      // 未完成首次初始化时，跳转到 /setup 向导
      try {
        const res = await fetch(`${API_URL}/api/v1/setup/status`)
        const data = await res.json()
        if (!data.initialized) {
          router.replace("/setup")
          return
        }
      } catch {
        // 后端不可达时按已初始化处理，避免管理面板完全不可用
      }

      if (isLoginPage) {
        setReady(true)
        return
      }
      if (!getAdminToken()) {
        router.replace("/admin")
      } else {
        setReady(true)
      }
    })()
  }, [pathname, isLoginPage, router])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边导航 */}
      <aside className="w-56 shrink-0 border-r flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-bold">管理面板</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t space-y-1">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            用户前端
          </Link>
          <button
            onClick={() => {
              clearAdminToken()
              router.replace("/admin")
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b h-14 flex items-center justify-end px-4 gap-2">
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
