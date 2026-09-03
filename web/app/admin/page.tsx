"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminApi, ApiError, setAdminToken } from "@/lib/admin-api"

export default function AdminLogin() {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError("")
    setLoading(true)
    // 先写入本地，用一次真实请求验证令牌
    setAdminToken(token.trim())
    try {
      await adminApi.getStats()
      router.replace("/admin/dashboard")
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError("登录失败，请检查网络后重试")
      }
      setAdminToken("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-xl">管理面板登录</CardTitle>
          <CardDescription>输入 config.yaml 中配置的管理令牌</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <KeyRound className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="管理令牌"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin()
                }}
                className="pl-8"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button onClick={handleLogin} disabled={loading || !token.trim()} className="w-full">
            {loading ? "登录中..." : "登录"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            令牌只保存在浏览器本地，不会上传到任何第三方
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
