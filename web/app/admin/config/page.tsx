"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, RefreshCw, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminApi, ApiError, clearAdminToken } from "@/lib/admin-api"

interface ConfigData {
  server?: { max_message_size_mb?: number; docs_enabled?: boolean }
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

const INT_FIELDS: { section: keyof ConfigData; key: string; label: string; min?: number }[] = [
  { section: "server", key: "max_message_size_mb", label: "单封邮件大小上限 (MB)", min: 1 },
  { section: "tempmail", key: "address_lifetime_hours", label: "地址有效期 (小时)", min: 1 },
  { section: "tempmail", key: "max_emails_per_address", label: "每个地址最多邮件数", min: 1 },
  { section: "tempmail", key: "max_storage_mb", label: "总存储占用上限 (MB，0 不限制)" },
  { section: "tempmail", key: "cleanup_interval_hours", label: "清理任务间隔 (小时)", min: 1 },
  { section: "tempmail", key: "min_username_length", label: "用户名最短长度", min: 1 },
  { section: "tempmail", key: "max_username_length", label: "用户名最长长度", min: 1 },
  { section: "database", key: "pool_size", label: "数据库连接池大小", min: 1 },
  { section: "database", key: "max_overflow", label: "连接池最大溢出", min: 1 },
]

const BOOL_FIELDS: { section: keyof ConfigData; key: string; label: string }[] = [
  { section: "server", key: "docs_enabled", label: "启用 API 文档 (/docs Swagger)" },
  { section: "tempmail", key: "allow_custom_usernames", label: "允许自定义用户名" },
  { section: "validation", key: "check_dkim", label: "校验 DKIM" },
  { section: "validation", key: "check_spf", label: "校验 SPF" },
  { section: "validation", key: "check_dmarc", label: "校验 DMARC" },
  { section: "validation", key: "store_results", label: "存储校验结果" },
]

const STRING_FIELDS: { section: keyof ConfigData; key: string; label: string }[] = [
  { section: "server", key: "hostname", label: "邮件服务器主机名" },
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
      for (const field of STRING_FIELDS) {
        const v = getValue(cfg, field.section, field.key)
        f[`${field.section}.${field.key}`] = typeof v === "string" ? v : ""
      }
      setForm(f)
      setCorsOrigins((cfg.cors?.allow_origins || []).join("\n"))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("加载失败，请重试")
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
        // max_storage_mb allows 0 (unlimited); other int fields require >= 1
        const isStorageCap = field.key === "max_storage_mb"
        const minAllowed = isStorageCap ? 0 : (field.min ?? 1)
        if (isNaN(num) || !Number.isInteger(num) || num < minAllowed) {
          setError(`${field.label} 必须是 ≥${minAllowed} 的整数`)
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

      for (const field of STRING_FIELDS) {
        const v = (form[`${field.section}.${field.key}`] ?? "").toString().trim()
        const current = getValue(config as ConfigData, field.section, field.key)
        if (v && v !== current) {
          ;(patch[field.section as string] ||= {})[field.key] = v
        }
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
        setNotice("没有需要保存的修改")
        setLoading(false)
        return
      }

      await adminApi.updateConfig(patch)

      if (tokenChanged) {
        clearAdminToken()
        alert("管理令牌已更新，请使用新令牌重新登录")
        router.replace("/admin")
        return
      }

      setNotice("配置已保存并热重载（无需重启服务）")
      await fetchConfig()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError("保存失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const setField = (name: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">系统配置</h1>
      <p className="text-sm text-muted-foreground">
        修改保存后立即热重载生效，无需重启服务。写入 config.yaml 时会移除其中的注释。
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-primary">{notice}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 可编辑配置 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">邮件与地址</CardTitle>
              <CardDescription>tempmail / server 相关参数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {INT_FIELDS.filter((f) => f.section === "tempmail" || f.section === "server").map((f) => (
                <div key={`${f.section}.${f.key}`} className="space-y-1">
                  <label className="text-sm text-muted-foreground">{f.label}</label>
                  <Input
                    type="number"
                    min={f.key === "max_storage_mb" ? 0 : (f.min ?? 1)}
                    value={String(form[`${f.section}.${f.key}`] ?? "")}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.value)}
                  />
                  {f.key === "max_storage_mb" && (
                    <p className="text-xs text-muted-foreground">
                      0 表示不限制；超过上限时清理任务会按“最旧邮件优先”删除，直到低于该值。
                    </p>
                  )}
                </div>
              ))}
              {STRING_FIELDS.map((f) => (
                <div key={`${f.section}.${f.key}`} className="space-y-1">
                  <label className="text-sm text-muted-foreground">{f.label}</label>
                  <Input
                    value={String(form[`${f.section}.${f.key}`] ?? "")}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    修改后需重启 MX 容器，SMTP 横幅中的主机名才会更新。
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                管理令牌
              </CardTitle>
              <CardDescription>修改后需使用新令牌重新登录管理面板</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                type="password"
                placeholder="输入新令牌（留空则不修改）"
                value={adminTokenInput}
                onChange={(e) => setAdminTokenInput(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">至少 8 个字符，建议 16 个以上</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">功能开关</CardTitle>
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
                  {f.label}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">数据库</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {INT_FIELDS.filter((f) => f.section === "database").map((f) => (
                <div key={`${f.section}.${f.key}`} className="space-y-1">
                  <label className="text-sm text-muted-foreground">{f.label}</label>
                  <Input
                    type="number"
                    min={f.min ?? 1}
                    value={String(form[`${f.section}.${f.key}`] ?? "")}
                    onChange={(e) => setField(`${f.section}.${f.key}`, e.target.value)}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                注意：pool_size / max_overflow 修改后需要重启 API 容器才会真正生效（连接池在启动时创建）。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">CORS 允许来源</CardTitle>
              <CardDescription>每行一个来源，输入 * 表示允许所有</CardDescription>
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
            {loading ? "保存中..." : "保存并热重载"}
          </Button>
        </div>

        {/* 完整配置（脱敏） */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">当前完整配置（敏感信息已脱敏）</CardTitle>
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
