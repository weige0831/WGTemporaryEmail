import { Mail, Github, Code, Shield, Zap, Trash2, HeartHandshake } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const REPO_URL = "https://github.com/weige0831/WGTemporaryEmail"

export default function AboutPage() {
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
              <CardTitle className="text-xl">关于 WGTemporaryEmail</CardTitle>
              <CardDescription>
                一个隐私优先的一次性临时邮箱服务，开源、自托管、无广告、无追踪。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                打开首页即可获得一个临时邮箱地址，无需注册、无需提供任何个人信息。
                用它来接收验证码、注册测试账号、订阅试用，保护你的真实邮箱免受垃圾邮件的骚扰。
                地址和邮件会在设定的时间后自动删除。
              </p>
              <p>
                本项目以容器化方式部署（PostgreSQL + FastAPI + Go 邮件服务器 + 网页前端），
                你可以轻松部署到自己的服务器上运行。
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Zap, title: "即时生成", desc: "一键生成随机地址，也支持自定义用户名" },
              { icon: Trash2, title: "自动过期", desc: "地址与邮件到期自动清理，不留痕迹" },
              { icon: Shield, title: "安全校验", desc: "展示 DKIM / SPF / DMARC 校验结果" },
              { icon: Mail, title: "完整邮件支持", desc: "HTML / 纯文本 / 附件 / 原始邮件下载" },
              { icon: Code, title: "完全开源", desc: "源代码公开，可自行审查与二次开发" },
              { icon: HeartHandshake, title: "无广告无追踪", desc: "不投放广告，不运行任何追踪脚本" },
            ].map((f) => {
              const Icon = f.icon
              return (
                <Card key={f.title}>
                  <CardHeader className="pb-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">与源项目的关系</CardTitle>
              <CardDescription>开源精神，站在前人的肩膀上</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                WGTemporaryEmail 不是一个从零开始的项目，它基于以下两个优秀开源项目整合构建：
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <a href="https://github.com/Lm36/tempmail-server" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Lm36/tempmail-server
                  </a>
                  —— 收信后端：FastAPI REST API、Go 编写的 SMTP/MX 收信服务器、PostgreSQL 存储
                </li>
                <li>
                  <a href="https://github.com/Lm36/mailbucket" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Lm36/mailbucket
                  </a>
                  —— 临时邮箱用户前端（Next.js）
                </li>
              </ul>
              <p>
                在上述源项目的基础上，本项目扩展了：中文管理面板（统计、邮件/地址/域名管理、配置热更新）、
                首次访问配置向导、安全加固（速率限制、XSS 消毒、依赖安全更新）、
                存储占用上限与自动清理等能力。
              </p>
              <p className="text-muted-foreground">
                所有源项目与本项目均采用 MIT 许可证，保留原作者版权声明。感谢
                <a href="https://github.com/Lm36" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline"> Lm36 </a>
                的出色工作。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Github className="h-5 w-5" />
                源代码
              </CardTitle>
              <CardDescription>欢迎 Star、Fork 和提交 Issue</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono break-all">
                {REPO_URL}
              </a>
              <p className="text-muted-foreground mt-2">
                问题反馈与功能建议请通过 GitHub Issues 提交。
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
