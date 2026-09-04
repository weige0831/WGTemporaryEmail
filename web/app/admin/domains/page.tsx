"use client"

import { useEffect, useState } from "react"
import { Globe, Plus, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  adminApi,
  ApiError,
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
    fetchDomains()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain) return
    setLoading(true)
    setError("")
    setNotice("")
    try {
      await adminApi.addDomain(domain)
      setNewDomain("")
      setNotice(t("admin.domainAdded", { domain }))
      await fetchDomains()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.addFailed"))
    } finally {
      setLoading(false)
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
                <th className="p-3 font-medium text-right">{t("admin.actionsCol")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    {t("admin.noDomainsConfigured")}
                  </td>
                </tr>
              )}
              {domains.map((d) => (
                <tr key={d.domain} className="hover:bg-accent/50">
                  <td className="p-3 font-mono">{d.domain}</td>
                  <td className="p-3">{d.address_count}</td>
                  <td className="p-3">{d.email_count}</td>
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
