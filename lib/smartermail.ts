export interface SmarterMailLoginResponse {
  emailAddress: string
  accessToken: string
  refreshToken: string
  accessTokenExpiration: string
  refreshTokenExpiration: string
  username: string
  isAdmin: boolean
  isDomainAdmin: boolean
  success: boolean
  message?: string
}

export interface SmarterMailRefreshResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiration: string
  refreshTokenExpiration: string
  username: string
  success: boolean
  message?: string
}

export interface SmarterMailUserResponse {
  success: boolean
  message?: string
  // Settings/User returns full profile, let's capture the core fields
  emailAddress?: string
  username?: string
  displayName?: string
}

export interface SmarterMailUploadFileMeta {
  id: string
  [key: string]: unknown
}

export interface SmarterMailUploadResponse {
  success: boolean
  message?: string
  uploadData?: Record<string, SmarterMailUploadFileMeta>
}

export interface SmarterMailLinkResponse {
  success: boolean
  message?: string
  publicLink?: string
}

export class SmarterMailClient {
  private serverUrl: string
  private clientId: string

  constructor(serverUrl?: string) {
    // Determine target server URL: custom param -> environment variable -> default fallback
    const rawUrl = serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org'
    // Normalize URL: remove trailing slashes
    this.serverUrl = rawUrl.replace(/\/+$/, '')
    this.clientId = process.env.SMARTERMAIL_CLIENT_ID || 'cranemail-images-app'
  }

  /**
   * Helper to make HTTP POST requests to SmarterMail REST API.
   */
  private async post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    const url = `${this.serverUrl}/${path.replace(/^\/+/, '')}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`SmarterMail HTTP Error: ${response.status} - ${errorText || response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Helper to make HTTP GET requests to SmarterMail REST API.
   */
  private async get<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
    const url = `${this.serverUrl}/${path.replace(/^\/+/, '')}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`SmarterMail HTTP Error: ${response.status} - ${errorText || response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Authenticate a user and return access and refresh tokens.
   */
  async authenticateUser(username: string, password: string): Promise<SmarterMailLoginResponse> {
    const payload = {
      username,
      password,
      clientId: this.clientId,
      teamWorkspace: false,
      retrieveAutoLoginToken: false,
    }

    return this.post<SmarterMailLoginResponse>('api/v1/auth/authenticate-user', payload)
  }

  /**
   * Refresh the access and refresh tokens using a valid refresh token.
   */
  async refreshToken(token: string): Promise<SmarterMailRefreshResponse> {
    const payload = {
      token,
      isWebmailRefresh: false,
    }

    return this.post<SmarterMailRefreshResponse>('api/v1/auth/refresh-token', payload)
  }

  /**
   * Retrieve currently authenticated user's settings profile.
   * Can be used to verify if the token is valid.
   */
  async getUserSettings(accessToken: string): Promise<SmarterMailUserResponse> {
    return this.get<SmarterMailUserResponse>('api/v1/settings/user', {
      'Authorization': `Bearer ${accessToken}`,
    })
  }

  /**
   * Helper to get current date folder path in UTC+8 (Asia/Shanghai) timezone.
   * Returns path in format: /YYYY/MM/DD
   */
  static getUtc8DatePath(): string {
    const d = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(d)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    return `/${year}/${month}/${day}`
  }

  /**
   * Upload a file to file storage.
   * Supports an optional folderPath. Falls back to root if the folder-based upload fails.
   */
  async uploadFile(accessToken: string, fileBuffer: Buffer, fileName: string, folderPath?: string): Promise<SmarterMailUploadResponse> {
    const makeUploadRequest = async (path?: string): Promise<SmarterMailUploadResponse> => {
      const formData = new FormData()
      const blob = new Blob([fileBuffer])
      formData.append('file', blob, fileName)

      let url = `${this.serverUrl}/api/v1/filestorage/upload`
      if (path) {
        url += `?folderPath=${encodeURIComponent(path)}`
        formData.append('folderPath', path)
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`SmarterMail Upload HTTP Error: ${response.status} - ${errorText || response.statusText}`)
      }

      return response.json() as Promise<SmarterMailUploadResponse>
    }

    if (folderPath) {
      try {
        console.log(`[SmarterMail Client] Attempting upload with folderPath: ${folderPath}`)
        return await makeUploadRequest(folderPath)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.warn(`[SmarterMail Client] Folder upload failed (${errorMessage}). Falling back to root directory.`)
        return await makeUploadRequest()
      }
    }

    return makeUploadRequest()
  }

  /**
   * Generates a public sharing link for a file in file storage.
   * We pass 'public' to ensure it gets published.
   */
  async generatePublicLink(accessToken: string, fileId: string): Promise<SmarterMailLinkResponse> {
    return this.get<SmarterMailLinkResponse>(`api/v1/filestorage/${fileId}/getlink/public`, {
      'Authorization': `Bearer ${accessToken}`,
    })
  }
}
