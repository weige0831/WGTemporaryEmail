"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Mail, Copy, RefreshCw, Search, Trash2, Download, Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { DomainBanner } from "@/components/domain-banner"
import { api, type EmailSummary, type EmailDetail, type AddressResponse } from "@/lib/api"
import { formatRelativeTime, formatBytes, copyToClipboard, sanitizeHtml } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import Link from "next/link"

const AUTO_REFRESH_INTERVAL = 15000 // 15 seconds

export default function Home() {
  const router = useRouter()
  const { t } = useI18n()
  const [address, setAddress] = useState<AddressResponse | null>(null)
  const [emails, setEmails] = useState<EmailSummary[]>(() => [])
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [copied, setCopied] = useState(false)
  const [customUsername, setCustomUsername] = useState("")
  const [selectedDomain, setSelectedDomain] = useState<string>("")
  const [domains, setDomains] = useState<string[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [viewMode, setViewMode] = useState<"plain" | "html">("html")
  const [showNewEmailDialog, setShowNewEmailDialog] = useState(false)
  const [webHostname, setWebHostname] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  // 页面内提示条（替代生硬的 alert）
  const showNotice = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 12000)
  }

  const addressExpired = (a: AddressResponse | null): boolean => {
    return !!a && new Date(a.expires_at).getTime() <= Date.now()
  }

  // 首次访问：未完成初始化向导时跳转到 /setup
  useEffect(() => {
    ;(async () => {
      try {
        const status = await api.getSetupStatus()
        if (!status.initialized) {
          router.replace("/setup")
          return
        }
        setWebHostname(status.web_hostname || "")
      } catch (e) {
        console.error("Failed to check setup status", e)
      }
      initInbox()
    })()
  }, [])

  const initInbox = () => {
    const saved = localStorage.getItem("mailbucket_address")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // 本地先判过期：已过期就直接清理并换新地址，避免出现负倒计时
        if (new Date(parsed.expires_at).getTime() <= Date.now()) {
          localStorage.removeItem("mailbucket_address")
          createNewAddress(parsed.email)
          fetchDomains()
          return
        }
        setAddress(parsed)
        fetchEmails(parsed.token)
      } catch (e) {
        console.error("Failed to parse saved address", e)
        // If parsing fails, create a new address
        createNewAddress()
      }
    } else {
      // No saved address, create a new random one
      createNewAddress()
    }
    fetchDomains()
  }

  // Auto-refresh emails
  useEffect(() => {
    if (!address || !autoRefresh) return

    const interval = setInterval(() => {
      // 到期瞬间主动轮换，不等接口报错
      if (new Date(address.expires_at).getTime() <= Date.now()) {
        handleExpiredAddress()
        return
      }
      fetchEmails(address.token, true)
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [address, autoRefresh])

  const fetchDomains = async () => {
    try {
      const data = await api.getDomains()
      setDomains(data.domains)
      if (data.domains.length > 0) {
        setSelectedDomain(data.domains[0])
      }
    } catch (error) {
      console.error("Failed to fetch domains", error)
    }
  }

  const createNewAddress = async (oldEmail?: string) => {
    setLoading(true)
    try {
      const payload: { username?: string; domain?: string } = {}

      // Always include domain if one is selected
      if (selectedDomain) {
        payload.domain = selectedDomain
      }

      // Include username if provided
      if (customUsername) {
        payload.username = customUsername
      }

      const data = await api.createAddress(payload)
      setAddress(data)
      localStorage.setItem("mailbucket_address", JSON.stringify(data))
      setEmails([])
      setSelectedEmail(null)
      setCustomUsername("")
      setShowNewEmailDialog(false)
      fetchEmails(data.token)

      // Show expiry message if this is an auto-rotation
      if (oldEmail) {
        showNotice(t("home.expiredNewAddress", { old: oldEmail, new: data.email }))
      }
    } catch (error: any) {
      console.error("Failed to create address", error)
      if (error.status === 409) {
        alert(t("home.usernameTaken"))
      } else {
        alert(t("home.failedToCreate"))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleExpiredAddress = async () => {
    const oldEmail = address?.email
    if (oldEmail) {
      await createNewAddress(oldEmail)
    }
  }

  const fetchEmails = async (token: string, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.listEmails(token, {
        per_page: 50,
        search: searchQuery || undefined,
      })
      setEmails(data.emails)
      setLastRefresh(new Date())
    } catch (error: any) {
      console.error("Failed to fetch emails", error)
      // 地址已过期（接口返回 404）或已被后台清理（"Address not found"）：
      // 一律按过期处理，自动换新地址
      if (error.status === 404) {
        await handleExpiredAddress()
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const handleEmailClick = async (email: EmailSummary) => {
    if (!address) return
    setLoading(true)
    try {
      const detail = await api.getEmail(address.token, email.id)
      setSelectedEmail(detail)
      // Update the email in the list to mark as read
      setEmails(emails.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    } catch (error: any) {
      console.error("Failed to fetch email detail", error)
      // Check if address has expired
      if (error.status === 404) {
        await handleExpiredAddress()
      } else {
        alert(t("home.failedToLoad"))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEmail = async (emailId: string) => {
    if (!address || !confirm(t("home.deleteEmailConfirm"))) return
    try {
      await api.deleteEmail(address.token, emailId)
      setEmails(emails.filter(e => e.id !== emailId))
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null)
      }
    } catch (error: any) {
      console.error("Failed to delete email", error)
      // Check if address has expired
      if (error.status === 404) {
        await handleExpiredAddress()
      } else {
        alert(t("home.failedToDelete"))
      }
    }
  }

  const handleCopyAddress = async () => {
    if (!address) return
    try {
      await copyToClipboard(address.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy address", error)
    }
  }

  const getTimeUntilExpiry = () => {
    if (!address) return ""
    const now = new Date()
    const expiry = new Date(address.expires_at)
    const diff = expiry.getTime() - now.getTime()
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="min-h-screen bg-background">
      <DomainBanner webHostname={webHostname} />
      {notice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,38rem)] rounded-lg border-2 border-amber-600 bg-amber-500 text-white shadow-2xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm sm:text-base font-semibold flex-1 break-all">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            aria-label="Close"
            className="shrink-0 text-white/90 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>
      )}
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-bold">WGTemporaryEmail</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link href="/about" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.about")}
            </Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.privacy")}
            </Link>
            <Link href="/api" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.api")}
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Email Address Section */}
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl">{t("home.yourTempEmail")}</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {address
                  ? addressExpired(address)
                    ? t("home.expiredNow")
                    : t("home.readyDesc", { time: getTimeUntilExpiry() })
                  : t("home.loading")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {address ? (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Input
                      value={address.email}
                      readOnly
                      className="font-mono text-base sm:text-lg min-h-[44px]"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleCopyAddress} variant="outline" className="flex-1 sm:flex-none min-h-[44px]">
                        {copied ? <CheckCircle2 className="h-4 w-4 sm:mr-2" /> : <Copy className="h-4 w-4 sm:mr-2" />}
                        <span className="sm:inline">{copied ? t("home.copied") : t("home.copy")}</span>
                      </Button>
                      <Button onClick={() => setShowNewEmailDialog(true)} variant="outline" className="flex-1 sm:flex-none min-h-[44px]">
                        {t("home.newEmail")}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {addressExpired(address)
                        ? t("home.expiredNow")
                        : t("home.expiresIn", { time: getTimeUntilExpiry() })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>

          {address ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Email List */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3 sm:pb-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base sm:text-lg">{t("home.inbox")} ({emails.length})</CardTitle>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fetchEmails(address.token)}
                        disabled={loading}
                        className="h-9 w-9 sm:h-10 sm:w-10"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
                        className="pl-8 text-sm sm:text-base min-h-[40px]"
                      />
                    </div>
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchQuery("")}
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
                        <p className="text-sm sm:text-base">{t("home.noEmailsYet")}</p>
                        <p className="text-xs sm:text-sm mt-2">
                          {autoRefresh && t("home.autoRefreshingEvery", { sec: AUTO_REFRESH_INTERVAL / 1000 })}
                        </p>
                      </div>
                    ) : (
                      emails.map((email) => (
                        <div
                          key={email.id}
                          className={`p-3 sm:p-4 cursor-pointer hover:bg-accent transition-colors active:bg-accent ${
                            selectedEmail?.id === email.id ? "bg-accent" : ""
                          } ${!email.is_read ? "font-semibold" : ""}`}
                          onClick={() => handleEmailClick(email)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm sm:text-base truncate flex-1">
                              {email.subject || t("home.noSubject")}
                            </p>
                            {!email.is_read && (
                              <Badge variant="default" className="text-xs shrink-0">{t("home.newBadge")}</Badge>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate mb-1">
                            {email.from_address}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatRelativeTime(email.received_at)}</span>
                            {email.has_attachments && (
                              <Paperclip className="h-3 w-3" />
                            )}
                            <span className="ml-auto">{formatBytes(email.size_bytes)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Email Detail */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3 sm:pb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-base sm:text-lg line-clamp-2">
                      {selectedEmail ? selectedEmail.subject || t("home.noSubject") : t("home.selectAnEmail")}
                    </CardTitle>
                    {selectedEmail && (
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {selectedEmail.body_html && selectedEmail.body_plain && (
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
                          onClick={() => window.open(api.getRawEmailUrl(address.token, selectedEmail.id), "_blank")}
                          className="h-9 w-9 sm:h-10 sm:w-10"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteEmail(selectedEmail.id)}
                          className="h-9 w-9 sm:h-10 sm:w-10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedEmail ? (
                    <div className="space-y-3 sm:space-y-4">
                      {/* Email Headers */}
                      <div className="space-y-2 text-xs sm:text-sm">
                        <div className="break-all">
                          <span className="text-muted-foreground">{t("home.from")}</span>{" "}
                          <span className="font-mono">{selectedEmail.from_address}</span>
                        </div>
                        <div className="break-all">
                          <span className="text-muted-foreground">{t("home.to")}</span>{" "}
                          <span className="font-mono">{selectedEmail.to_address}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("home.date")}</span>{" "}
                          {new Date(selectedEmail.received_at).toLocaleString()}
                        </div>
                      </div>

                      {/* Security Badges */}
                      <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                        {selectedEmail.dkim_valid !== null && (
                          <Badge variant={selectedEmail.dkim_valid ? "success" : "destructive"} className="text-xs">
                            {selectedEmail.dkim_valid ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> {t("home.dkimValid")}</>
                            ) : (
                              <><XCircle className="h-3 w-3 mr-1" /> {t("home.dkimInvalid")}</>
                            )}
                          </Badge>
                        )}
                        {selectedEmail.spf_result && (
                          <Badge variant={selectedEmail.spf_result === "pass" ? "success" : "outline"} className="text-xs">
                            {t("home.spf", { v: selectedEmail.spf_result })}
                          </Badge>
                        )}
                        {selectedEmail.dmarc_result && (
                          <Badge variant={selectedEmail.dmarc_result === "pass" ? "success" : "outline"} className="text-xs">
                            {t("home.dmarc", { v: selectedEmail.dmarc_result })}
                          </Badge>
                        )}
                        {selectedEmail.has_attachments && (
                          <Badge variant="secondary" className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            {t("home.attachmentsCount", { n: selectedEmail.attachments.length })}
                          </Badge>
                        )}
                      </div>

                      {/* Attachments */}
                      {selectedEmail.attachments.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm sm:text-base font-semibold">{t("home.attachments")}</h4>
                          <div className="space-y-1.5">
                            {selectedEmail.attachments.map((att) => (
                              <a
                                key={att.id}
                                href={api.getAttachmentUrl(address.token, selectedEmail.id, att.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2.5 sm:p-3 rounded-md border hover:bg-accent active:bg-accent text-sm min-h-[44px]"
                              >
                                <Download className="h-4 w-4 shrink-0" />
                                <span className="flex-1 truncate text-xs sm:text-sm">{att.filename}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {formatBytes(att.size_bytes)}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Email Body */}
                      <div className="border-t pt-3 sm:pt-4">
                        {viewMode === "html" && selectedEmail.body_html ? (
                          <iframe
                            srcDoc={sanitizeHtml(selectedEmail.body_html)}
                            className="w-full min-h-[400px] border-0 bg-white dark:bg-gray-900"
                            sandbox=""
                            title="Email content"
                          />
                        ) : selectedEmail.body_plain ? (
                          <pre className="whitespace-pre-wrap text-xs sm:text-sm font-mono bg-muted p-3 sm:p-4 rounded-md overflow-x-auto">
                            {selectedEmail.body_plain}
                          </pre>
                        ) : (
                          <p className="text-muted-foreground italic text-sm">{t("home.noContent")}</p>
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
          ) : null}

          {autoRefresh && address && (
            <div className="text-center text-xs sm:text-sm text-muted-foreground px-2">
              {t("home.lastRefreshed", { time: lastRefresh.toLocaleTimeString() })}
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
            </Link>
          </p>
        </div>
      </footer>

      {/* New Email Dialog */}
      <Dialog open={showNewEmailDialog} onOpenChange={setShowNewEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{t("home.dialogTitle")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t("home.dialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center flex-1 border rounded-md bg-background min-h-[44px]">
                <Input
                  placeholder={t("home.customNamePlaceholder")}
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
                />
                <span className="text-muted-foreground px-2">@</span>
                {domains.length > 0 && (
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="h-full rounded-r-md border-0 bg-transparent px-3 py-2 text-sm sm:text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 [&>option]:text-foreground [&>option]:bg-background"
                  >
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t("home.dialogHint")}
            </p>
            <Button onClick={() => createNewAddress()} disabled={loading} className="w-full min-h-[44px] text-base">
              {loading ? t("home.creating") : t("home.generateEmail")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
