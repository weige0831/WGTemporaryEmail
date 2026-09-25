"use client"

import { useEffect, useState } from "react"
import { Globe, Plus, Trash2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  adminApi,
  ApiError,
  type DomainCheck,
  type DomainStats,
} from "@/lib/admin-api"
import { useI18n } from "@/lib/i18n"

export default function AdminDomains() {
  const { t } = useI18n()
  const [domains, setDomains] = useState<DomainStats[]>([])
  const [newDomain, setNewDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  // MX 记录检查结果：域名加了但 DNS 没指过来时，邮件会静默丢失，
  // 所以这里把检查结果直接摆在操作者面前。
  const [checks, setChecks] = useState<Record<string, DomainCheck>>({})
  const [checking, setChecking] = useState<string>("")

  const fetchDomains = async () => {
    setError("")
    try {
      const res = await adminApi.listDomains()
      setDomains(res.domains)
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.loadFailed"))
    }
  }

  useEffect(() => {
    fetchDomains().then(() => {
      // 首次加载时顺带检查已配置域名的 MX 记录
      adminApi
        .listDomains()
        .then((res) => res.domains.forEach((d) => runCheck(d.domain)))
        .catch(() => {
          // 忽略：DNS 检查失败不影响域名管理
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain) return
    setLoading(true)
    setError("")
    setNotice("")
    try {
      const res = await adminApi.addDomain(domain)
      setNewDomain("")
      setNotice(t("admin.domainAdded", { domain }))
      if (res.check) {
        setChecks((prev) => ({ ...prev, [domain]: res.check as DomainCheck }))
      } else {
        runCheck(domain)
      }
      await fetchDomains()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.addFailed"))
    } finally {
      setLoading(false)
    }
  }

  const runCheck = async (domain: string) => {
    setChecking(domain)
    try {
      const result = await adminApi.checkDomain(domain)
      setChecks((prev) => ({ ...prev, [domain]: result }))
    } catch {
      // 检查失败不阻塞页面，保留上一次结果
    } finally {
      setChecking("")
    }
  }

  const handleRemove = async (domain: string) => {
    if (!confirm(t("admin.removeDomainConfirm", { domain }))) return
    setError("")
    setNotice("")
    try {
      const res = await adminApi.removeDomain(domain)
      setNotice(t("admin.domainRemoved", { domain: res.removed, n: res.affected_addresses }))
      await fetchDomains()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.removeFailed"))
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">{t("admin.domainsTitle")}</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.addDomain")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder={t("admin.addDomainPlaceholder")}
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="max-w-md font-mono"
            />
            <Button onClick={handleAdd} disabled={loading || !newDomain.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {t("admin.add")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t("admin.domainDnsHint")}</p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("admin.configuredDomainsTitle", { n: domains.length })}
            </CardTitle>
            <Button onClick={fetchDomains} variant="ghost" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">{t("admin.domainCol")}</th>
                <th className="p-3 font-medium">{t("admin.addressCountCol")}</th>
                <th className="p-3 font-medium">{t("admin.emailCountCol")}</th>
                <th className="p-3 font-medium">{t("admin.dnsCol")}</th>
                <th className="p-3 font-medium text-right">{t("admin.actionsCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {t("admin.noDomainsConfigured")}
                  </td>
                </tr>
              )}
              {domains.map((d) => (
                <tr key={d.domain} className="hover:bg-accent/50">
                  <td className="p-3 font-mono">{d.domain}</td>
                  <td className="p-3">{d.address_count}</td>
                  <td className="p-3">{d.email_count}</td>
                  <td className="p-3">
                    <DnsStatus
                      check={checks[d.domain]}
                      checking={checking === d.domain}
                      onCheck={() => runCheck(d.domain)}
                      t={t}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={domains.length <= 1}
                      onClick={() => handleRemove(d.domain)}
                      title={domains.length <= 1 ? t("admin.cannotRemoveLast") : t("admin.removeDomain")}
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
    </div>
  )
}

// 每个域名的 MX 记录状态：正确 / 未指向本机 / 无记录 / 查询失败，均可手动复查。
function DnsStatus({
  check,
  checking,
  onCheck,
  t,
}: {
  check?: DomainCheck
  checking: boolean
  onCheck: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        {t("admin.dnsChecking")}
      </span>
    )
  }
  if (!check) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCheck}>
        {t("admin.dnsCheck")}
      </Button>
    )
  }
  if (check.error) {
    return (
      <button onClick={onCheck} className="inline-flex items-center gap-1 text-xs text-destructive text-left">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {t("admin.dnsError", { err: check.error })}
      </button>
    )
  }
  if (check.matches) {
    return (
      <button onClick={onCheck} className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 text-left">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        {t("admin.dnsOk", { host: check.expected })}
      </button>
    )
  }
  const found = check.records.length ? check.records.join(", ") : t("admin.dnsNone")
  return (
    <button onClick={onCheck} className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 text-left">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {t("admin.dnsMismatch", { found, expected: check.expected })}
    </button>
  )
}
