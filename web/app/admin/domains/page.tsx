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

export default function AdminDomains() {
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
      else setError("加载失败，请重试")
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
      setNotice(`已添加域名 ${domain}。API 立即生效，MX 收信服务约 15 秒内生效。`)
      await fetchDomains()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("添加失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (domain: string) => {
    if (!confirm(`确定移除域名 ${domain} 吗？该域名下现有地址的邮件仍保留，但 MX 将不再接收发往该域名的新邮件。`)) return
    setError("")
    setNotice("")
    try {
      const res = await adminApi.removeDomain(domain)
      setNotice(`已移除域名 ${res.removed}（受影响的地址 ${res.affected_addresses} 个）。`)
      await fetchDomains()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("移除失败，请重试")
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">域名管理</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">添加域名</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="例如 temp.example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="max-w-md font-mono"
            />
            <Button onClick={handleAdd} disabled={loading || !newDomain.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              添加
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            添加后需在 DNS 服务商处为该域名设置 MX 记录指向本服务器，否则无法收信。
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              已配置域名（{domains.length}）
            </CardTitle>
            <Button onClick={fetchDomains} variant="ghost" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">域名</th>
                <th className="p-3 font-medium">地址数</th>
                <th className="p-3 font-medium">邮件数</th>
                <th className="p-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    未配置域名
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
                      title={domains.length <= 1 ? "不能删除最后一个域名" : "移除域名"}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
