"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, RefreshCw, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminApi, ApiError, clearAdminToken } from "@/lib/admin-api"
import { useI18n } from "@/lib/i18n"

interface ConfigData {
  server?: { max_message_size_mb?: number; docs_enabled?: boolean; hostname?: string }
  tempmail?: {
    address_lifetime_hours?: number
    max_emails_per_address?: number
    max_storage_mb?: number
    cleanup_interval_hours?: number
    allow_custom_usernames?: boolean
    min_username_length?: number
    max_username_length?: number
  }
  validation?: {
    check_dkim?: boolean
    check_spf?: boolean
    check_dmarc?: boolean
    store_results?: boolean
  }
  cors?: { allow_origins?: string[] }
  database?: { pool_size?: number; max_overflow?: number }
  [key: string]: unknown
}

const INT_FIELDS: { section: keyof ConfigData; key: string; labelKey: string; min?: number; allowZero?: boolean }[] = [
  { section: "server", key: "max_message_size_mb", labelKey: "admin.maxMsgSizeMb", min: 1 },
  { section: "tempmail", key: "address_lifetime_hours", labelKey: "admin.addressLifetime", min: 1 },
  { section: "tempmail", key: "max_emails_per_address", labelKey: "admin.maxEmailsPerAddress", min: 1 },
  { section: "tempmail", key: "max_storage_mb", labelKey: "admin.maxStorageMb", allowZero: true },
  { section: "tempmail", key: "cleanup_interval_hours", labelKey: "admin.cleanupInterval", min: 1 },
  { section: "tempmail", key: "min_username_length", labelKey: "admin.minUsernameLength", min: 1 },
  { section: "tempmail", key: "max_username_length", labelKey: "admin.maxUsernameLength", min: 1 },
  { section: "database", key: "pool_size", labelKey: "admin.poolSize", min: 1 },
  { section: "database", key: "max_overflow", labelKey: "admin.maxOverflow", min: 1 },
]

const BOOL_FIELDS: { section: keyof ConfigData; key: string; labelKey: string }[] = [
  { section: "server", key: "docs_enabled", labelKey: "admin.docsEnabled" },
  { section: "tempmail", key: "allow_custom_usernames", labelKey: "admin.allowCustomUsernames" },
  { section: "validation", key: "check_dkim", labelKey: "admin.checkDkim" },
  { section: "validation", key: "check_spf", labelKey: "admin.checkSpf" },
  { section: "validation", key: "check_dmarc", labelKey: "admin.checkDmarc" },
  { section: "validation", key: "store_results", labelKey: "admin.storeResults" },
]

function getValue(config: ConfigData, section: keyof ConfigData, key: string): string | boolean {
  const sec = config[section]
  if (typeof sec === "object" && sec !== null && key in sec) {
    return (sec as Record<string, unknown>)[key] as string | boolean
  }
  return ""
}

export default function AdminConfig() {
  const router = useRouter()
  const { t } = useI18n()
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [form, setForm] = useState<Record<string, string | boolean>>({})
  const [corsOrigins, setCorsOrigins] = useState("")
  const [adminTokenInput, setAdminTokenInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const fetchConfig = async () => {
    setError("")
    try {
      const res = await adminApi.getConfig()
      const cfg = res.config as ConfigData
      setConfig(cfg)
      const f: Record<string, string | boolean> = {}
      for (const field of INT_FIELDS) {
        const v = getValue(cfg, field.section, field.key)
        f[`${field.section}.${field.key}`] = v === "" ? "" : String(v)
      }
      for (const field of BOOL_FIELDS) {
        f[`${field.section}.${field.key}`] = getValue(cfg, field.section, field.key) === true
      }
      f["server.hostname"] = typeof getValue(cfg, "server", "hostname") === "string" ? String(getValue(cfg, "server", "hostname")) : ""
      setForm(f)
      setCorsOrigins((cfg.cors?.allow_origins || []).join("\n"))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.loadFailed"))
    }
  }

  useEffect(() => {
    fetchConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setError("")
    setNotice("")
    setLoading(true)
    try {
      const patch: Record<string, Record<string, unknown>> = {}

      for (const field of INT_FIELDS) {
        const raw = form[`${field.section}.${field.key}`]
        if (raw === "" || raw === undefined) continue
        const num = Number(raw)
        const minAllowed = field.allowZero ? 0 : (field.min ?? 1)
        if (isNaN(num) || !Number.isInteger(num) || num < minAllowed) {
          setError(t("admin.intMinError", { n: minAllowed }))
          setLoading(false)
          return
        }
        ;(patch[field.section as string] ||= {})[field.key] = num
      }

      for (const field of BOOL_FIELDS) {
        const current = getValue(config as ConfigData, field.section, field.key)
        const next = form[`${field.section}.${field.key}`] === true
        if (current !== next) {
          ;(patch[field.section as string] ||= {})[field.key] = next
        }
      }

      const hostname = (form["server.hostname"] ?? "").toString().trim()
      const currentHostname = getValue(config as ConfigData, "server", "hostname")
      if (hostname && hostname !== currentHostname) {
        ;(patch.server ||= {}).hostname = hostname
      }

      const tokenChanged = adminTokenInput.trim().length > 0
      if (tokenChanged) {
        ;(patch.admin ||= {}).token = adminTokenInput.trim()
      }

      const origins = corsOrigins
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
      const currentOrigins = (config?.cors?.allow_origins || []).join("\n")
      if (origins.join("\n") !== currentOrigins) {
        ;(patch.cors ||= {}).allow_origins = origins
      }

      if (Object.keys(patch).length === 0) {
        setNotice(t("admin.nothingToSave"))
        setLoading(false)
        return
      }

      await adminApi.updateConfig(patch)

      if (tokenChanged) {
        clearAdminToken()
        alert(t("admin.tokenUpdated"))
        router.replace("/admin")
        return
      }

      setNotice(t("admin.savedReloaded"))
      await fetchConfig()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(t("admin.saveFailed"))
    } finally {
      setLoading(false)
    }
  }

  const setField = (name: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.configTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("admin.configHotReloadNote")}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 可编辑配置 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.mailSection")}</CardTitle>
              <CardDescription>{t("admin.mailSectionDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {INT_FIELDS.filter((f) => f.section === "tempmail" || f.section === "server").map((f) => (
                <div key={`${f.section}.${f.key}`} className="space-y-1">
                  <label className="text-sm text-muted-foreground">{t(f.labelKey)}</label>
                  <Input
                    type="number"
                    min={f.allowZero ? 0 : (f.min ?? 1)}
                    value={String(form[`${f.section}.${f.key}`] ?? "")}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.value)}
                  />
                  {f.key === "max_storage_mb" && (
                    <p className="text-xs text-muted-foreground">{t("admin.storageCapHint")}</p>
                  )}
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">{t("admin.mailHostname")}</label>
                <Input
                  value={String(form["server.hostname"] ?? "")}
                  onChange={(e) => setField("server.hostname", e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">{t("admin.hostnameHint")}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                {t("admin.tokenSection")}
              </CardTitle>
              <CardDescription>{t("admin.tokenSectionDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                type="password"
                placeholder={t("admin.tokenPlaceholder")}
                value={adminTokenInput}
                onChange={(e) => setAdminTokenInput(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("admin.tokenHint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.switchesSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {BOOL_FIELDS.map((f) => (
                <label
                  key={`${f.section}.${f.key}`}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form[`${f.section}.${f.key}`] === true}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.checked)}
                    className="h-4 w-4"
                  />
                  {t(f.labelKey)}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.databaseSection")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {INT_FIELDS.filter((f) => f.section === "database").map((f) => (
                <div key={`${f.section}.${f.key}`} className="space-y-1">
                  <label className="text-sm text-muted-foreground">{t(f.labelKey)}</label>
                  <Input
                    type="number"
                    min={f.min ?? 1}
                    value={String(form[`${f.section}.${f.key}`] ?? "")}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.value)}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{t("admin.poolHint")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("admin.corsSection")}</CardTitle>
              <CardDescription>{t("admin.corsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <textarea
                value={corsOrigins}
                onChange={(e) => setCorsOrigins(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={loading || !config} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {loading ? t("admin.saving") : t("admin.saveReload")}
          </Button>
        </div>

        {/* 完整配置（脱敏） */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("admin.currentConfigTitle")}</CardTitle>
              <Button onClick={fetchConfig} variant="ghost" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
