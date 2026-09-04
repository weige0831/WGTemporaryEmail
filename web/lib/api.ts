// Same-origin by default: in the integrated deployment nginx proxies
// /api/* to the backend. For local development set
// NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 in .env.local
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export interface Domain {
  domains: string[]
}

export interface AddressCreate {
  username?: string
  domain?: string
}

export interface AddressResponse {
  id: string
  email: string
  token: string
  created_at: string
  expires_at: string
}

export interface EmailSummary {
  id: string
  subject: string | null
  from_address: string
  to_address: string
  received_at: string
  is_read: boolean
  has_attachments: boolean
  size_bytes: number
}

export interface EmailListResponse {
  emails: EmailSummary[]
  total: number
  page: number
  per_page: number
  has_next: boolean
  has_prev: boolean
}

export interface AttachmentInfo {
  id: string
  filename: string
  content_type: string
  size_bytes: number
}

export interface EmailDetail {
  id: string
  message_id: string | null
  subject: string | null
  from_address: string
  to_address: string
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
  attachments: AttachmentInfo[]
}

export const api = {
  async getSetupStatus(): Promise<{ initialized: boolean; web_hostname?: string }> {
    const res = await fetch(`${API_URL}/api/v1/setup/status`)
    if (!res.ok) throw new Error('Failed to fetch setup status')
    return res.json()
  },

  async getDomains(): Promise<Domain> {
    const res = await fetch(`${API_URL}/api/v1/domains`)
    if (!res.ok) throw new Error('Failed to fetch domains')
    return res.json()
  },

  async createAddress(data: AddressCreate = {}): Promise<AddressResponse> {
    const res = await fetch(`${API_URL}/api/v1/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const error: any = new Error('Failed to create address')
      error.status = res.status
      try {
        const errorData = await res.json()
        error.message = errorData.detail || error.message
      } catch (e) {
        // If we can't parse the error response, use the default message
      }
      throw error
    }
    return res.json()
  },

  async listEmails(
    token: string,
    params: {
      page?: number
      per_page?: number
      unread_only?: boolean
      search?: string
    } = {}
  ): Promise<EmailListResponse> {
    const query = new URLSearchParams()
    if (params.page) query.set('page', params.page.toString())
    if (params.per_page) query.set('per_page', params.per_page.toString())
    if (params.unread_only) query.set('unread_only', 'true')
    if (params.search) query.set('search', params.search)

    const res = await fetch(`${API_URL}/api/v1/${token}/emails?${query}`)
    if (!res.ok) {
      const error: any = new Error('Failed to fetch emails')
      error.status = res.status
      try {
        const errorData = await res.json()
        error.detail = errorData.detail
        error.message = errorData.detail || error.message
      } catch (e) {
        // If we can't parse the error response, use the default message
      }
      throw error
    }
    return res.json()
  },

  async getEmail(token: string, emailId: string, markRead = true): Promise<EmailDetail> {
    const query = markRead ? '' : '?mark_read=false'
    const res = await fetch(`${API_URL}/api/v1/${token}/emails/${emailId}${query}`)
    if (!res.ok) {
      const error: any = new Error('Failed to fetch email')
      error.status = res.status
      try {
        const errorData = await res.json()
        error.detail = errorData.detail
        error.message = errorData.detail || error.message
      } catch (e) {
        // If we can't parse the error response, use the default message
      }
      throw error
    }
    return res.json()
  },

  async deleteEmail(token: string, emailId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/v1/${token}/emails/${emailId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const error: any = new Error('Failed to delete email')
      error.status = res.status
      try {
        const errorData = await res.json()
        error.detail = errorData.detail
        error.message = errorData.detail || error.message
      } catch (e) {
        // If we can't parse the error response, use the default message
      }
      throw error
    }
  },

  getAttachmentUrl(token: string, emailId: string, attachmentId: string): string {
    return `${API_URL}/api/v1/${token}/emails/${emailId}/attachments/${attachmentId}`
  },

  getRawEmailUrl(token: string, emailId: string): string {
    return `${API_URL}/api/v1/${token}/emails/${emailId}/raw`
  },
}
