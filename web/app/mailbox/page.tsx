"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Mail, Copy, CheckCircle2, KeyRound, LogOut, Trash2, RefreshCw, Paperclip, AlertTriangle, Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { api, type EmailSummary, type EmailDetail } from "@/lib/api"
import { copyToClipboard, sanitizeHtml, formatBytes } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const STORAGE_KEY = "wgtempemail_permanent"
const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

export default function MailboxPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [domains, setDomains] = useState<string[]>([])
  const [selectedDomain, setSelectedDomain] = useState("")
  const [username, setUsername] = useState("")
  const [loginToken, setLoginToken] = useState("")
  const [created, setCreated] = useState<{ email: string; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [detail, setDetail] = useState<EmailDetail | null>(null)

  const saveSession = (addr: string, tok: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: addr, token: tok }))
    setEmail(addr)
    setToken(tok)
    setCreated(null)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setEmail("")
    setToken("")
    setEmails([])
    setDetail(null)
  }

  // 初始化：恢复会话 + 拉域名
  useEffect(() => {
    ;(async () => {
      try {
        const status = await api.getSetupStatus()
        if (!status.initialized) {
          router.replace("/setup")
          return
        }
      } catch {
        // 忽略，继续渲染
      }
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setEmail(parsed.email)
          setToken(parsed.token)
          fetchEmails(parsed.token)
        } catch {
          // 解析失败则回到未登录状态
        }
      }
      try {
        const data = await api.getDomains()
        setDomains(data.domains)
        if (data.domains.length > 0) setSelectedDomain(data.domains[0])
      } catch {
        // 忽略域名加载失败
      }
    })()
  }, [router])

  const fetchEmails = async (tok: string) => {
    setLoadingEmails(true)
    try {
      const data = await api.listEmails(tok, { per_page: 50 })
      setEmails(data.emails)
    } catch (e: any) {
      if (e.status === 404) {
        setError(t("mailbox.failedLogin"))
        logout()
      }
    } finally {
      setLoadingEmails(false)
    }
  }

  const handleCreate = async () => {
    setError("")
    if (!username.trim()) {
      setError(t("mailbox.needUsername"))
      return
    }
    setBusy(true)
    try {
      const data = await api.createPermanentAddress({
        username: username.trim(),
        domain: selectedDomain || undefined,
      })
      setCreated({ email: data.email, token: data.token })
      saveSession(data.email, data.token)
      fetchEmails(data.token)
    } catch (e: any) {
      if (e.status === 409) setError(t("mailbox.usernameTaken"))
      else if (e.detail) setError(String(e.detail))
      else setError(t("mailbox.failedCreate"))
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async () => {
    setError("")
    const tok = loginToken.trim()
    if (!tok) return
    setBusy(true)
    try {
      // 用一次真实请求验证令牌并取得邮箱地址
      const info = await api.getAddressInfo(tok)
      setLoginToken("")
      saveSession(info.email, tok)
      fetchEmails(tok)
    } catch (e: any) {
      if (e.status === 404) setError(t("mailbox.failedLogin"))
      else setError(t("mailbox.failedLogin"))
    } finally {
      setBusy(false)
    }
  }

  const copyToken = async (tok: string) => {
    try {
      await copyToClipboard(tok)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略
    }
  }

  const handleEmailClick = async (e: EmailSummary) => {
    if (!token) return
    try {
      setDetail(await api.getEmail(token, e.id))
    } catch {
      // 忽略详情加载失败
    }
  }

  const handleDelete = async (id: string) => {
    if (!token || !confirm(t("mailbox.deleteConfirm"))) return
    try {
      await api.deleteEmail(token, id)
      setEmails(emails.filter((e) => e.id !== id))
      setDetail(null)
    } catch {
      // 忽略
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 mr-auto">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-base sm:text-2xl font-bold whitespace-nowrap">WGTemporaryEmail</h1>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <nav className="flex items-center gap-3 sm:gap-4 order-3 w-full sm:w-auto justify-center sm:justify-end sm:order-none pt-1 sm:pt-0">
            <Link href="/" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.about")}
            </Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.privacy")}
            </Link>
            <Link href="/api" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.api")}
            </Link>
            <Link href="/mailbox" className="text-xs sm:text-sm font-medium text-primary hover:text-foreground whitespace-nowrap">
              {t("nav.permanentMailbox")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold">{t("mailbox.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("mailbox.desc")}</p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}

          {token ? (
            /* 已登录：收件箱视图 */
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Inbox className="h-5 w-5 text-primary" />
                      {t("mailbox.myEmail", { email: email || "-" })}
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={logout}>
                      <LogOut className="h-4 w-4 mr-1" />
                      {t("mailbox.logout")}
                    </Button>
                  </div>
                  <CardDescription>{t("mailbox.retentionNote", { days: 30 })}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y max-h-[480px] overflow-y-auto">
                    {loadingEmails ? (
                      <p className="p-6 text-center text-muted-foreground text-sm">
                        <RefreshCw className="h-4 w-4 inline animate-spin mr-2" />
                      </p>
                    ) : emails.length === 0 ? (
                      <p className="p-6 text-center text-muted-foreground text-sm">{t("mailbox.noEmails")}</p>
                    ) : (
                      emails.map((e) => (
                        <div
                          key={e.id}
                          className="p-3 cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleEmailClick(e)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm truncate flex-1 ${!e.is_read ? "font-semibold" : ""}`}>
                              {e.subject || t("mailbox.noSubject")}
                            </p>
                            {!e.is_read && <Badge variant="default" className="text-xs shrink-0">{t("mailbox.new")}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span className="truncate">{e.from_address}</span>
                            {e.has_attachments && <Paperclip className="h-3 w-3 shrink-0" />}
                            <span className="ml-auto shrink-0">{formatBytes(e.size_bytes)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{detail?.subject || t("mailbox.noSubject")}</DialogTitle>
                    <DialogDescription>
                      <span className="font-mono">{detail?.from_address}</span> ·{" "}
                      {detail && new Date(detail.received_at).toLocaleString()}
                    </DialogDescription>
                  </DialogHeader>
                  {detail && (
                    <div className="space-y-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {detail.dkim_valid !== null && (
                          <Badge variant={detail.dkim_valid ? "success" : "destructive"}>
                            DKIM {detail.dkim_valid ? "✓" : "✗"}
                          </Badge>
                        )}
                        {detail.spf_result && <Badge variant="outline">SPF: {detail.spf_result}</Badge>}
                        {detail.dmarc_result && <Badge variant="outline">DMARC: {detail.dmarc_result}</Badge>}
                      </div>
                      {detail.body_plain ? (
                        <pre className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-md">{detail.body_plain}</pre>
                      ) : detail.body_html ? (
                        <iframe
                          srcDoc={sanitizeHtml(detail.body_html)}
                          className="w-full min-h-[300px] border bg-white dark:bg-gray-900 rounded-md"
                          sandbox=""
                          title="Email content"
                        />
                      ) : (
                        <p className="text-muted-foreground italic">{t("mailbox.noContent")}</p>
                      )}
                      {detail.attachments.length > 0 && (
                        <div className="space-y-1">
                          <h4 className="font-semibold">{t("mailbox.attachments")}</h4>
                          {detail.attachments.map((a) => (
                            <a
                              key={a.id}
                              href={api.getAttachmentUrl(token, detail.id, a.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 rounded-md border hover:bg-accent text-xs"
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1 truncate">{a.filename}</span>
                              <span className="text-muted-foreground shrink-0">{formatBytes(a.size_bytes)}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      <Button variant="destructive" size="sm" className="w-full" onClick={() => handleDelete(detail.id)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("mailbox.deleteEmail")}
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          ) : (
            /* 未登录：创建 / 登录 */
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    {t("mailbox.createTitle")}
                  </CardTitle>
                  <CardDescription>{t("mailbox.retentionNote", { days: 30 })}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("mailbox.usernamePlaceholder")}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="font-mono"
                    />
                    <span className="self-center text-muted-foreground">@</span>
                    {domains.length > 0 && (
                      <select
                        value={selectedDomain}
                        onChange={(e) => setSelectedDomain(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {domains.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Button onClick={handleCreate} disabled={busy} className="w-full">
                    {busy ? t("mailbox.creating") : t("mailbox.createBtn")}
                  </Button>
                  {created && (
                    <div className="border rounded-md p-3 space-y-2 bg-primary/5">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {created.email}
                      </p>
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t("mailbox.createdNote")}
                      </p>
                      <div className="flex gap-2">
                        <Input value={created.token} readOnly className="font-mono text-xs" />
                        <Button size="sm" variant="outline" onClick={() => copyToken(created.token)} className="shrink-0">
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {copied ? t("mailbox.copied") : t("mailbox.copyToken")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {t("mailbox.loginTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder={t("mailbox.tokenPlaceholder")}
                    value={loginToken}
                    onChange={(e) => setLoginToken(e.target.value)}
                    className="font-mono"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                  <Button onClick={handleLogin} disabled={busy || !loginToken.trim()} variant="outline" className="w-full">
                    {t("mailbox.loginBtn")}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
