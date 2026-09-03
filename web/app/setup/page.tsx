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
import { copyToClipboard } from "@/lib/utils"

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<SetupResponse | null>(null)

  // 表单状态
  const [domains, setDomains] = useState<string[]>([""])
  const [hostname, setHostname] = useState("")
  const [hostnameTouched, setHostnameTouched] = useState(false)
  const [adminToken, setAdminToken] = useState("")
  const [serverIp, setServerIp] = useState("")
  const [lifetime, setLifetime] = useState("24")
  const [maxStorage, setMaxStorage] = useState("1024")
  const [allowCustom, setAllowCustom] = useState(true)
  const [copied, setCopied] = useState(false)

  // 检查初始化状态：已完成则跳转首页
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/setup/status`)
        const data = await res.json()
        if (data.initialized) {
          router.replace("/")
          return
        }
        // 预填服务器 IP：如果用户通过 IP 直接访问，location.hostname 就是服务器 IP
        if (typeof window !== "undefined" && looksLikeIP(window.location.hostname)) {
          setServerIp(window.location.hostname)
        }
        setLoading(false)
      } catch {
        setError("无法连接后端服务，请确认服务已启动")
        setLoading(false)
      }
    })()
  }, [router])

  const updateDomain = (index: number, value: string) => {
    const next = [...domains]
    next[index] = value
    setDomains(next)
    // 未手动改过主机名时，跟随第一个域名自动建议
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
      setError("请至少填写一个域名")
      return
    }
    if (!hostname.trim()) {
      setError("请填写邮件服务器主机名")
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
        setError(detail || `初始化失败 (${res.status})`)
        return
      }
      setResult(data)
    } catch {
      setError("网络错误，请重试")
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

  // 初始化完成视图
  if (result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-2" />
            <CardTitle className="text-xl">初始化完成</CardTitle>
            <CardDescription>服务已就绪。请先保存下面的信息，再按提示配置 DNS。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">管理面板令牌（仅显示这一次，请妥善保存）</label>
              <div className="flex gap-2 mt-1">
                <Input value={result.admin_token} readOnly className="font-mono" />
                <Button variant="outline" onClick={copyToken} className="shrink-0">
                  <Copy className="h-4 w-4 mr-2" />
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground">需要添加的 DNS 记录</label>
              <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-2 mt-1">
                <div>
                  <span className="text-muted-foreground">A 记录：</span>
                  <div className="mt-1">{result.hostname}. → {serverIp || "你的服务器IP"}</div>
                </div>
                {result.domains.map((d) => (
                  <div key={d}>
                    <span className="text-muted-foreground">MX 记录（{d}）：</span>
                    <div className="mt-1">{d}. → MX 10 {result.hostname}.</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                建议同时向 VPS 服务商申请把 {serverIp || "服务器 IP"} 的反解（PTR）设置为 {result.hostname}。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Link href="/" className="flex-1">
                <Button className="w-full">
                  <Rocket className="h-4 w-4 mr-2" />
                  打开用户前端
                </Button>
              </Link>
              <Link href="/admin" className="flex-1">
                <Button variant="outline" className="w-full">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  打开管理面板
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 向导表单
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Tempmail Server 首次配置</h1>
          <p className="text-sm text-muted-foreground">
            首次使用前请完成以下配置。完成后可随时在管理面板中修改。
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              收信域名
            </CardTitle>
            <CardDescription>本服务接收邮件的域名（至少一个），例如你的域名 example.com</CardDescription>
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
              添加域名
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              邮件服务器主机名
            </CardTitle>
            <CardDescription>MX 记录指向的主机名，DNS 中该名称的 A 记录应指向本服务器</CardDescription>
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
              管理令牌
            </CardTitle>
            <CardDescription>登录管理面板（/admin）所需的令牌，留空则自动生成</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={adminToken}
              placeholder="留空自动生成"
              onChange={(e) => setAdminToken(e.target.value)}
              className="font-mono"
            />
            <Button variant="outline" onClick={generateToken} className="shrink-0">
              <RefreshCw className="h-4 w-4 mr-2" />
              随机生成
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">可选设置</CardTitle>
            <CardDescription>以下均可在管理面板中随时修改</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">地址有效期（小时）</label>
                <Input type="number" min={1} value={lifetime} onChange={(e) => setLifetime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">总存储上限（MB，0 不限制）</label>
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
              允许用户自定义邮箱用户名
            </label>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">服务器公网 IP（用于生成 DNS 记录提示）</label>
              <Input
                value={serverIp}
                placeholder="例如 216.238.53.44"
                onChange={(e) => setServerIp(e.target.value)}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base">
          {saving ? "保存中..." : "保存并完成初始化"}
        </Button>
      </div>
    </div>
  )
}
