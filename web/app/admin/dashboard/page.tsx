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
import { useI18n } from "@/lib/i18n"

export default function AdminDashboard() {
  const { t } = useI18n()
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
        else setError(t("admin.loadFailed"))
      }
    })()
  }, [t])

  const cards = stats
    ? [
        { label: t("admin.activeAddresses"), value: stats.active_addresses, sub: t("admin.totalAddressesSub", { n: stats.total_addresses }), icon: Users },
        { label: t("admin.totalEmails"), value: stats.total_emails, sub: t("admin.unreadSub", { n: stats.unread_emails }), icon: Mail },
        { label: t("admin.emails24h"), value: stats.emails_24h, sub: "", icon: Clock },
        { label: t("admin.attachmentsTotal"), value: stats.total_attachments, sub: "", icon: Paperclip },
        {
          label: t("admin.storageUsage"),
          value: formatBytesZh(stats.email_size_bytes + stats.attachment_size_bytes),
          sub: stats.max_storage_mb > 0 ? t("admin.storageCap", { n: stats.max_storage_mb }) : t("admin.storageNoCap"),
          icon: HardDrive,
        },
        {
          label: t("admin.uptime"),
          value: formatUptime(stats.uptime_seconds),
          sub: t("admin.lifetimeSub", { n: stats.address_lifetime_hours }),
          icon: Database,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.dashboard")}</h1>
        {stats && (
          <Badge variant={stats.db_ok ? "success" : "destructive"}>
            <Database className="h-3 w-3 mr-1" />
            {stats.db_ok ? t("admin.dbHealthy") : t("admin.dbError")}
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
            {t("admin.configuredDomains", { n: stats?.domains.length ?? 0 })}
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
              <span className="text-sm text-muted-foreground">{t("admin.noDomains")}</span>
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
                {t("admin.recentEmails")}
              </CardTitle>
              <Link href="/admin/emails" className="text-sm text-primary hover:underline">
                {t("admin.viewAll")}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentEmails.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">{t("admin.noEmails")}</p>
              )}
              {recentEmails.map((e) => (
                <div key={e.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{e.subject || t("admin.noSubject")}</span>
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
                {t("admin.recentAddresses")}
              </CardTitle>
              <Link href="/admin/addresses" className="text-sm text-primary hover:underline">
                {t("admin.viewAll")}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentAddresses.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground text-center">{t("admin.noAddresses")}</p>
              )}
              {recentAddresses.map((a) => (
                <div key={a.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium truncate">{a.email}</span>
                    {a.is_expired ? (
                      <Badge variant="outline" className="shrink-0">
                        {t("admin.expired")}
                      </Badge>
                    ) : (
                      <Badge variant="success" className="shrink-0">
                        {t("admin.active")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("admin.emailsCount", { n: a.email_count })} · {t("admin.createdSub", { time: formatDateTime(a.created_at) })}
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
