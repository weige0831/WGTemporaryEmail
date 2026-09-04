"use client"

import { Mail, Github, Code, Shield, Zap, Trash2, HeartHandshake } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

const REPO_URL = "https://github.com/weige0831/WGTemporaryEmail"

export default function AboutPage() {
  const { t } = useI18n()

  const features = [
    { icon: Zap, title: t("about.feature1T"), desc: t("about.feature1D") },
    { icon: Trash2, title: t("about.feature2T"), desc: t("about.feature2D") },
    { icon: Shield, title: t("about.feature3T"), desc: t("about.feature3D") },
    { icon: Mail, title: t("about.feature4T"), desc: t("about.feature4D") },
    { icon: Code, title: t("about.feature5T"), desc: t("about.feature5D") },
    { icon: HeartHandshake, title: t("about.feature6T"), desc: t("about.feature6D") },
  ]

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
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("about.aboutTitle")}</CardTitle>
              <CardDescription>{t("about.aboutDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>{t("about.aboutP1")}</p>
              <p>{t("about.aboutP2")}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => {
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
              <CardTitle className="text-lg">{t("about.relationTitle")}</CardTitle>
              <CardDescription>{t("about.relationDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{t("about.relationP1")}</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <a href="https://github.com/Lm36/tempmail-server" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Lm36/tempmail-server
                  </a>
                  {" - "}
                  <span className="text-muted-foreground">FastAPI REST API · Go SMTP/MX · PostgreSQL</span>
                </li>
                <li>
                  <a href="https://github.com/Lm36/mailbucket" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Lm36/mailbucket
                  </a>
                  {" - "}
                  <span className="text-muted-foreground">Next.js user frontend</span>
                </li>
              </ul>
              <p>{t("about.relationP2")}</p>
              <p className="text-muted-foreground">
                {t("about.relationP3")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Github className="h-5 w-5" />
                {t("about.sourceTitle")}
              </CardTitle>
              <CardDescription>{t("about.sourceDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono break-all">
                {REPO_URL}
              </a>
              <p className="text-muted-foreground mt-2">{t("about.sourceNote")}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
