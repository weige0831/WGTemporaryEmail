"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Copy,
  Globe,
  Server,
  KeyRound,
  Rocket,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { copyToClipboard } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

interface SetupResponse {
  initialized: boolean
  admin_token: string
  domains: string[]
  hostname: string
}

function looksLikeIP(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
}

export default function SetupWizard() {
  const router = useRouter()
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<SetupResponse | null>(null)

  const [domains, setDomains] = useState<string[]>([""])
  const [hostname, setHostname] = useState("")
  const [hostnameTouched, setHostnameTouched] = useState(false)
  const [adminToken, setAdminToken] = useState("")
  const [serverIp, setServerIp] = useState("")
  const [lifetime, setLifetime] = useState("24")
  const [maxStorage, setMaxStorage] = useState("1024")
  const [allowCustom, setAllowCustom] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/setup/status`)
        const data = await res.json()
        if (data.initialized) {
          router.replace("/")
          return
        }
        if (typeof window !== "undefined" && looksLikeIP(window.location.hostname)) {
          setServerIp(window.location.hostname)
        }
        setLoading(false)
      } catch {
        setError(t("setup.backendUnreachable"))
        setLoading(false)
      }
    })()
  }, [router, t])

  const updateDomain = (index: number, value: string) => {
    const next = [...domains]
    next[index] = value
    setDomains(next)
    if (index === 0 && !hostnameTouched) {
      const d = value.trim().toLowerCase()
      setHostname(d ? `mail.${d}` : "")
    }
  }

  const generateToken = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    let token = ""
    const arr = new Uint32Array(32)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 32; i++) token += chars[arr[i] % chars.length]
    setAdminToken(token)
  }

  const handleSave = async () => {
    setError("")
    const cleaned = domains.map((d) => d.trim().toLowerCase()).filter(Boolean)
    if (cleaned.length === 0) {
      setError(t("setup.needDomain"))
      return
    }
    if (!hostname.trim()) {
      setError(t("setup.needHostname"))
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        domains: cleaned,
        hostname: hostname.trim().toLowerCase(),
        admin_token: adminToken.trim() || null,
        address_lifetime_hours: Number(lifetime) || 24,
        max_storage_mb: maxStorage.trim() === "" ? null : Number(maxStorage),
        allow_custom_usernames: allowCustom,
      }
      const res = await fetch(`${API_URL}/api/v1/setup/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || data)
        setError(detail || `Setup failed (${res.status})`)
        return
      }
      setResult(data)
    } catch {
      setError(t("setup.networkError"))
    } finally {
      setSaving(false)
    }
  }

  const copyToken = async () => {
    if (!result) return
    try {
      await copyToClipboard(result.admin_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略复制失败
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-2" />
            <CardTitle className="text-xl">{t("setup.doneTitle")}</CardTitle>
            <CardDescription>{t("setup.doneDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">{t("setup.tokenLabel")}</label>
              <div className="flex gap-2 mt-1">
                <Input value={result.admin_token} readOnly className="font-mono" />
                <Button variant="outline" onClick={copyToken} className="shrink-0">
                  <Copy className="h-4 w-4 mr-2" />
                  {copied ? t("setup.copied") : t("setup.copy")}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">{t("setup.dnsLabel")}</label>
              <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-2 mt-1">
                <div>
                  {t("setup.aRecord")}
                  <div className="mt-1">{result.hostname}. → {serverIp || t("setup.yourServerIp")}</div>
                </div>
                {result.domains.map((d) => (
                  <div key={d}>
                    {t("setup.mxRecord", { domain: d })}
                    <div className="mt-1">{d}. → MX 10 {result.hostname}.</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("setup.ptrHint", { ip: serverIp || t("setup.yourServerIp"), hostname: result.hostname })}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Link href="/" className="flex-1">
                <Button className="w-full">
                  <Rocket className="h-4 w-4 mr-2" />
                  {t("setup.openSite")}
                </Button>
              </Link>
              <Link href="/admin" className="flex-1">
                <Button variant="outline" className="w-full">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {t("setup.openAdmin")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">WGTemporaryEmail · {t("setup.setupTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("setup.setupIntro")}</p>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("setup.domainsSection")}
            </CardTitle>
            <CardDescription>{t("setup.domainsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {domains.map((d, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={d}
                  placeholder={i === 0 ? "example.com" : "temp.example.com"}
                  onChange={(e) => updateDomain(i, e.target.value)}
                  className="font-mono"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDomains(domains.filter((_, j) => j !== i))}
                  disabled={domains.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDomains([...domains, ""])}>
              <Plus className="h-4 w-4 mr-2" />
              {t("setup.addDomain")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t("setup.hostnameSection")}
            </CardTitle>
            <CardDescription>{t("setup.hostnameDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={hostname}
              placeholder="mail.example.com"
              onChange={(e) => {
                setHostname(e.target.value)
                setHostnameTouched(true)
              }}
              className="font-mono"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t("setup.tokenSection")}
            </CardTitle>
            <CardDescription>{t("setup.tokenDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={adminToken}
              placeholder={t("setup.tokenPlaceholder")}
              onChange={(e) => setAdminToken(e.target.value)}
              className="font-mono"
            />
            <Button variant="outline" onClick={generateToken} className="shrink-0">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("setup.generate")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("setup.optionalSection")}</CardTitle>
            <CardDescription>{t("setup.optionalDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">{t("setup.lifetimeLabel")}</label>
                <Input type="number" min={1} value={lifetime} onChange={(e) => setLifetime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">{t("setup.storageLabel")}</label>
                <Input type="number" min={0} value={maxStorage} onChange={(e) => setMaxStorage(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allowCustom}
                onChange={(e) => setAllowCustom(e.target.checked)}
                className="h-4 w-4"
              />
              {t("setup.allowCustom")}
            </label>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("setup.serverIpLabel")}</label>
              <Input
                value={serverIp}
                placeholder={t("setup.serverIpPlaceholder")}
                onChange={(e) => setServerIp(e.target.value)}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base">
          {saving ? t("setup.saving") : t("setup.saveBtn")}
        </Button>
      </div>
    </div>
  )
}
