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
  userData?: {
    emailAddress?: string
    userName?: string
    fullName?: string
    [key: string]: any
  }
}

export interface SmarterMailUploadFileMeta {
  id: string
  [key: string]: unknown
}

export interface SmarterMailUploadResponse {
  success: boolean
  message?: string
  uploadResults?: Record<string, string>
  uploadData?: Record<string, SmarterMailUploadFileMeta>
}

export interface SmarterMailLinkResponse {
  success: boolean
  message?: string
  publicLink?: string
}

export class SmarterMailHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string
  ) {
    super(message)
    this.name = 'SmarterMailHttpError'
  }
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

function normalizeFolderPath(folderPath?: string): string {
  if (!folderPath || folderPath === '/') {
    return '/'
  }

  const trimmed = folderPath.trim().replace(/\/+/g, '/').replace(/\/+$/, '')
  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function isFolderAlreadyExistsError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('already exists') || normalized.includes('exist')
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
      throw new SmarterMailHttpError(
        response.status,
        `SmarterMail HTTP Error: ${response.status} - ${errorText || response.statusText}`,
        errorText
      )
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
      throw new SmarterMailHttpError(
        response.status,
        `SmarterMail HTTP Error: ${response.status} - ${errorText || response.statusText}`,
        errorText
      )
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
   * Helper to get current date folder path using the configured upload timezone.
   * Returns path in format: /YYYY/MM/DD
   */
  static getDatePath(): string {
    const d = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: process.env.TIMEZONE || 'Asia/Shanghai',
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
   * Helper to get public folder path from environment variables.
   * Defaults to '/public'. Sanitizes leading/trailing slashes.
   */
  static getPublicFolder(): string {
    const folder = process.env.PUBLIC_FOLDER || '/public'
    let sanitized = folder.startsWith('/') ? folder : '/' + folder
    sanitized = sanitized.replace(/\/+$/, '')
    return sanitized || '/'
  }

  /**
   * Create a folder in file storage.
   * Uses the SmarterMail folder-put endpoint.
   */
  async createFolder(accessToken: string, folderPath: string): Promise<{ success: boolean; message?: string }> {
    const normalizedPath = normalizeFolderPath(folderPath)
    const segments = normalizedPath.split('/').filter(Boolean)
    const folder = segments.at(-1)

    if (!folder) {
      return { success: true }
    }

    const parentFolder = segments.length > 1
      ? `/${segments.slice(0, -1).join('/')}`
      : '/'

    return this.post<{ success: boolean; message?: string }>('api/v1/filestorage/folder-put', {
      folder,
      parentFolder,
    }, {
      'Authorization': `Bearer ${accessToken}`,
    })
  }

  /**
   * Ensure a full folder path exists by creating each segment incrementally.
   * For example, given '/public/2026/06/15', it will ensure:
   *   /public  →  /public/2026  →  /public/2026/06  →  /public/2026/06/15
   */
  async ensureFolderExists(accessToken: string, folderPath: string): Promise<void> {
    const normalizedPath = normalizeFolderPath(folderPath)
    const segments = normalizedPath.split('/').filter(Boolean)
    let currentPath = ''

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`
      try {
        const response = await this.createFolder(accessToken, currentPath)
        if (!response.success) {
          throw new Error(response.message || 'Folder creation failed')
        }
        console.log(`[SmarterMail Client] Folder ensured: ${currentPath}`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (!isFolderAlreadyExistsError(errorMessage)) {
          throw err
        }
        console.log(`[SmarterMail Client] Folder create note for "${currentPath}": ${errorMessage}`)
      }
    }
  }

  async moveFiles(accessToken: string, fileIds: string[], newFolder: string): Promise<{ success: boolean; message?: string }> {
    return this.post<{ success: boolean; message?: string }>('api/v1/filestorage/move-files', {
      newFolder: normalizeFolderPath(newFolder),
      fileIDs: fileIds,
    }, {
      'Authorization': `Bearer ${accessToken}`,
    })
  }

  async deleteFiles(accessToken: string, fileIds: string[]): Promise<{ success: boolean; message?: string }> {
    return this.post<{ success: boolean; message?: string }>('api/v1/filestorage/delete-files', {
      fileIDs: fileIds,
    }, {
      'Authorization': `Bearer ${accessToken}`,
    })
  }

  /**
   * SmarterMail's public upload endpoint expects a multipart "folder" field in addition to the
   * file payload. Some servers return an empty uploadData object even when the upload succeeds,
   * so we fall back to listing the target folder to recover the uploaded file metadata.
   */
  async uploadFile(accessToken: string, fileBuffer: Buffer, fileName: string, folderPath?: string): Promise<SmarterMailUploadResponse> {
    const targetFolder = normalizeFolderPath(folderPath)
    const fileType = getMimeType(fileName)
    const formData = new FormData()
    const fileObj = new File([new Uint8Array(fileBuffer)], fileName, { type: fileType })

    formData.append('file', fileObj)
    formData.append('folder', targetFolder === '/' ? '' : targetFolder)

    console.log(`[SmarterMail Client] Upload file: "${fileName}", size: ${fileBuffer.length} bytes, type: ${fileType}, target folder: ${targetFolder}`)

    if (targetFolder !== '/') {
      await this.ensureFolderExists(accessToken, targetFolder)
    }

    const response = await fetch(`${this.serverUrl}/api/v1/filestorage/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new SmarterMailHttpError(
        response.status,
        `SmarterMail Upload HTTP Error: ${response.status} - ${errorText || response.statusText}`,
        errorText
      )
    }

    const uploadResponse = await response.json() as SmarterMailUploadResponse
    if (!uploadResponse.success) {
      return uploadResponse
    }

    const fileMeta = uploadResponse.uploadData?.[fileName]
    if (fileMeta?.id) {
      return uploadResponse
    }

    const recoveredFile = await this.findUploadedFile(accessToken, targetFolder, fileName, fileBuffer.length)
    if (!recoveredFile) {
      throw new Error(`SmarterMail upload succeeded but file metadata for "${fileName}" could not be recovered from ${targetFolder}`)
    }

    uploadResponse.uploadData = {
      ...(uploadResponse.uploadData || {}),
      [fileName]: recoveredFile,
    }

    return uploadResponse
  }

  private async findUploadedFile(
    accessToken: string,
    folderPath: string,
    fileName: string,
    size: number
  ): Promise<SmarterMailUploadFileMeta | undefined> {
    const folderResponse = await this.getFolder(accessToken, folderPath)
    if (!folderResponse.success || !folderResponse.folder) {
      return undefined
    }

    const matchingFiles = (folderResponse.folder.files || [])
      .filter(file => file.fileName === fileName && file.size === size)
      .sort((a, b) => {
        const dateA = Date.parse(a.dateAdded || '') || 0
        const dateB = Date.parse(b.dateAdded || '') || 0
        return dateB - dateA
      })

    return matchingFiles[0] as unknown as SmarterMailUploadFileMeta | undefined
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

  /**
   * Retrieves a folder's files and subfolders from file storage.
   */
  async getFolder(accessToken: string, folderPath: string): Promise<SmarterMailFolderResponse> {
    const payload = {
      folder: folderPath,
      startIndex: 0,
      count: 1000 // retrieve up to 1000 items
    }
    return this.post<SmarterMailFolderResponse>('api/v1/filestorage/folder', payload, {
      'Authorization': `Bearer ${accessToken}`
    })
  }
}

export interface SmarterMailFileItem {
  id: string
  fileName: string
  type: string
  size: number
  dateAdded: string
  published: boolean
  publicDownloadLink?: string
  folderPath: string
}

export interface SmarterMailFolderItem {
  name: string
  path: string
  size: number
  subFolders: SmarterMailFolderItem[]
  files: SmarterMailFileItem[]
}

export interface SmarterMailFolderResponse {
  success: boolean
  message?: string
  folder?: SmarterMailFolderItem
}
