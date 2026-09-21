"use client"

import { useEffect, useState } from "react"
import { Trash2, CheckCircle2, AlertCircle, Mail, FileText, HardDrive, Package, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminApi, ApiError, type AdminStats, formatBytesZh } from "@/lib/admin-api"
import { useI18n } from "@/lib/i18n"

export default function AdminCleanup() {
  const { t } = useI18n()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    deleted: number
    emails: number
    retention: number
    before: number
    after: number
    at: string
  } | null>(null)
  const [error, setError] = useState("")

  const fetchStats = async () => {
    try {
      setStats(await adminApi.getStats())
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    }
  }

  useEffect(() => {
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRun = async () => {
    if (!confirm(t("admin.cleanupConfirm"))) return
    setRunning(true)
    setError("")
    setResult(null)
    try {
      const res = await adminApi.runCleanup()
      setResult({
        deleted: res.deleted_addresses,
        emails: res.deleted_emails,
        retention: res.retention_deleted_emails,
        before: res.storage_bytes_before,
        after: res.storage_bytes_after,
        at: new Date().toLocaleString(),
      })
      await fetchStats()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.cleanupFailed"))
    } finally {
      setRunning(false)
    }
  }

  // 自动清理机制清单
  const autoItems = [
    {
      icon: Mail,
      text: t("admin.autoCleanupMail", {
        h: stats?.cleanup_interval_hours ?? "-",
        m: stats?.max_storage_mb ?? "-",
      }),
    },
    { icon: FileText, text: t("admin.autoCleanupLogs") },
    { icon: Mail, text: t("admin.autoCleanupRetention", { d: stats?.permanent_email_retention_days ?? 30 }) },
    { icon: HardDrive, text: t("admin.autoCleanupBuild") },
    { icon: Package, text: t("admin.autoCleanupApt") },
    { icon: ScrollText, text: t("admin.autoCleanupJournald") },
  ]

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold">{t("admin.cleanupTitle")}</h1>

      {/* 自动清理机制总览 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.autoCleanupTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {autoItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.text} className="flex items-start gap-2 text-sm">
                  <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item.text}</span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* 手动清理 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            {t("admin.cleanupCardTitle")}
          </CardTitle>
          <CardDescription>
            {t("admin.cleanupDesc", {
              h: stats?.cleanup_interval_hours ?? "-",
              m: stats?.max_storage_mb ?? "-",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("admin.currentAddresses", {
              total: stats?.total_addresses ?? "-",
              active: stats?.active_addresses ?? "-",
            })}
          </div>
          <Button onClick={handleRun} disabled={running} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            {running ? t("admin.cleaning") : t("admin.runNow")}
          </Button>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
          {result && (
            <div className="text-sm text-primary space-y-1">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t("admin.cleanupDone", { time: result.at })}
              </p>
              <ul className="text-xs text-muted-foreground pl-6 space-y-0.5">
                <li>{t("admin.deletedAddresses", { n: result.deleted })}</li>
                <li>{t("admin.deletedEmails", { n: result.emails })}</li>
                {result.retention > 0 && (
                  <li>{t("admin.retentionDeletedEmails", { n: result.retention })}</li>
                )}
                <li>
                  {t("admin.storageChanged", {
                    a: formatBytesZh(result.before),
                    b: formatBytesZh(result.after),
                  })}
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
