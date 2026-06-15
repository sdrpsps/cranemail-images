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
  private async post<T>(path: string, body: any, headers: Record<string, string> = {}): Promise<T> {
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
  async getUserSettings(accessToken: string): Promise<any> {
    return this.get<any>('api/v1/settings/user', {
      'Authorization': `Bearer ${accessToken}`,
    })
  }

  /**
   * Upload a file to file storage.
   */
  async uploadFile(accessToken: string, fileBuffer: Buffer, fileName: string): Promise<any> {
    const formData = new FormData()
    // Convert Buffer to Blob for standard fetch multipart upload
    const blob = new Blob([fileBuffer])
    formData.append('file', blob, fileName)

    const url = `${this.serverUrl}/api/v1/filestorage/upload`
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

    return response.json()
  }

  /**
   * Generates a public sharing link for a file in file storage.
   * We pass 'public' to ensure it gets published.
   */
  async generatePublicLink(accessToken: string, fileId: string): Promise<any> {
    return this.get<any>(`api/v1/filestorage/${fileId}/getlink/public`, {
      'Authorization': `Bearer ${accessToken}`,
    })
  }
}
