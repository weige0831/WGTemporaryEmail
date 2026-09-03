"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, Github, Play, Copy, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { copyToClipboard } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

type Method = "GET" | "POST" | "PUT" | "DELETE"

interface Endpoint {
  method: Method
  path: string
  descKey: string
  test: "none" | "get" | "chain" | "adminGet"
  curl: string
}

const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PUT: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
}

const USER_ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/domains",
    descKey: "api.descDomains",
    test: "get",
    curl: 'curl -X GET "BASE/api/v1/domains"',
  },
  {
    method: "POST",
    path: "/api/v1/addresses",
    descKey: "api.descCreateAddress",
    test: "get",
    curl: 'curl -X POST "BASE/api/v1/addresses" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"username": "myemail", "domain": "example.com"}\'',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails",
    descKey: "api.descListEmails",
    test: "chain",
    curl: 'curl "BASE/api/v1/{token}/emails?page=1&per_page=50&unread_only=true&search=invoice"',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}",
    descKey: "api.descGetEmail",
    test: "none",
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}?mark_read=false"',
  },
  {
    method: "DELETE",
    path: "/api/v1/{token}/emails/{email_id}",
    descKey: "api.descDeleteEmail",
    test: "none",
    curl: 'curl -X DELETE "BASE/api/v1/{token}/emails/{email_id}"',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}/raw",
    descKey: "api.descRawEmail",
    test: "none",
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}/raw" -o message.eml',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}/attachments/{attachment_id}",
    descKey: "api.descAttachment",
    test: "none",
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}/attachments/{attachment_id}" -o file.bin',
  },
]

const ADMIN_ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/admin/stats", descKey: "api.descAdminStats", test: "adminGet", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/stats"' },
  { method: "GET", path: "/api/v1/admin/addresses", descKey: "api.descAdminAddresses", test: "adminGet", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses?page=1&per_page=20"' },
  { method: "GET", path: "/api/v1/admin/addresses/{id}", descKey: "api.descAdminAddressDetail", test: "none", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses/{id}"' },
  { method: "DELETE", path: "/api/v1/admin/addresses/{id}", descKey: "api.descAdminDeleteAddress", test: "none", curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses/{id}"' },
  { method: "GET", path: "/api/v1/admin/emails", descKey: "api.descAdminEmails", test: "adminGet", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails?page=1&per_page=20"' },
  { method: "GET", path: "/api/v1/admin/emails/{id}", descKey: "api.descAdminEmailDetail", test: "none", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails/{id}"' },
  { method: "DELETE", path: "/api/v1/admin/emails/{id}", descKey: "api.descAdminDeleteEmail", test: "none", curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails/{id}"' },
  { method: "GET", path: "/api/v1/admin/domains", descKey: "api.descAdminDomains", test: "adminGet", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/domains"' },
  { method: "POST", path: "/api/v1/admin/domains", descKey: "api.descAdminAddDomain", test: "none", curl: 'curl -X POST -H "Authorization: Bearer <admin.token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"domain": "temp.example.com"}\' "BASE/api/v1/admin/domains"' },
  { method: "DELETE", path: "/api/v1/admin/domains/{domain}", descKey: "api.descAdminRemoveDomain", test: "none", curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/domains/{domain}"' },
  { method: "GET", path: "/api/v1/admin/config", descKey: "api.descAdminConfig", test: "adminGet", curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/config"' },
  { method: "PUT", path: "/api/v1/admin/config", descKey: "api.descAdminUpdateConfig", test: "none", curl: 'curl -X PUT -H "Authorization: Bearer <admin.token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tempmail": {"address_lifetime_hours": 48}}\' "BASE/api/v1/admin/config"' },
  { method: "POST", path: "/api/v1/admin/cleanup/run", descKey: "api.descAdminCleanup", test: "none", curl: 'curl -X POST -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/cleanup/run"' },
]

const SETUP_ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/setup/status", descKey: "api.descSetupStatus", test: "get", curl: 'curl "BASE/api/v1/setup/status"' },
  { method: "POST", path: "/api/v1/setup/complete", descKey: "api.descSetupComplete", test: "none", curl: 'curl -X POST "BASE/api/v1/setup/complete" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"domains": ["example.com"], "hostname": "mail.example.com"}\'' },
]

interface TestResult {
  status: number
  ok: boolean
  body: string
}

function buildUrl(path: string): string {
  return `${API_URL}${path}`
}

export default function ApiDocsPage() {
  const { t } = useI18n()
  const [adminToken, setAdminToken] = useState("")
  const [result, setResult] = useState<TestResult | null>(null)
  const [testingPath, setTestingPath] = useState<string | null>(null)
  const [copied, setCopied] = useState("")

  const baseUrl = API_URL || (typeof window !== "undefined" ? window.location.origin : "")

  const runRequest = async (path: string, init: RequestInit = {}) => {
    setTestingPath(path)
    setResult(null)
    try {
      const res = await fetch(buildUrl(path), {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      })
      const text = await res.text()
      let pretty = text
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // 非 JSON 响应保持原样
      }
      setResult({ status: res.status, ok: res.ok, body: pretty })
    } catch {
      setResult({ status: 0, ok: false, body: t("api.testFailed") })
    } finally {
      setTestingPath(null)
    }
  }

  const handleTest = (ep: Endpoint) => {
    if (ep.test === "get") {
      runRequest(ep.path, { method: ep.method })
    } else if (ep.test === "adminGet") {
      runRequest(ep.path, {
        method: ep.method,
        headers: { Authorization: `Bearer ${adminToken.trim()}` },
      })
    } else if (ep.test === "chain") {
      // 链式测试：创建地址 -> 列出邮件
      ;(async () => {
        setTestingPath(ep.path)
        setResult(null)
        try {
          const createRes = await fetch(buildUrl("/api/v1/addresses"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
          const created = await createRes.json()
          const token = created?.token
          const listRes = token
            ? await fetch(buildUrl(`/api/v1/${token}/emails`))
            : null
          const listText = listRes ? await listRes.text() : ""
          let prettyList = listText
          try {
            prettyList = JSON.stringify(JSON.parse(listText), null, 2)
          } catch {
            // 非 JSON 响应保持原样
          }
          const combined = [
            `# 1) POST /api/v1/addresses  (HTTP ${createRes.status})`,
            JSON.stringify(created, null, 2),
            "",
            `# 2) GET /api/v1/{token}/emails  (HTTP ${listRes?.status ?? "-"})`,
            prettyList,
          ].join("\n")
          setResult({ status: listRes?.status ?? createRes.status, ok: (listRes?.ok ?? false) || createRes.ok, body: combined })
        } catch {
          setResult({ status: 0, ok: false, body: t("api.testFailed") })
        } finally {
          setTestingPath(null)
        }
      })()
    }
  }

  const copyCurl = async (curl: string) => {
    try {
      await copyToClipboard(curl.replaceAll("BASE", baseUrl))
      setCopied(curl)
      setTimeout(() => setCopied(""), 2000)
    } catch {
      // 忽略复制失败
    }
  }

  const renderEndpoint = (ep: Endpoint) => (
    <Card key={ep.method + ep.path} className="space-y-0">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded border text-xs font-bold ${METHOD_STYLES[ep.method]}`}>
                {ep.method}
              </span>
              <code className="font-mono text-sm break-all">{ep.path}</code>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{t(ep.descKey)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ep.test !== "none" && (
              <Button size="sm" onClick={() => handleTest(ep)} disabled={testingPath !== null}>
                <Play className="h-3.5 w-3.5 mr-1" />
                {testingPath === ep.path ? t("api.testing") : t("api.runTest")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => copyCurl(ep.curl)}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              {copied === ep.curl ? t("api.copied") : "curl"}
            </Button>
          </div>
        </div>
        {ep.test === "chain" && (
          <p className="text-xs text-muted-foreground italic">{t("api.chainTestNote")}</p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">{t("api.example")}</summary>
          <pre className="text-xs font-mono bg-muted p-3 rounded-md mt-2 overflow-x-auto">
            {ep.curl.replaceAll("BASE", baseUrl)}
          </pre>
        </details>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-bold">WGTemporaryEmail</h1>
          </Link>
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

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t("api.apiTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("api.apiDesc")}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t("api.baseUrlLabel")}: </span>
              <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{baseUrl}</code>
            </p>
            <div className="text-sm space-y-1 bg-muted/50 rounded-md p-3">
              <p>{t("api.authUserNote")}</p>
              <p>{t("api.authAdminNote")}</p>
            </div>
          </div>

          {/* 用户 API */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Github className="h-5 w-5 text-primary" />
              {t("api.publicSection")}
            </h3>
            {USER_ENDPOINTS.map(renderEndpoint)}
          </div>

          {/* 管理 API */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t("api.adminSection")}</h3>
            <Input
              type="password"
              placeholder={t("api.adminTokenPlaceholder")}
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="max-w-md font-mono"
            />
            {ADMIN_ENDPOINTS.map(renderEndpoint)}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("api.destructiveNote")}
            </p>
          </div>

          {/* 初始化 API */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t("api.setupSection")}</h3>
            {SETUP_ENDPOINTS.map(renderEndpoint)}
          </div>

          {/* 测试结果 */}
          {result && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {result.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {t("api.testSuccess")}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        {t("api.testFailed")}
                      </>
                    )}
                    <Badge variant="outline" className="ml-2 font-mono">
                      HTTP {result.status}
                    </Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(result.body).then(() => {})}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      {t("api.copyResponse")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                      {t("api.closeResponse")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto max-h-[420px] overflow-y-auto">
                  {result.body}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
