"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Mail, Copy, CheckCircle2, KeyRound, LogOut, Trash2, RefreshCw, Paperclip, AlertTriangle,
  Download, Search, Clock, XCircle, Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { DomainBanner } from "@/components/domain-banner"
import { api, type EmailSummary, type EmailDetail } from "@/lib/api"
import { copyToClipboard, sanitizeHtml, formatBytes, formatRelativeTime } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const STORAGE_KEY = "wgtempemail_permanent"
const AUTO_REFRESH_INTERVAL = 15000

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
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [loadingEmails, setLoadingEmails] = useState(false)
  const [detail, setDetail] = useState<EmailDetail | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [viewMode, setViewMode] = useState<"plain" | "html">("html")
  // Operator-configured retention and official hostname (never hardcode 30).
  const [retentionDays, setRetentionDays] = useState(30)
  const [webHostname, setWebHostname] = useState("")
  // Time-dependent text must not be part of the prerendered HTML: the build
  // renders one clock value and the browser another, which React reports as a
  // hydration mismatch.
  const [mounted, setMounted] = useState(false)

  const saveSession = (addr: string, tok: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: addr, token: tok }))
    setEmail(addr)
    setToken(tok)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setEmail("")
    setToken("")
    setEmails([])
    setDetail(null)
    setCreated(null)
  }

  // 初始化：恢复会话 + 拉域名
  useEffect(() => {
    setMounted(true)
    ;(async () => {
      try {
        const status = await api.getSetupStatus()
        if (!status.initialized) {
          router.replace("/setup")
          return
        }
        setWebHostname(status.web_hostname || "")
        if (status.permanent_email_retention_days) {
          setRetentionDays(status.permanent_email_retention_days)
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
          fetchEmails(parsed.token, "")
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

  // 自动刷新
  useEffect(() => {
    if (!token || !autoRefresh) return
    const interval = setInterval(() => {
      fetchEmails(token, searchQuery, true)
    }, AUTO_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [token, autoRefresh, searchQuery])

  const fetchEmails = async (tok: string, search: string, silent = false) => {
    if (!silent) setLoadingEmails(true)
    try {
      const data = await api.listEmails(tok, {
        per_page: 50,
        search: search || undefined,
      })
      setEmails(data.emails)
      setLastRefresh(new Date())
    } catch (e: any) {
      if (e.status === 404) {
        setError(t("mailbox.failedLogin"))
        logout()
      }
    } finally {
      if (!silent) setLoadingEmails(false)
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
      fetchEmails(data.token, "")
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
      fetchEmails(tok, "")
    } catch {
      setError(t("mailbox.failedLogin"))
    } finally {
      setBusy(false)
    }
  }

  const copyText = async (value: string) => {
    try {
      await copyToClipboard(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略
    }
  }

  const handleEmailClick = async (e: EmailSummary) => {
    if (!token) return
    try {
      const d = await api.getEmail(token, e.id)
      setDetail(d)
      setEmails(emails.map((x) => (x.id === e.id ? { ...x, is_read: true } : x)))
    } catch (err: any) {
      if (err.status === 404) {
        setError(t("mailbox.failedLogin"))
        logout()
      } else {
        setError(t("home.failedToLoad"))
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (!token || !confirm(t("mailbox.deleteConfirm"))) return
    try {
      await api.deleteEmail(token, id)
      setEmails(emails.filter((e) => e.id !== id))
      if (detail?.id === id) setDetail(null)
    } catch (err: any) {
      if (err.status === 404) {
        setError(t("mailbox.failedLogin"))
        logout()
      } else {
        setError(t("home.failedToDelete"))
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DomainBanner webHostname={webHostname} />
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
            <Link href="/about" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
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
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}

          {token ? (
            /* 已登录：邮箱信息 + 收件箱 + 阅读区 */
            <>
              <Card>
                <CardHeader className="pb-3 sm:pb-6">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-1">
                      <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                        <Inbox className="h-5 w-5 text-primary" />
                        {t("mailbox.title")}
                      </CardTitle>
                      <CardDescription className="text-sm sm:text-base">
                        {t("mailbox.retentionNote", { days: retentionDays })}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={logout} className="min-h-[40px]">
                      <LogOut className="h-4 w-4 mr-1" />
                      {t("mailbox.logout")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input
                      value={email}
                      readOnly
                      className="font-mono text-base sm:text-lg min-h-[44px]"
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => copyText(email)} variant="outline" className="flex-1 sm:flex-none min-h-[44px]">
                        {copied ? <CheckCircle2 className="h-4 w-4 sm:mr-2" /> : <Copy className="h-4 w-4 sm:mr-2" />}
                        <span>{copied ? t("home.copied") : t("home.copy")}</span>
                      </Button>
                      <Button
                        onClick={() => setShowToken((v) => !v)}
                        variant="outline"
                        className="flex-1 sm:flex-none min-h-[44px]"
                      >
                        <KeyRound className="h-4 w-4 sm:mr-2" />
                        <span>{showToken ? t("mailbox.hideToken") : t("mailbox.showToken")}</span>
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{t("admin.neverExpires")}</span>
                  </div>
                  {showToken && !created && (
                    <div className="flex gap-2">
                      <Input value={token} readOnly className="font-mono text-xs sm:text-sm min-h-[40px]" />
                      <Button size="sm" variant="outline" onClick={() => copyText(token)} className="shrink-0 min-h-[40px]">
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        {t("mailbox.copyToken")}
                      </Button>
                    </div>
                  )}
                  {created && (
                    <div className="border rounded-md p-3 space-y-2 bg-primary/5">
                      <p className="text-xs sm:text-sm text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t("mailbox.createdNote")}
                      </p>
                      <div className="flex gap-2">
                        <Input value={created.token} readOnly className="font-mono text-xs min-h-[40px]" />
                        <Button size="sm" variant="outline" onClick={() => copyText(created.token)} className="shrink-0 min-h-[40px]">
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {copied ? t("mailbox.copied") : t("mailbox.copyToken")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* 收件箱列表 */}
                <Card className="lg:col-span-1">
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base sm:text-lg">{t("home.inbox")} ({emails.length})</CardTitle>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => fetchEmails(token, searchQuery)}
                          disabled={loadingEmails}
                          className="h-9 w-9 sm:h-10 sm:w-10"
                        >
                          <RefreshCw className={`h-4 w-4 ${loadingEmails ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant={autoRefresh ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAutoRefresh(!autoRefresh)}
                          className="text-xs sm:text-sm h-9 sm:h-10 px-2 sm:px-4"
                        >
                          {t("home.auto")}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={t("home.searchEmails")}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && fetchEmails(token, searchQuery)}
                          className="pl-8 text-sm sm:text-base min-h-[40px]"
                        />
                      </div>
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchQuery("")
                            fetchEmails(token, "")
                          }}
                          className="text-xs sm:text-sm"
                        >
                          {t("home.clearSearch")}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                      {emails.length === 0 ? (
                        <div className="p-6 sm:p-8 text-center text-muted-foreground">
                          <Mail className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-20" />
                          <p className="text-sm sm:text-base">{t("mailbox.noEmails")}</p>
                          <p className="text-xs sm:text-sm mt-2">
                            {autoRefresh && t("home.autoRefreshingEvery", { sec: AUTO_REFRESH_INTERVAL / 1000 })}
                          </p>
                        </div>
                      ) : (
                        emails.map((e) => (
                          <div
                            key={e.id}
                            className={`p-3 sm:p-4 cursor-pointer hover:bg-accent transition-colors active:bg-accent ${
                              detail?.id === e.id ? "bg-accent" : ""
                            } ${!e.is_read ? "font-semibold" : ""}`}
                            onClick={() => handleEmailClick(e)}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm sm:text-base truncate flex-1">
                                {e.subject || t("home.noSubject")}
                              </p>
                              {!e.is_read && (
                                <Badge variant="default" className="text-xs shrink-0">{t("mailbox.new")}</Badge>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate mb-1">
                              {e.from_address}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatRelativeTime(e.received_at)}</span>
                              {e.has_attachments && <Paperclip className="h-3 w-3" />}
                              <span className="ml-auto">{formatBytes(e.size_bytes)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* 邮件阅读区 */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3 sm:pb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <CardTitle className="text-base sm:text-lg line-clamp-2">
                        {detail ? detail.subject || t("home.noSubject") : t("home.selectAnEmail")}
                      </CardTitle>
                      {detail && (
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          {detail.body_html && detail.body_plain && (
                            <div className="flex gap-1 border rounded-md p-1">
                              <Button
                                variant={viewMode === "html" ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setViewMode("html")}
                                className="text-xs h-8 px-2 sm:px-3"
                              >
                                {t("home.html")}
                              </Button>
                              <Button
                                variant={viewMode === "plain" ? "default" : "ghost"}
                                size="sm"
                                onClick={() => setViewMode("plain")}
                                className="text-xs h-8 px-2 sm:px-3"
                              >
                                {t("home.plain")}
                              </Button>
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(api.getRawEmailUrl(token, detail.id), "_blank")}
                            className="h-9 w-9 sm:h-10 sm:w-10"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(detail.id)}
                            className="h-9 w-9 sm:h-10 sm:w-10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {detail ? (
                      <div className="space-y-3 sm:space-y-4">
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div className="break-all">
                            <span className="text-muted-foreground">{t("home.from")}</span>{" "}
                            <span className="font-mono">{detail.from_address}</span>
                          </div>
                          <div className="break-all">
                            <span className="text-muted-foreground">{t("home.to")}</span>{" "}
                            <span className="font-mono">{detail.to_address}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t("home.date")}</span>{" "}
                            {new Date(detail.received_at).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                          {detail.dkim_valid !== null && (
                            <Badge variant={detail.dkim_valid ? "success" : "destructive"} className="text-xs">
                              {detail.dkim_valid ? (
                                <><CheckCircle2 className="h-3 w-3 mr-1" /> {t("home.dkimValid")}</>
                              ) : (
                                <><XCircle className="h-3 w-3 mr-1" /> {t("home.dkimInvalid")}</>
                              )}
                            </Badge>
                          )}
                          {detail.spf_result && (
                            <Badge variant={detail.spf_result === "pass" ? "success" : "outline"} className="text-xs">
                              {t("home.spf", { v: detail.spf_result })}
                            </Badge>
                          )}
                          {detail.dmarc_result && (
                            <Badge variant={detail.dmarc_result === "pass" ? "success" : "outline"} className="text-xs">
                              {t("home.dmarc", { v: detail.dmarc_result })}
                            </Badge>
                          )}
                          {detail.has_attachments && (
                            <Badge variant="secondary" className="text-xs">
                              <Paperclip className="h-3 w-3 mr-1" />
                              {t("home.attachmentsCount", { n: detail.attachments.length })}
                            </Badge>
                          )}
                        </div>

                        {detail.attachments.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm sm:text-base font-semibold">{t("home.attachments")}</h4>
                            <div className="space-y-1.5">
                              {detail.attachments.map((a) => (
                                <a
                                  key={a.id}
                                  href={api.getAttachmentUrl(token, detail.id, a.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2.5 sm:p-3 rounded-md border hover:bg-accent active:bg-accent text-sm min-h-[44px]"
                                >
                                  <Download className="h-4 w-4 shrink-0" />
                                  <span className="flex-1 truncate text-xs sm:text-sm">{a.filename}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {formatBytes(a.size_bytes)}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="border-t pt-3 sm:pt-4">
                          {viewMode === "html" && detail.body_html ? (
                            <iframe
                              srcDoc={sanitizeHtml(detail.body_html)}
                              className="w-full min-h-[400px] border-0 bg-white dark:bg-gray-900"
                              sandbox=""
                              title="Email content"
                            />
                          ) : detail.body_plain ? (
                            <pre className="whitespace-pre-wrap text-xs sm:text-sm font-mono bg-muted p-3 sm:p-4 rounded-md overflow-x-auto">
                              {detail.body_plain}
                            </pre>
                          ) : (
                            <p className="text-muted-foreground italic text-sm">{t("mailbox.noContent")}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 sm:h-64 text-muted-foreground">
                        <div className="text-center">
                          <Mail className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 opacity-20" />
                          <p className="text-sm sm:text-base">{t("home.viewContents")}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {autoRefresh && mounted && (
                <div className="text-center text-xs sm:text-sm text-muted-foreground px-2">
                  {t("home.lastRefreshed", { time: lastRefresh.toLocaleTimeString() })}
                </div>
              )}
            </>
          ) : (
            /* 未登录：创建 / 登录 */
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold">{t("mailbox.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("mailbox.desc")}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      {t("mailbox.createTitle")}
                    </CardTitle>
                    <CardDescription>{t("mailbox.retentionNote", { days: retentionDays })}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center border rounded-md bg-background min-h-[44px]">
                      <Input
                        placeholder={t("mailbox.usernamePlaceholder")}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-base"
                      />
                      <span className="text-muted-foreground px-2">@</span>
                      {domains.length > 0 && (
                        <select
                          value={selectedDomain}
                          onChange={(e) => setSelectedDomain(e.target.value)}
                          className="h-full rounded-r-md border-0 bg-transparent px-3 py-2 text-sm sm:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 [&>option]:text-foreground [&>option]:bg-background"
                        >
                          {domains.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <Button onClick={handleCreate} disabled={busy} className="w-full min-h-[44px] text-base">
                      {busy ? t("mailbox.creating") : t("mailbox.createBtn")}
                    </Button>
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
                      className="font-mono min-h-[44px]"
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    />
                    <Button
                      onClick={handleLogin}
                      disabled={busy || !loginToken.trim()}
                      variant="outline"
                      className="w-full min-h-[44px] text-base"
                    >
                      {t("mailbox.loginBtn")}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-8 sm:mt-16">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>
            {t("home.footerText")} •{" "}
            <Link href="/about" className="hover:text-foreground">
              {t("nav.about")}
            </Link>{" "}
            •{" "}
            <Link href="/privacy" className="hover:text-foreground">
              {t("nav.privacy")}
            </Link>{" "}
            •{" "}
            <Link href="/api" className="hover:text-foreground">
              {t("nav.api")}
            </Link>{" "}
            •{" "}
            <Link href="/" className="hover:text-foreground">
              {t("nav.tempMailbox")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
