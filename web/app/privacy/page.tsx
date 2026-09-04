"use client"

import { Mail, Github, Database, Clock, ShieldCheck, EyeOff } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

const REPO_URL = "https://github.com/weige0831/WGTemporaryEmail"

export default function PrivacyPage() {
  const { t } = useI18n()

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
              <CardTitle className="text-xl">{t("privacy.privacyTitle")}</CardTitle>
              <CardDescription>{t("privacy.privacyDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <p>{t("privacy.scopeNote")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                {t("privacy.collectTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{t("privacy.collectP1")}</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("privacy.collectL1")}</li>
                <li>{t("privacy.collectL2")}</li>
                <li>{t("privacy.collectL3")}</li>
              </ul>
              <p>{t("privacy.collectP2")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {t("privacy.retentionTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("privacy.retentionL1")}</li>
                <li>{t("privacy.retentionL2")}</li>
                <li>{t("privacy.retentionL3")}</li>
                <li>{t("privacy.retentionL4")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <EyeOff className="h-5 w-5 text-primary" />
                {t("privacy.notCollectTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("privacy.notCollectL1")}</li>
                <li>{t("privacy.notCollectL2")}</li>
                <li>{t("privacy.notCollectL3")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t("privacy.securityTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("privacy.securityL1")}</li>
                <li>{t("privacy.securityL2")}</li>
                <li>{t("privacy.securityL3")}</li>
                <li>{t("privacy.securityL4")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t("privacy.disclaimerTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{t("privacy.disclaimerP1")}</p>
              <p>{t("privacy.disclaimerP2")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Github className="h-5 w-5 text-primary" />
                {t("privacy.contactTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                {t("privacy.contactP1")}{" "}
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono break-all">
                  {REPO_URL}
                </a>
              </p>
              <p className="text-muted-foreground">{t("privacy.contactP2")}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
