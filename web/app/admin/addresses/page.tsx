"use client"

import { useEffect, useState } from "react"
import { Search, Trash2, Eye, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
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
  type AdminAddressList,
  type AdminAddressDetail,
  formatDateTime,
} from "@/lib/admin-api"

const PER_PAGE = 20

export default function AdminAddresses() {
  const [data, setData] = useState<AdminAddressList | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [detail, setDetail] = useState<AdminAddressDetail | null>(null)

  const fetchAddresses = async (p = page, q = search) => {
    setLoading(true)
    setError("")
    try {
      const res = await adminApi.listAddresses({ page: p, per_page: PER_PAGE, search: q || undefined })
      setData(res)
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAddresses(1, "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    setPage(1)
    setSearch(searchInput)
    fetchAddresses(1, searchInput)
  }

  const handleView = async (id: string) => {
    try {
      setDetail(await adminApi.getAddress(id))
    } catch (e) {
      if (e instanceof ApiError) alert(e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该地址吗？其下所有邮件也会一并删除，此操作不可恢复。")) return
    try {
      await adminApi.deleteAddress(id)
      setDetail(null)
      fetchAddresses()
    } catch (e) {
      if (e instanceof ApiError) alert(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">地址管理</h1>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索邮箱地址"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8"
          />
        </div>
        <Button onClick={handleSearch} variant="outline">
          搜索
        </Button>
        <Button onClick={() => fetchAddresses()} variant="ghost" size="icon" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">邮箱地址</th>
                <th className="p-3 font-medium">状态</th>
                <th className="p-3 font-medium">邮件数</th>
                <th className="p-3 font-medium">未读</th>
                <th className="p-3 font-medium">创建时间</th>
                <th className="p-3 font-medium">过期时间</th>
                <th className="p-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    暂无地址
                  </td>
                </tr>
              )}
              {data?.items.map((a) => (
                <tr key={a.id} className="hover:bg-accent/50">
                  <td className="p-3 font-mono max-w-[260px] truncate">{a.email}</td>
                  <td className="p-3">
                    {a.is_expired ? (
                      <Badge variant="outline">已过期</Badge>
                    ) : (
                      <Badge variant="success">活跃</Badge>
                    )}
                  </td>
                  <td className="p-3">{a.email_count}</td>
                  <td className="p-3">
                    {a.unread_count > 0 ? (
                      <Badge variant="default">{a.unread_count}</Badge>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(a.expires_at)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => handleView(a.id)}>
                      <Eye className="h-4 w-4 mr-1" />
                      查看
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            共 {data.total} 个 · 第 {data.page} 页 / {Math.max(1, Math.ceil(data.total / PER_PAGE))} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1
                setPage(p)
                fetchAddresses(p)
              }}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.has_next}
              onClick={() => {
                const p = page + 1
                setPage(p)
                fetchAddresses(p)
              }}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{detail?.email}</DialogTitle>
            <DialogDescription>
              创建于 {detail && formatDateTime(detail.created_at)} · 过期于{" "}
              {detail && formatDateTime(detail.expires_at)}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                {detail.is_expired ? (
                  <Badge variant="outline">已过期</Badge>
                ) : (
                  <Badge variant="success">活跃</Badge>
                )}
                <span className="text-muted-foreground">共 {detail.emails.length} 封邮件</span>
              </div>

              <div className="divide-y border rounded-md max-h-[320px] overflow-y-auto">
                {detail.emails.length === 0 && (
                  <p className="p-4 text-center text-muted-foreground">暂无邮件</p>
                )}
                {detail.emails.map((e) => (
                  <div key={e.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.subject || "（无主题）"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.from_address} · {formatDateTime(e.received_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!e.is_read && <Badge variant="default">新</Badge>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => (window.location.href = "/admin/emails")}
                      >
                        在邮件管理中查看
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(detail.id)}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除该地址及其所有邮件
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
