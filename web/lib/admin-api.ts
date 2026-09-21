// 管理面板 API 客户端：统一携带 Bearer 令牌，401 时清除本地令牌
// 错误文案走 i18n（translate），避免 16 种语言的面板里混入固定中文。

import { currentLang, translate } from '@/lib/i18n'
import { formatBytes } from '@/lib/utils'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'tempmail_admin_token'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (res.status === 401) {
    clearAdminToken()
    throw new ApiError(401, translate('admin.sessionExpired'))
  }

  if (!res.ok) {
    // 4xx 一般是后端返回的具体校验信息（如主机名格式），原样展示更有用；
    // 其余（限流、服务端错误）用本地化文案，避免出现固定中文。
    let detail = translate('admin.requestFailed', { status: res.status })
    try {
      const data = await res.json()
      if (typeof data.detail === 'string' && res.status >= 400 && res.status < 500 && res.status !== 429) {
        detail = data.detail
      } else if (res.status === 429) {
        detail = translate('admin.tooManyRequests')
      } else if (res.status >= 500) {
        detail = translate('admin.serverError')
      }
    } catch {
      // 忽略解析失败，使用默认错误信息
    }
    throw new ApiError(res.status, detail)
  }

  return res.json()
}

// ---------- 类型定义（与后端 schemas/admin.py 对应） ----------

export interface AdminStats {
  domains: string[]
  total_addresses: number
  active_addresses: number
  total_emails: number
  unread_emails: number
  emails_24h: number
  total_attachments: number
  email_size_bytes: number
  attachment_size_bytes: number
  max_storage_mb: number
  db_ok: boolean
  uptime_seconds: number
  address_lifetime_hours: number
  cleanup_interval_hours: number
  permanent_email_retention_days: number
}

export interface AdminAddressSummary {
  id: string
  email: string
  address_type: string
  created_at: string
  expires_at: string | null
  is_expired: boolean
  email_count: number
  unread_count: number
  last_email_at: string | null
}

export interface AdminAddressList {
  items: AdminAddressSummary[]
  total: number
  page: number
  per_page: number
  has_next: boolean
}

export interface AdminEmailSummary {
  id: string
  subject: string | null
  from_address: string
  to_address: string
  addresses: string[]
  received_at: string
  is_read: boolean
  has_attachments: boolean
  size_bytes: number
  spf_result: string | null
  dmarc_result: string | null
}

export interface AdminEmailList {
  items: AdminEmailSummary[]
  total: number
  page: number
  per_page: number
  has_next: boolean
}

export interface AdminEmailDetail {
  id: string
  message_id: string | null
  subject: string | null
  from_address: string
  to_address: string
  addresses: string[]
  raw_headers: string
  body_plain: string | null
  body_html: string | null
  size_bytes: number
  dkim_valid: boolean | null
  spf_result: string | null
  dmarc_result: string | null
  has_attachments: boolean
  received_at: string
  is_read: boolean
  attachments: { id: string; filename: string; content_type: string; size_bytes: number }[]
}

export interface AdminAddressDetail {
  id: string
  email: string
  address_type: string
  created_at: string
  expires_at: string | null
  is_expired: boolean
  emails: AdminEmailSummary[]
}

export interface DomainStats {
  domain: string
  address_count: number
  email_count: number
}

export interface CleanupResult {
  deleted_addresses: number
  deleted_emails: number
  retention_deleted_emails: number
  storage_bytes_before: number
  storage_bytes_after: number
}

export interface TlsStatus {
  enabled: boolean
  hostname: string
  web_hostname: string
  cert_exists: boolean
  not_after: string | null
  issuer: string | null
  cert_path: string
  job_pending: boolean
  job_result: { ok?: boolean; message?: string; issuedAt?: string } | null
  last_renew: { ok?: boolean; message?: string; lastRenew?: string } | null
}

// ---------- API 方法 ----------

export const adminApi = {
  getStats(): Promise<AdminStats> {
    return request('/api/v1/admin/stats')
  },

  listAddresses(params: { page?: number; per_page?: number; search?: string } = {}): Promise<AdminAddressList> {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.per_page) q.set('per_page', String(params.per_page))
    if (params.search) q.set('search', params.search)
    return request(`/api/v1/admin/addresses?${q}`)
  },

  getAddress(id: string): Promise<AdminAddressDetail> {
    return request(`/api/v1/admin/addresses/${id}`)
  },

  deleteAddress(id: string): Promise<{ deleted: boolean; email: string }> {
    return request(`/api/v1/admin/addresses/${id}`, { method: 'DELETE' })
  },

  listEmails(params: { page?: number; per_page?: number; search?: string } = {}): Promise<AdminEmailList> {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.per_page) q.set('per_page', String(params.per_page))
    if (params.search) q.set('search', params.search)
    return request(`/api/v1/admin/emails?${q}`)
  },

  getEmail(id: string): Promise<AdminEmailDetail> {
    return request(`/api/v1/admin/emails/${id}`)
  },

  deleteEmail(id: string): Promise<{ deleted: boolean; id: string }> {
    return request(`/api/v1/admin/emails/${id}`, { method: 'DELETE' })
  },

  listDomains(): Promise<{ domains: DomainStats[] }> {
    return request('/api/v1/admin/domains')
  },

  addDomain(domain: string): Promise<{ added: string; domains: string[] }> {
    return request('/api/v1/admin/domains', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    })
  },

  removeDomain(domain: string): Promise<{ removed: string; affected_addresses: number; domains: string[] }> {
    return request(`/api/v1/admin/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' })
  },

  getConfig(): Promise<{ config: Record<string, unknown>; config_path: string }> {
    return request('/api/v1/admin/config')
  },

  updateConfig(patch: Record<string, Record<string, unknown>>): Promise<{
    config: Record<string, unknown>
    config_path: string
    restart_required?: boolean
  }> {
    return request('/api/v1/admin/config', {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },

  runCleanup(): Promise<CleanupResult> {
    return request('/api/v1/admin/cleanup/run', { method: 'POST' })
  },

  getTlsStatus(): Promise<TlsStatus> {
    return request('/api/v1/admin/tls/status')
  },

  issueCertificate(email: string): Promise<{ submitted: boolean; hostname: string }> {
    return request('/api/v1/admin/tls/issue', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  getApiKeyStatus(): Promise<{ configured: boolean; masked: string }> {
    return request('/api/v1/admin/apikey/status')
  },

  regenerateApiKey(): Promise<{ api_key: string }> {
    return request('/api/v1/admin/apikey/regenerate', { method: 'POST' })
  },
}

// ---------- 显示辅助 ----------

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  // Follow the language the panel is currently displayed in.
  return d.toLocaleString(currentLang(), { hour12: false })
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return translate('admin.uptimeDaysHours', { d, h })
  if (h > 0) return translate('admin.uptimeHoursMinutes', { h, m })
  return translate('admin.uptimeMinutes', { m })
}

// Backwards-compatible alias: the shared formatter is language-neutral.
export const formatBytesZh = formatBytes
