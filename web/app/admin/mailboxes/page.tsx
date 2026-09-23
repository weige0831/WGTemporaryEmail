"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Inbox, KeyRound, RefreshCw, Search, Trash2, UserPlus, Eraser, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  adminApi,
  ApiError,
  type AdminPermanentAddressList,
  type AdminPermanentStats,
  type AdminPermanentCreated,
} from "@/lib/admin-api"
import { copyToClipboard } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const PER_PAGE = 20

export default function AdminMailboxes() {
  const { t } = useI18n()
  const [stats, setStats] = useState<AdminPermanentStats | null>(null)
  const [data, setData] = useState<AdminPermanentAddressList | null>(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  // 创建表单
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [domains, setDomains] = useState<string[]>([])
  const [created, setCreated] = useState<AdminPermanentCreated | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchStats = async () => {
    try {
      setStats(await adminApi.getPermanentStats())
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    }
  }

  const fetchList = async (p = page, q = search) => {
    setLoading(true)
    setError("")
    try {
      setData(await adminApi.listPermanentAddresses({ page: p, per_page: PER_PAGE, search: q || undefined }))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchList()
    adminApi
      .listDomains()
      .then((d) => {
        const names = (d.domains || []).map((x) => x.domain)
        setDomains(names)
        if (names.length) setDomain((prev) => prev || names[0])
      })
      .catch(() => {
        // 域名列表拿不到时保留手填输入框
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doSearch = () => {
    setSearch(searchInput)
    setPage(1)
    fetchList(1, searchInput)
  }

  const handleCreate = async () => {
    setError("")
    setNotice("")
    if (!username.trim()) {
      setError(t("admin.mbNeedUsername"))
      return
    }
    setBusy(true)
    try {
      const res = await adminApi.createPermanentAddress(username.trim(), domain || undefined)
      setCreated(res)
      setUsername("")
      fetchStats()
      fetchList(1, search)
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handlePurge = async (id: string, email: string) => {
    if (!confirm(t("admin.mbPurgeConfirm", { email }))) return
    setError("")
    setNotice("")
    try {
      const res = await adminApi.purgePermanentEmails(id)
      setNotice(t("admin.mbPurged", { n: res.deleted_emails, email: res.email }))
      fetchStats()
      fetchList()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    }
  }

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(t("admin.mbDeleteConfirm", { email }))) return
    setError("")
    setNotice("")
    try {
      await adminApi.deleteAddress(id)
      setNotice(t("admin.mbDeleted", { email }))
      fetchStats()
      fetchList()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    }
  }

  const handleRunRetention = async () => {
    setError("")
    setNotice("")
    try {
      const res = await adminApi.runPermanentRetention()
      setNotice(t("admin.mbRetentionRan", { n: res.retention_deleted_emails }))
      fetchStats()
      fetchList()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
    }
  }

  const copyToken = async (token: string) => {
    try {
      await copyToClipboard(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略复制失败
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          {t("admin.mbTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("admin.mbDesc")}</p>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}
      {notice && <p className="text-sm text-primary bg-primary/10 rounded-md p-3">{notice}</p>}

      {/* 概览 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("admin.mbTotal")}</CardDescription>
            <CardTitle className="text-2xl">{stats ? stats.total : "-"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats && stats.max_allowed > 0
              ? t("admin.mbCap", { n: stats.max_allowed })
              : t("admin.mbCapUnlimited")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("admin.mbEmails")}</CardDescription>
            <CardTitle className="text-2xl">{stats ? stats.total_emails : "-"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats ? t("admin.mbUnreadSub", { n: stats.unread_emails }) : ""}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("admin.mbStorage")}</CardDescription>
            <CardTitle className="text-2xl">
              {stats ? `${(stats.size_bytes / 1024).toFixed(1)} KB` : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats ? t("admin.mbWithEmails", { n: stats.with_emails }) : ""}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("admin.mbRetentionTitle")}</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {stats ? t("admin.mbRetentionDays", { n: stats.retention_days }) : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" onClick={handleRunRetention} className="h-7 text-xs">
              <Eraser className="h-3.5 w-3.5 mr-1" />
              {t("admin.mbRunRetention")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 创建 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            {t("admin.mbCreateTitle")}
          </CardTitle>
          <CardDescription>{t("admin.mbCreateDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={t("admin.mbUsernamePlaceholder")}
              className="font-mono"
            />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">@</span>
              {domains.length > 0 ? (
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder={t("admin.mbDomainPlaceholder")}
                  className="font-mono"
                />
              )}
              <Button onClick={handleCreate} disabled={busy} className="shrink-0">
                {busy ? t("admin.mbCreating") : t("admin.mbCreateBtn")}
              </Button>
            </div>
          </div>
          {created && (
            <div className="border rounded-md p-3 space-y-2 bg-primary/5">
              <p className="text-sm font-semibold">{t("admin.mbCreated", { email: created.email })}</p>
              <p className="text-xs text-destructive">{t("admin.mbCreatedNote")}</p>
              <div className="flex gap-2">
                <Input value={created.token} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => copyToken(created.token)} className="shrink-0">
                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                  {copied ? t("admin.mbCopied") : t("admin.mbCopyToken")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base mr-auto">{t("admin.mbListTitle", { n: data?.total ?? 0 })}</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => { fetchStats(); fetchList() }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Link href="/admin/emails" className="text-xs text-muted-foreground hover:text-foreground">
              {t("admin.viewInEmails")}
            </Link>
          </div>
          <div className="flex gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder={t("admin.mbSearchPlaceholder")}
                className="pl-8"
              />
            </div>
            <Button variant="outline" onClick={doSearch}>
              {t("admin.search")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">{t("admin.emailCol")}</th>
                  <th className="text-left p-3 font-medium">{t("admin.emailCountCol")}</th>
                  <th className="text-left p-3 font-medium">{t("admin.unreadCol")}</th>
                  <th className="text-left p-3 font-medium">{t("admin.mbSizeCol")}</th>
                  <th className="text-left p-3 font-medium">{t("admin.createdCol")}</th>
                  <th className="text-left p-3 font-medium">{t("admin.mbLastEmailCol")}</th>
                  <th className="text-right p-3 font-medium">{t("admin.actionsCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      {t("admin.mbNoMailboxes")}
                    </td>
                  </tr>
                )}
                {data?.items.map((m) => (
                  <tr key={m.id} className="hover:bg-accent/50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono max-w-[240px] truncate">{m.email}</span>
                        <Badge variant="default" className="shrink-0 text-xs">
                          {t("admin.permanent")}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-3">{m.email_count}</td>
                    <td className="p-3">
                      {m.unread_count > 0 ? <Badge variant="default">{m.unread_count}</Badge> : "0"}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {m.size_bytes > 1024 ? `${(m.size_bytes / 1024).toFixed(1)} KB` : `${m.size_bytes} B`}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{formatDate(m.created_at)}</td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {m.last_email_at ? formatDate(m.last_email_at) : t("admin.mbNever")}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePurge(m.id, m.email)}
                        title={t("admin.mbPurgeEmails")}
                      >
                        <Eraser className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(m.id, m.email)}
                        title={t("admin.mbDelete")}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("admin.totalItems", { n: data.total })} ·{" "}
            {t("admin.pageOf", { p: data.page, n: Math.max(1, Math.ceil(data.total / PER_PAGE)) })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1
                setPage(p)
                fetchList(p)
              }}
            >
              {t("admin.prev")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.has_next}
              onClick={() => {
                const p = page + 1
                setPage(p)
                fetchList(p)
              }}
            >
              {t("admin.next")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.mbCreatedDialogTitle")}</DialogTitle>
            <DialogDescription>{t("admin.mbCreatedNote")}</DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-3 text-sm">
              <p className="font-mono break-all">{created.email}</p>
              <div className="flex gap-2">
                <Input value={created.token} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={() => copyToken(created.token)} className="shrink-0">
                  {copied ? t("admin.mbCopied") : t("admin.mbCopyToken")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "-"
  const d = new Date(value)
  return isNaN(d.getTime()) ? "-" : d.toLocaleString()
}
