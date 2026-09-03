"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Mail, Copy, RefreshCw, Search, Trash2, Download, Clock, CheckCircle2, XCircle, AlertCircle, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { api, type EmailSummary, type EmailDetail, type AddressResponse } from "@/lib/api"
import { formatRelativeTime, formatBytes, copyToClipboard, sanitizeHtml } from "@/lib/utils"
import Link from "next/link"

const AUTO_REFRESH_INTERVAL = 15000 // 15 seconds

export default function Home() {
  const router = useRouter()
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

  // 首次访问：未完成初始化向导时跳转到 /setup
  useEffect(() => {
    ;(async () => {
      try {
        const status = await api.getSetupStatus()
        if (!status.initialized) {
          router.replace("/setup")
          return
        }
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
        alert(`${oldEmail} has expired. New address: ${data.email}`)
      }
    } catch (error: any) {
      console.error("Failed to create address", error)
      if (error.status === 409) {
        alert(`This username is currently taken. Please choose a different username or leave it blank for a random email address.`)
      } else {
        alert("Failed to create email address. Please try again.")
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
      // Check if address has expired
      if (error.status === 404 && error.detail === "Address has expired") {
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
      if (error.status === 404 && error.detail === "Address has expired") {
        await handleExpiredAddress()
      } else {
        alert("Failed to load email. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEmail = async (emailId: string) => {
    if (!address || !confirm("Delete this email?")) return
    try {
      await api.deleteEmail(address.token, emailId)
      setEmails(emails.filter(e => e.id !== emailId))
      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null)
      }
    } catch (error: any) {
      console.error("Failed to delete email", error)
      // Check if address has expired
      if (error.status === 404 && error.detail === "Address has expired") {
        await handleExpiredAddress()
      } else {
        alert("Failed to delete email. Please try again.")
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
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Mailbucket</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/about" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              About
            </Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Email Address Section */}
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl">Your Temporary Email</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {address
                  ? "Your temporary email is ready. It will be automatically deleted in " + getTimeUntilExpiry() + "."
                  : "Loading..."}
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
                        <span className="sm:inline">{copied ? "Copied" : "Copy"}</span>
                      </Button>
                      <Button onClick={() => setShowNewEmailDialog(true)} variant="outline" className="flex-1 sm:flex-none min-h-[44px]">
                        New Email
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Expires in {getTimeUntilExpiry()}</span>
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
                    <CardTitle className="text-base sm:text-lg">Inbox ({emails.length})</CardTitle>
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
                        Auto
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search emails..."
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
                        Clear Search
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                    {emails.length === 0 ? (
                      <div className="p-6 sm:p-8 text-center text-muted-foreground">
                        <Mail className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-20" />
                        <p className="text-sm sm:text-base">No emails yet</p>
                        <p className="text-xs sm:text-sm mt-2">
                          {autoRefresh && `Auto-refreshing every ${AUTO_REFRESH_INTERVAL / 1000}s`}
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
                              {email.subject || "(No Subject)"}
                            </p>
                            {!email.is_read && (
                              <Badge variant="default" className="text-xs shrink-0">New</Badge>
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
                      {selectedEmail ? selectedEmail.subject || "(No Subject)" : "Select an email"}
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
                              HTML
                            </Button>
                            <Button
                              variant={viewMode === "plain" ? "default" : "ghost"}
                              size="sm"
                              onClick={() => setViewMode("plain")}
                              className="text-xs h-8 px-2 sm:px-3"
                            >
                              Plain
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
                          <span className="text-muted-foreground">From:</span>{" "}
                          <span className="font-mono">{selectedEmail.from_address}</span>
                        </div>
                        <div className="break-all">
                          <span className="text-muted-foreground">To:</span>{" "}
                          <span className="font-mono">{selectedEmail.to_address}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date:</span>{" "}
                          {new Date(selectedEmail.received_at).toLocaleString()}
                        </div>
                      </div>

                      {/* Security Badges */}
                      <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                        {selectedEmail.dkim_valid !== null && (
                          <Badge variant={selectedEmail.dkim_valid ? "success" : "destructive"} className="text-xs">
                            {selectedEmail.dkim_valid ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> DKIM Valid</>
                            ) : (
                              <><XCircle className="h-3 w-3 mr-1" /> DKIM Invalid</>
                            )}
                          </Badge>
                        )}
                        {selectedEmail.spf_result && (
                          <Badge variant={selectedEmail.spf_result === "pass" ? "success" : "outline"} className="text-xs">
                            SPF: {selectedEmail.spf_result}
                          </Badge>
                        )}
                        {selectedEmail.dmarc_result && (
                          <Badge variant={selectedEmail.dmarc_result === "pass" ? "success" : "outline"} className="text-xs">
                            DMARC: {selectedEmail.dmarc_result}
                          </Badge>
                        )}
                        {selectedEmail.has_attachments && (
                          <Badge variant="secondary" className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" />
                            {selectedEmail.attachments.length} Attachment(s)
                          </Badge>
                        )}
                      </div>

                      {/* Attachments */}
                      {selectedEmail.attachments.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm sm:text-base font-semibold">Attachments</h4>
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
                          <p className="text-muted-foreground italic text-sm">No content</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 sm:h-64 text-muted-foreground">
                      <div className="text-center">
                        <Mail className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 opacity-20" />
                        <p className="text-sm sm:text-base">Select an email to view its contents</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {autoRefresh && address && (
            <div className="text-center text-xs sm:text-sm text-muted-foreground px-2">
              Last refreshed: {lastRefresh.toLocaleTimeString()} • Auto-refresh enabled
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-8 sm:mt-16">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>
            Mailbucket - Open Source Temporary Email Service •{" "}
            <Link href="/about" className="hover:text-foreground">
              About
            </Link>{" "}
            •{" "}
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </p>
        </div>
      </footer>

      {/* New Email Dialog */}
      <Dialog open={showNewEmailDialog} onOpenChange={setShowNewEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Generate New Email</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Create a new temporary email address. Leave the username blank for a random address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center flex-1 border rounded-md bg-background min-h-[44px]">
                <Input
                  placeholder="custom-name (optional)"
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
              Leave blank for a random email address, or enter a custom username (3-64 chars, alphanumeric + . _ -)
            </p>
            <Button onClick={() => createNewAddress()} disabled={loading} className="w-full min-h-[44px] text-base">
              {loading ? "Creating..." : "Generate Email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
