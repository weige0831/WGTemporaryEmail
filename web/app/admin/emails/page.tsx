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
  type AdminEmailList,
  type AdminEmailDetail,
  formatDateTime,
  formatBytesZh,
} from "@/lib/admin-api"
import { sanitizeHtml } from "@/lib/utils"

const PER_PAGE = 20

export default function AdminEmails() {
  const [data, setData] = useState<AdminEmailList | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [detail, setDetail] = useState<AdminEmailDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchEmails = async (p = page, q = search) => {
    setLoading(true)
    setError("")
    try {
      const res = await adminApi.listEmails({ page: p, per_page: PER_PAGE, search: q || undefined })
      setData(res)
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("加载失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails(1, "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    setPage(1)
    setSearch(searchInput)
    fetchEmails(1, searchInput)
  }

  const handleView = async (id: string) => {
    setDetailLoading(true)
    try {
      setDetail(await adminApi.getEmail(id))
    } catch (e) {
      if (e instanceof ApiError) alert(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这封邮件吗？此操作不可恢复。")) return
    try {
      await adminApi.deleteEmail(id)
      setDetail(null)
      fetchEmails()
    } catch (e) {
      if (e instanceof ApiError) alert(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">邮件管理</h1>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索主题 / 发件人 / 收件人"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8"
          />
        </div>
        <Button onClick={handleSearch} variant="outline">
          搜索
        </Button>
        <Button onClick={() => fetchEmails()} variant="ghost" size="icon" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">主题</th>
                <th className="p-3 font-medium">发件人</th>
                <th className="p-3 font-medium">收件地址</th>
                <th className="p-3 font-medium">时间</th>
                <th className="p-3 font-medium">大小</th>
                <th className="p-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    暂无邮件
                  </td>
                </tr>
              )}
              {data?.items.map((e) => (
                <tr key={e.id} className="hover:bg-accent/50">
                  <td className="p-3 max-w-[260px]">
                    <div className="flex items-center gap-2">
                      {!e.is_read && <Badge variant="default">新</Badge>}
                      <span className="truncate">{e.subject || "（无主题）"}</span>
                    </div>
                  </td>
                  <td className="p-3 max-w-[200px] truncate">{e.from_address}</td>
                  <td className="p-3 max-w-[200px] truncate text-muted-foreground">
                    {e.addresses.join(", ")}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.received_at)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatBytesZh(e.size_bytes)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => handleView(e.id)}>
                      <Eye className="h-4 w-4 mr-1" />
                      查看
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            共 {data.total} 封 · 第 {data.page} 页 / {Math.max(1, Math.ceil(data.total / PER_PAGE))} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                const p = page - 1
                setPage(p)
                fetchEmails(p)
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
                fetchEmails(p)
              }}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 邮件详情 */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.subject || "（无主题）"}</DialogTitle>
            <DialogDescription>
              {detailLoading ? (
                "加载中..."
              ) : (
                <>
                  <span className="font-mono">{detail?.from_address}</span> →{" "}
                  <span className="font-mono">{detail?.addresses.join(", ")}</span>
                  <br />
                  {detail && formatDateTime(detail.received_at)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                {detail.dkim_valid !== null && (
                  <Badge variant={detail.dkim_valid ? "success" : "destructive"}>
                    DKIM {detail.dkim_valid ? "通过" : "失败"}
                  </Badge>
                )}
                {detail.spf_result && <Badge variant="outline">SPF: {detail.spf_result}</Badge>}
                {detail.dmarc_result && <Badge variant="outline">DMARC: {detail.dmarc_result}</Badge>}
                {detail.has_attachments && (
                  <Badge variant="secondary">{detail.attachments.length} 个附件</Badge>
                )}
              </div>

              {detail.attachments.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">附件</h4>
                  <ul className="space-y-1">
                    {detail.attachments.map((a) => (
                      <li key={a.id} className="text-muted-foreground">
                        {a.filename}（{formatBytesZh(a.size_bytes)}）
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.body_plain ? (
                <pre className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-md">
                  {detail.body_plain}
                </pre>
              ) : detail.body_html ? (
                <iframe
                  srcDoc={sanitizeHtml(detail.body_html)}
                  className="w-full min-h-[300px] border bg-white dark:bg-gray-900 rounded-md"
                  sandbox=""
                  title="邮件内容"
                />
              ) : (
                <p className="text-muted-foreground italic">无内容</p>
              )}

              <details>
                <summary className="cursor-pointer text-muted-foreground">查看原始邮件头</summary>
                <pre className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-md mt-2">
                  {detail.raw_headers}
                </pre>
              </details>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(detail.id)}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除此邮件
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
