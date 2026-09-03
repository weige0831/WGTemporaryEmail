// English dictionary - the reference locale. All other locales are typed
// against this shape (Partial<Dict>, falling back to English per key).

export const en = {
  nav: {
    about: "About",
    privacy: "Privacy",
  },
  home: {
    yourTempEmail: "Your Temporary Email",
    readyDesc: "Your temporary email is ready. It will be automatically deleted in {time}.",
    loading: "Loading...",
    copy: "Copy",
    copied: "Copied",
    newEmail: "New Email",
    expiresIn: "Expires in {time}",
    inbox: "Inbox",
    auto: "Auto",
    searchEmails: "Search emails...",
    clearSearch: "Clear Search",
    noEmailsYet: "No emails yet",
    autoRefreshingEvery: "Auto-refreshing every {sec}s",
    noSubject: "(No Subject)",
    newBadge: "New",
    selectAnEmail: "Select an email",
    viewContents: "Select an email to view its contents",
    html: "HTML",
    plain: "Plain",
    from: "From:",
    to: "To:",
    date: "Date:",
    dkimValid: "DKIM Valid",
    dkimInvalid: "DKIM Invalid",
    spf: "SPF: {v}",
    dmarc: "DMARC: {v}",
    attachmentsCount: "{n} Attachment(s)",
    attachments: "Attachments",
    noContent: "No content",
    lastRefreshed: "Last refreshed: {time} • Auto-refresh enabled",
    footerText: "WGTemporaryEmail - Open Source Temporary Email Service",
    dialogTitle: "Generate New Email",
    dialogDesc:
      "Create a new temporary email address. Leave the username blank for a random address.",
    customNamePlaceholder: "custom-name (optional)",
    dialogHint:
      "Leave blank for a random email address, or enter a custom username (3-64 chars, alphanumeric + . _ -)",
    generateEmail: "Generate Email",
    creating: "Creating...",
    usernameTaken:
      "This username is currently taken. Please choose a different username or leave it blank for a random email address.",
    failedToCreate: "Failed to create email address. Please try again.",
    failedToLoad: "Failed to load email. Please try again.",
    failedToDelete: "Failed to delete email. Please try again.",
    deleteEmailConfirm: "Delete this email?",
    expiredNewAddress: "{old} has expired. New address: {new}",
  },
  about: {
    aboutTitle: "About WGTemporaryEmail",
    aboutDesc:
      "A privacy-first disposable temporary email service. Open source, self-hosted, no ads, no tracking.",
    aboutP1:
      "Open the homepage to instantly get a temporary email address - no registration and no personal information required. Use it for verification codes, test registrations or trial subscriptions, and keep your real inbox free of spam. Addresses and emails are deleted automatically after a set period.",
    aboutP2:
      "This project is deployed as containers (PostgreSQL + FastAPI + Go mail server + web frontend), so you can easily run it on your own server.",
    feature1T: "Instant Generation",
    feature1D: "One-click random address, custom usernames supported",
    feature2T: "Auto Expiry",
    feature2D: "Addresses and emails are cleaned up automatically, leaving no trace",
    feature3T: "Security Checks",
    feature3D: "Shows DKIM / SPF / DMARC validation results",
    feature4T: "Full Email Support",
    feature4D: "HTML / plain text / attachments / raw email download",
    feature5T: "Fully Open Source",
    feature5D: "Public source code, open for review and customization",
    feature6T: "No Ads, No Tracking",
    feature6D: "No advertisements and no tracking scripts",
    relationTitle: "Relationship with the Source Projects",
    relationDesc: "Open source spirit - standing on the shoulders of giants",
    relationP1: "WGTemporaryEmail is not built from scratch; it is integrated from two excellent open source projects:",
    relationP2:
      "On top of these source projects, this project adds: a Chinese admin panel (statistics, email/address/domain management, hot config updates), a first-run setup wizard, security hardening (rate limiting, XSS sanitization, dependency security updates), a storage cap with automatic cleanup, and more.",
    relationP3:
      "All source projects and this project are MIT licensed, with original copyright notices preserved. Thanks to Lm36 for the great work.",
    sourceTitle: "Source Code",
    sourceDesc: "Star, fork and issues are welcome",
    sourceNote: "For bug reports and feature requests, please open a GitHub issue.",
  },
  privacy: {
    privacyTitle: "Privacy Policy",
    privacyDesc:
      "WGTemporaryEmail is designed with privacy at its core: no registration, no ads, no tracking. This page explains how the service stores and processes data.",
    scopeNote: "This policy applies to this temporary email service instance (\"the Service\").",
    collectTitle: "Data We Collect and Store",
    collectP1: "To provide the inbox feature, the Service stores the following on the server:",
    collectL1: "The temporary email addresses you create and their expiry time",
    collectL2: "Emails sent to those addresses, including sender, subject, body and attachments",
    collectL3: "A random access token bound to the address (used to verify your access)",
    collectP2:
      "Your browser (localStorage) stores the current address and token so you can continue next time. This data stays on your own device only.",
    retentionTitle: "Data Retention and Deletion",
    retentionL1:
      "Addresses and emails are kept for 24 hours by default, then deleted automatically (retention may vary by service configuration)",
    retentionL2: "You can delete emails manually in the UI at any time",
    retentionL3: "When the per-address email limit is exceeded, the oldest emails are cleaned up automatically",
    retentionL4: "Deleted data cannot be recovered",
    notCollectTitle: "What We Do NOT Collect",
    notCollectL1:
      "No registration or login; we never ask for your name, real email, phone number or any personal information",
    notCollectL2: "No ads, and no third-party tracking or analytics scripts",
    notCollectL3: "No selling, sharing or transferring of data to any third party",
    securityTitle: "Email Content and Security",
    securityL1: "Email bodies and attachments are stored in the server database and deleted together with the email",
    securityL2: "HTML emails are sanitized before rendering to prevent malicious scripts",
    securityL3:
      "Accessing an inbox requires the corresponding random access token - do not share it with others",
    securityL4: "DKIM / SPF / DMARC validation results are shown for reference",
    disclaimerTitle: "Usage Tips and Disclaimer",
    disclaimerP1:
      "Temporary email is suitable for one-time scenarios such as verification codes and test registrations. Do not use it for: binding important accounts, banking/payment or other sensitive services, or receiving any emails you cannot afford to lose - all emails are permanently deleted after the address expires.",
    disclaimerP2:
      "Do not send or receive sensitive personal information through temporary email. The Service is not liable for the consequences of data deletion.",
    contactTitle: "Contact Us",
    contactP1: "This project is fully open source. Source code:",
    contactP2: "For privacy questions or data removal requests, please open a GitHub issue.",
  },
}

export type Dict = typeof en
