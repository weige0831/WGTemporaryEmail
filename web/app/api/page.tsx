"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Mail, Play, Copy, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { copyToClipboard } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

type Method = "GET" | "POST" | "PUT" | "DELETE"

interface ParamDef {
  name: string
  type: "path" | "query" | "body" | "bodyText"
  placeholder?: string
  defaultFrom?: "savedToken"
}

interface Endpoint {
  method: Method
  path: string
  descKey: string
  params: ParamDef[]
  curl: string
  destructive?: boolean
}

interface TestResult {
  status: number
  ok: boolean
  body: string
}

const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PUT: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
}

// 从浏览器保存的地址中读取令牌，作为 token 参数的默认值
function getSavedToken(): string {
  if (typeof window === "undefined") return ""
  try {
    const raw = localStorage.getItem("mailbucket_address")
    if (!raw) return ""
    const parsed = JSON.parse(raw)
    return parsed?.token || ""
  } catch {
    return ""
  }
}

const USER_ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/domains",
    descKey: "api.descDomains",
    params: [],
    curl: 'curl -X GET "BASE/api/v1/domains"',
  },
  {
    method: "POST",
    path: "/api/v1/addresses",
    descKey: "api.descCreateAddress",
    params: [
      { name: "username", type: "body", placeholder: "username (optional)" },
      { name: "domain", type: "body", placeholder: "domain (optional)" },
    ],
    curl: 'curl -X POST "BASE/api/v1/addresses" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"username": "myemail", "domain": "example.com"}\'',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails",
    descKey: "api.descListEmails",
    params: [
      { name: "token", type: "path", placeholder: "token", defaultFrom: "savedToken" },
      { name: "page", type: "query", placeholder: "page (default 1)" },
      { name: "per_page", type: "query", placeholder: "per_page (max 100)" },
      { name: "search", type: "query", placeholder: "search" },
    ],
    curl: 'curl "BASE/api/v1/{token}/emails?page=1&per_page=50&search=invoice"',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}",
    descKey: "api.descGetEmail",
    params: [
      { name: "token", type: "path", placeholder: "token", defaultFrom: "savedToken" },
      { name: "email_id", type: "path", placeholder: "email_id" },
    ],
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}"',
  },
  {
    method: "DELETE",
    path: "/api/v1/{token}/emails/{email_id}",
    descKey: "api.descDeleteEmail",
    destructive: true,
    params: [
      { name: "token", type: "path", placeholder: "token", defaultFrom: "savedToken" },
      { name: "email_id", type: "path", placeholder: "email_id" },
    ],
    curl: 'curl -X DELETE "BASE/api/v1/{token}/emails/{email_id}"',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}/raw",
    descKey: "api.descRawEmail",
    params: [
      { name: "token", type: "path", placeholder: "token", defaultFrom: "savedToken" },
      { name: "email_id", type: "path", placeholder: "email_id" },
    ],
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}/raw" -o message.eml',
  },
  {
    method: "GET",
    path: "/api/v1/{token}/emails/{email_id}/attachments/{attachment_id}",
    descKey: "api.descAttachment",
    params: [
      { name: "token", type: "path", placeholder: "token", defaultFrom: "savedToken" },
      { name: "email_id", type: "path", placeholder: "email_id" },
      { name: "attachment_id", type: "path", placeholder: "attachment_id" },
    ],
    curl: 'curl "BASE/api/v1/{token}/emails/{email_id}/attachments/{attachment_id}" -o file.bin',
  },
]

const ADMIN_ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/admin/stats", descKey: "api.descAdminStats", params: [], curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/stats"' },
  {
    method: "GET", path: "/api/v1/admin/addresses", descKey: "api.descAdminAddresses",
    params: [
      { name: "page", type: "query", placeholder: "page (default 1)" },
      { name: "per_page", type: "query", placeholder: "per_page (max 100)" },
      { name: "search", type: "query", placeholder: "search" },
    ],
    curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses?page=1&per_page=20"',
  },
  {
    method: "GET", path: "/api/v1/admin/addresses/{id}", descKey: "api.descAdminAddressDetail",
    params: [{ name: "id", type: "path", placeholder: "address id" }],
    curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses/{id}"',
  },
  {
    method: "DELETE", path: "/api/v1/admin/addresses/{id}", descKey: "api.descAdminDeleteAddress", destructive: true,
    params: [{ name: "id", type: "path", placeholder: "address id" }],
    curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/addresses/{id}"',
  },
  {
    method: "GET", path: "/api/v1/admin/emails", descKey: "api.descAdminEmails",
    params: [
      { name: "page", type: "query", placeholder: "page (default 1)" },
      { name: "per_page", type: "query", placeholder: "per_page (max 100)" },
      { name: "search", type: "query", placeholder: "search" },
    ],
    curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails?page=1&per_page=20"',
  },
  {
    method: "GET", path: "/api/v1/admin/emails/{id}", descKey: "api.descAdminEmailDetail",
    params: [{ name: "id", type: "path", placeholder: "email id" }],
    curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails/{id}"',
  },
  {
    method: "DELETE", path: "/api/v1/admin/emails/{id}", descKey: "api.descAdminDeleteEmail", destructive: true,
    params: [{ name: "id", type: "path", placeholder: "email id" }],
    curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/emails/{id}"',
  },
  { method: "GET", path: "/api/v1/admin/domains", descKey: "api.descAdminDomains", params: [], curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/domains"' },
  {
    method: "POST", path: "/api/v1/admin/domains", descKey: "api.descAdminAddDomain", destructive: true,
    params: [{ name: "domain", type: "body", placeholder: "domain (e.g. temp.example.com)" }],
    curl: 'curl -X POST -H "Authorization: Bearer <admin.token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"domain": "temp.example.com"}\' "BASE/api/v1/admin/domains"',
  },
  {
    method: "DELETE", path: "/api/v1/admin/domains/{domain}", descKey: "api.descAdminRemoveDomain", destructive: true,
    params: [{ name: "domain", type: "path", placeholder: "domain" }],
    curl: 'curl -X DELETE -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/domains/{domain}"',
  },
  { method: "GET", path: "/api/v1/admin/config", descKey: "api.descAdminConfig", params: [], curl: 'curl -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/config"' },
  {
    method: "PUT", path: "/api/v1/admin/config", descKey: "api.descAdminUpdateConfig", destructive: true,
    params: [{ name: "patch", type: "bodyText", placeholder: '{"tempmail": {"address_lifetime_hours": 48}}' }],
    curl: 'curl -X PUT -H "Authorization: Bearer <admin.token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"tempmail": {"address_lifetime_hours": 48}}\' "BASE/api/v1/admin/config"',
  },
  {
    method: "POST", path: "/api/v1/admin/cleanup/run", descKey: "api.descAdminCleanup", destructive: true,
    params: [],
    curl: 'curl -X POST -H "Authorization: Bearer <admin.token>" "BASE/api/v1/admin/cleanup/run"',
  },
]

const SETUP_ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/setup/status", descKey: "api.descSetupStatus", params: [], curl: 'curl "BASE/api/v1/setup/status"' },
  {
    method: "POST", path: "/api/v1/setup/complete", descKey: "api.descSetupComplete", destructive: true,
    params: [
      { name: "domains", type: "body", placeholder: "domains (comma separated, e.g. example.com,temp.example.com)" },
      { name: "hostname", type: "body", placeholder: "hostname (e.g. mail.example.com)" },
    ],
    curl: 'curl -X POST "BASE/api/v1/setup/complete" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"domains": ["example.com"], "hostname": "mail.example.com"}\'',
  },
]

export default function ApiDocsPage() {
  const { t } = useI18n()
  const [adminToken, setAdminToken] = useState("")
  const [values, setValues] = useState<Record<string, Record<string, string>>>({})
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [copiedCurl, setCopiedCurl] = useState("")

  const baseUrl = API_URL || (typeof window !== "undefined" ? window.location.origin : "")

  const epKey = (ep: Endpoint) => `${ep.method} ${ep.path}`

  const getParam = (ep: Endpoint, name: string): string => {
    const v = values[epKey(ep)]?.[name]
    if (v !== undefined) return v
    const def = ep.params.find((p) => p.name === name)
    if (def?.defaultFrom === "savedToken") return getSavedToken()
    return ""
  }

  const setParam = (ep: Endpoint, name: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [epKey(ep)]: { ...(prev[epKey(ep)] || {}), [name]: value },
    }))
  }

  const buildUrl = (ep: Endpoint): string | null => {
    let path = ep.path
    for (const p of ep.params.filter((x) => x.type === "path")) {
      const v = getParam(ep, p.name).trim()
      if (!v) {
        alert(t("api.fillParams"))
        return null
      }
      path = path.replace(`{${p.name}}`, encodeURIComponent(v))
    }
    const query = ep.params.filter((x) => x.type === "query")
    const qs = query
      .map((p) => ({ name: p.name, value: getParam(ep, p.name).trim() }))
      .filter((x) => x.value)
    const qstr = qs.length
      ? "?" + qs.map((x) => `${encodeURIComponent(x.name)}=${encodeURIComponent(x.value)}`).join("&")
      : ""
    return `${API_URL}${path}${qstr}`
  }

  const buildBody = (ep: Endpoint): string | null => {
    const bodyFields = ep.params.filter((x) => x.type === "body")
    const bodyText = ep.params.find((x) => x.type === "bodyText")
    if (bodyText) {
      const raw = getParam(ep, bodyText.name).trim()
      if (!raw) {
        alert(t("api.fillParams"))
        return null
      }
      try {
        JSON.parse(raw)
      } catch {
        alert("Invalid JSON")
        return null
      }
      return raw
    }
    if (bodyFields.length === 0) return undefined as unknown as null
    const body: Record<string, unknown> = {}
    for (const f of bodyFields) {
      const v = getParam(ep, f.name).trim()
      if (!v) continue
      if (f.name === "domains") {
        body[f.name] = v.split(",").map((s) => s.trim()).filter(Boolean)
      } else {
        body[f.name] = v
      }
    }
    return JSON.stringify(body)
  }

  const runTest = async (ep: Endpoint) => {
    if (ep.destructive && !confirm(t("api.confirmDestructive"))) return
    const url = buildUrl(ep)
    if (url === null) return
    const body = buildBody(ep)
    if (body === null && ep.params.some((p) => p.type === "bodyText")) return

    setTestingKey(epKey(ep))
    setResults((prev) => ({ ...prev, [epKey(ep)]: undefined as unknown as TestResult }))
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (ep.path.startsWith("/api/v1/admin")) {
        headers.Authorization = `Bearer ${adminToken.trim()}`
      }
      const res = await fetch(url, {
        method: ep.method,
        headers,
        body: ["POST", "PUT"].includes(ep.method) && body ? body : undefined,
      })
      const contentType = res.headers.get("content-type") || ""
      const isTextual = /json|text|xml|rfc822|html/i.test(contentType)
      let display: string
      if (isTextual) {
        const text = await res.text()
        try {
          display = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          display = text
        }
      } else {
        const size = (await res.clone().blob()).size
        display = t("api.binaryResponse", { n: size })
      }
      setResults((prev) => ({ ...prev, [epKey(ep)]: { status: res.status, ok: res.ok, body: display } }))
    } catch {
      setResults((prev) => ({ ...prev, [epKey(ep)]: { status: 0, ok: false, body: t("api.testFailed") } }))
    } finally {
      setTestingKey(null)
    }
  }

  const copyCurl = async (ep: Endpoint) => {
    try {
      await copyToClipboard(ep.curl.replaceAll("BASE", baseUrl))
      setCopiedCurl(epKey(ep))
      setTimeout(() => setCopiedCurl(""), 2000)
    } catch {
      // 忽略复制失败
    }
  }

  const renderEndpoint = (ep: Endpoint) => {
    const key = epKey(ep)
    const result = results[key]
    const isTesting = testingKey === key
    const hasParams = ep.params.length > 0

    return (
      <Card key={key}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded border text-xs font-bold ${METHOD_STYLES[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="font-mono text-sm break-all">{ep.path}</code>
                {ep.destructive && (
                  <Badge variant="destructive" className="text-xs">!</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">{t(ep.descKey)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => runTest(ep)} disabled={testingKey !== null}>
                <Play className="h-3.5 w-3.5 mr-1" />
                {isTesting ? t("api.testing") : t("api.runTest")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyCurl(ep)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                {copiedCurl === key ? t("api.copied") : "curl"}
              </Button>
            </div>
          </div>

          {/* 参数输入 */}
          {hasParams && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ep.params.map((p) =>
                p.type === "bodyText" ? (
                  <textarea
                    key={p.name}
                    value={getParam(ep, p.name)}
                    onChange={(e) => setParam(ep, p.name, e.target.value)}
                    placeholder={p.placeholder}
                    rows={3}
                    className="sm:col-span-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <Input
                    key={p.name}
                    value={getParam(ep, p.name)}
                    onChange={(e) => setParam(ep, p.name, e.target.value)}
                    placeholder={p.placeholder || p.name}
                    className="font-mono"
                  />
                ),
              )}
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">{t("api.example")}</summary>
            <pre className="text-xs font-mono bg-muted p-3 rounded-md mt-2 overflow-x-auto">
              {ep.curl.replaceAll("BASE", baseUrl)}
            </pre>
          </details>

          {/* 该条目自己的测试结果 */}
          {isTesting && (
            <div className="text-xs text-muted-foreground animate-pulse">{t("api.testing")}</div>
          )}
          {result && (
            <div className="border rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 text-sm">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                {result.ok ? t("api.testSuccess") : t("api.testFailed")}
                <Badge variant="outline" className="font-mono">
                  HTTP {result.status}
                </Badge>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => copyToClipboard(result.body)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {t("api.copyResponse")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setResults((prev) => ({ ...prev, [key]: undefined as unknown as TestResult }))}
                  >
                    {t("api.closeResponse")}
                  </Button>
                </div>
              </div>
              <pre className="text-xs font-mono p-3 overflow-x-auto max-h-[300px] overflow-y-auto bg-background">
                {result.body}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    )
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
            <Link href="/about" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.about")}
            </Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.privacy")}
            </Link>
            <Link href="/api" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
              {t("nav.api")}
            </Link>
          </nav>
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
            <h3 className="text-lg font-semibold">{t("api.publicSection")}</h3>
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
          </div>

          {/* 初始化 API */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t("api.setupSection")}</h3>
            {SETUP_ENDPOINTS.map(renderEndpoint)}
          </div>
        </div>
      </main>
    </div>
  )
}
