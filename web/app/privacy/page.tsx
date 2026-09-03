import { Mail, Github, Database, Clock, ShieldCheck, EyeOff } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const REPO_URL = "https://github.com/weige0831/WGTemporaryEmail"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">WGTemporaryEmail</h1>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/about" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              关于
            </Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground">
              隐私
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">隐私政策</CardTitle>
              <CardDescription>
                WGTemporaryEmail 以隐私为设计核心：无需注册、无广告、无追踪。
                本页说明服务如何存储与处理数据。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>本政策适用于本临时邮箱服务实例（以下称"本服务"）。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                我们收集与存储的数据
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>为了提供收信功能，本服务会在服务器端存储以下内容：</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>你创建的临时邮箱地址及其过期时间</li>
                <li>发往该地址的邮件，包括发件人、主题、正文与附件</li>
                <li>该地址对应的随机访问令牌（用于验证你对这个邮箱的访问权）</li>
              </ul>
              <p>
                你的浏览器本地（localStorage）会保存当前邮箱地址与令牌，以便下次打开时继续使用。
                这些信息仅保存在你自己的设备上。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                数据保留与删除
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>地址与邮件默认保留 24 小时，到期后由系统自动删除（保留时长可能因服务配置而异）</li>
                <li>你可以随时在界面中手动删除邮件</li>
                <li>超过单地址邮件数上限时，最早的邮件会被自动清理</li>
                <li>删除后的数据不可恢复</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <EyeOff className="h-5 w-5 text-primary" />
                我们不收集的信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>无需注册或登录，不要求提供姓名、真实邮箱、手机号等任何个人信息</li>
                <li>不投放广告，不运行任何第三方追踪或统计分析脚本</li>
                <li>不向任何第三方出售、共享或转让数据</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                邮件内容与安全
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>邮件正文与附件存储于服务端数据库，随邮件一并删除</li>
                <li>HTML 邮件在渲染前经过净化处理，防止恶意脚本执行</li>
                <li>访问邮箱需要持有对应的随机访问令牌，请勿将令牌泄露给他人</li>
                <li>服务会展示 DKIM / SPF / DMARC 校验结果供参考</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">使用建议与免责声明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                临时邮箱适合接收验证码、测试注册等一次性场景。请勿将其用于：
                重要账户的绑定、银行/支付等敏感服务、或接收任何你无法承受丢失的邮件——
                地址到期后所有邮件将被永久删除。
              </p>
              <p className="text-muted-foreground">
                请勿通过临时邮箱发送或接收敏感个人信息。本服务不对数据删除造成的影响承担责任。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Github className="h-5 w-5 text-primary" />
                联系我们
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                本项目完全开源，源代码见{" "}
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono break-all">
                  {REPO_URL}
                </a>
              </p>
              <p className="text-muted-foreground">
                对隐私政策有疑问或需要删除数据，请通过 GitHub Issues 联系我们。
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
