"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Users,
  Mail,
  Inbox,
  Clock,
  Paperclip,
  Database,
  Globe,
  HardDrive,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  adminApi,
  ApiError,
  type AdminStats,
  type AdminEmailSummary,
  type AdminAddressSummary,
  formatDateTime,
  formatBytesZh,
  formatUptime,
} from "@/lib/admin-api"

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [recentEmails, setRecentEmails] = useState<AdminEmailSummary[]>([])
  const [recentAddresses, setRecentAddresses] = useState<AdminAddressSummary[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    ;(async () => {
      try {
        const [s, emails, addresses] = await Promise.all([
          adminApi.getStats(),
          adminApi.listEmails({ page: 1, per_page: 5 }),
          adminApi.listAddresses({ page: 1, per_page: 5 }),
        ])
        setStats(s)
        setRecentEmails(emails.items)
        setRecentAddresses(addresses.items)
      } catch (e) {
        if (e instanceof ApiError) setError(e.message)
        else setError("加载失败，请重试")
      }
    })()
  }, [])

  const cards = stats
    ? [
        { label: "活跃地址", value: stats.active_addresses, sub: `共 ${stats.total_addresses} 个`, icon: Users },
        { label: "邮件总数", value: stats.total_emails, sub: `未读 ${stats.unread_emails}`, icon: Mail },
        { label: "近 24 小时邮件", value: stats.emails_24h, sub: "", icon: Clock },
        { label: "附件数量", value: stats.total_attachments, sub: "", icon: Paperclip },
        {
          label: "存储占用",
          value: formatBytesZh(stats.email_size_bytes + stats.attachment_size_bytes),
          sub:
            stats.max_storage_mb > 0
              ? `上限 ${stats.max_storage_mb} MB`
              : "未设上限",
          icon: HardDrive,
        },
        {
          label: "运行时长",
          value: formatUptime(stats.uptime_seconds),
          sub: `地址有效期 ${stats.address_lifetime_hours}h`,
          icon: Database,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        {stats && (
          <Badge variant={stats.db_ok ? "success" : "destructive"}>
            <Database className="h-3 w-3 mr-1" />
            数据库{stats.db_ok ? "正常" : "异常"}
          </Badge>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Icon className="h-4 w-4" />
                  {c.label}
                </div>
                <div className="text-2xl font-bold truncate">{c.value}</div>
                {c.sub && <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 域名 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            已配置域名（{stats?.domains.length ?? 0}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stats?.domains.map((d) => (
              <Badge key={d} variant="secondary" className="font-mono">
                {d}
              </Badge>
            ))}
            {stats && stats.domains.length === 0 && (
              <span className="text-sm text-muted-foreground">未配置域名</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 最近邮件 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                最近邮件
              </CardTitle>
              <Link href="/admin/emails" className="text-sm text-primary hover:underline">
                查看全部
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentEmails.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">暂无邮件</p>
              )}
              {recentEmails.map((e) => (
                <div key={e.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{e.subject || "（无主题）"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(e.received_at)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {e.from_address} → {e.addresses.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 最近地址 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                最近地址
              </CardTitle>
              <Link href="/admin/addresses" className="text-sm text-primary hover:underline">
                查看全部
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentAddresses.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">暂无地址</p>
              )}
              {recentAddresses.map((a) => (
                <div key={a.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium truncate">{a.email}</span>
                    {a.is_expired ? (
                      <Badge variant="outline" className="shrink-0">
                        已过期
                      </Badge>
                    ) : (
                      <Badge variant="success" className="shrink-0">
                        活跃
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    邮件 {a.email_count} 封 · 创建于 {formatDateTime(a.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
