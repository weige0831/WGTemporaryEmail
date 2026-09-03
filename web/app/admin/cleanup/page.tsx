"use client"

import { useEffect, useState } from "react"
import { Trash2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminApi, ApiError, type AdminStats, formatBytesZh } from "@/lib/admin-api"

export default function AdminCleanup() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    deleted: number
    emails: number
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
    if (!confirm("立即执行过期地址清理？将删除所有已过期地址及其邮件。")) return
    setRunning(true)
    setError("")
    setResult(null)
    try {
      const res = await adminApi.runCleanup()
      setResult({
        deleted: res.deleted_addresses,
        emails: res.deleted_emails,
        before: res.storage_bytes_before,
        after: res.storage_bytes_after,
        at: new Date().toLocaleString("zh-CN"),
      })
      await fetchStats()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("清理失败，请重试")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">数据清理</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            手动清理过期地址
          </CardTitle>
          <CardDescription>
            系统会按配置的周期自动清理（当前每 {stats?.cleanup_interval_hours ?? "-"} 小时一次），
            清理内容包括：过期地址、以及超出总存储上限（{stats?.max_storage_mb ?? "-"} MB，0 为不限制）的最旧邮件。
            也可以在这里立即执行一次。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            当前共 {stats?.total_addresses ?? "-"} 个地址，其中活跃 {stats?.active_addresses ?? "-"} 个。
          </div>
          <Button onClick={handleRun} disabled={running} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            {running ? "清理中..." : "立即清理"}
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
                清理完成（{result.at}）
              </p>
              <ul className="text-xs text-muted-foreground pl-6 space-y-0.5">
                <li>删除过期地址：{result.deleted} 个</li>
                <li>因超出存储上限删除邮件：{result.emails} 封</li>
                <li>
                  存储占用：{formatBytesZh(result.before)} → {formatBytesZh(result.after)}
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
