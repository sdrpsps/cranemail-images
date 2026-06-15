import { Hono, Context } from 'hono'
import { handle } from 'hono/vercel'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient, SmarterMailHttpError, SmarterMailRefreshResponse } from '@/lib/smartermail'
import { encrypt } from '@/lib/crypto'
import { db, initDb } from '@/lib/db'
import { handleTelegramUpdate } from '@/lib/bot'
import nodeCrypto from 'crypto'

// Initialize Hono app. Setting the basePath allows matching subroutes correctly.
const app = new Hono().basePath('/api')

// Initialize DB tables asynchronously on module load
initDb().catch((err) => console.error('Database DDL initialization failed:', err))

// Global 404 Not Found Handler
app.notFound((c) => {
  return apiError(c, `Route not found: ${c.req.method} ${c.req.path}`, 404)
})

// Global Error Handler
app.onError((err, c) => {
  // Log the error locally for server-side monitoring
  console.error(`[API Error Log] ${c.req.method} ${c.req.path}:`, err)

  // Handle standard Hono HTTP Exceptions (e.g., manually thrown or from Hono middleware)
  if (err instanceof HTTPException) {
    return apiError(c, err.message, err.status)
  }

  // Handle general/unexpected runtime errors
  const isDev = process.env.NODE_ENV === 'development'
  const errorMessage = err.message || 'An unexpected error occurred'

  return apiError(
    c,
    isDev ? errorMessage : 'Internal Server Error',
    500,
    isDev ? { stack: err.stack } : undefined
  )
})

// Helper for secure cookie options
const isProd = process.env.NODE_ENV === 'production'
const getCookieOptions = (expiresStr?: string) => ({
  path: '/',
  httpOnly: true,
  secure: isProd,
  sameSite: 'Lax' as const,
  ...(expiresStr ? { expires: new Date(expiresStr) } : {}),
})
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000
const refreshTokenFlights = new Map<string, Promise<SmarterMailRefreshResponse>>()

function clearAuthCookies(c: Context) {
  deleteCookie(c, 'sm_access_token', { path: '/' })
  deleteCookie(c, 'sm_access_token_expires', { path: '/' })
  deleteCookie(c, 'sm_refresh_token', { path: '/' })
  deleteCookie(c, 'sm_server_url', { path: '/' })
}

function setAuthCookies(
  c: Context,
  accessToken: string,
  accessTokenExpiration: string,
  refreshToken: string,
  refreshTokenExpiration: string,
  serverUrl: string
) {
  setCookie(c, 'sm_access_token', accessToken, getCookieOptions(accessTokenExpiration))
  setCookie(c, 'sm_access_token_expires', accessTokenExpiration, getCookieOptions(accessTokenExpiration))
  setCookie(c, 'sm_refresh_token', refreshToken, getCookieOptions(refreshTokenExpiration))
  setCookie(c, 'sm_server_url', serverUrl, getCookieOptions(refreshTokenExpiration))
}

function shouldRefreshAccessToken(expiresStr?: string): boolean {
  if (!expiresStr) {
    return false
  }

  const expiresAt = Date.parse(expiresStr)
  if (!Number.isFinite(expiresAt)) {
    return false
  }

  return expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_WINDOW_MS
}

function getRefreshFlightKey(serverUrl: string, refreshToken: string): string {
  return nodeCrypto
    .createHash('sha256')
    .update(`${serverUrl}\0${refreshToken}`)
    .digest('hex')
}

async function refreshSmarterMailToken(serverUrl: string, refreshToken: string): Promise<SmarterMailRefreshResponse> {
  const key = getRefreshFlightKey(serverUrl, refreshToken)
  const existingFlight = refreshTokenFlights.get(key)
  if (existingFlight) {
    return existingFlight
  }

  const flight = new SmarterMailClient(serverUrl)
    .refreshToken(refreshToken)
    .finally(() => {
      refreshTokenFlights.delete(key)
    })

  refreshTokenFlights.set(key, flight)
  return flight
}

// --- Authentication Endpoints ---

// POST /api/auth/login
app.post('/auth/login', async (c) => {
  try {
    const { username, password, serverUrl } = await c.req.json()

    if (!username || !password) {
      return apiError(c, 'Username and password are required', 400)
    }

    const client = new SmarterMailClient(serverUrl)
    const result = await client.authenticateUser(username, password)

    if (!result.success) {
      return apiError(c, result.message || 'Authentication failed', 401)
    }

    const resolvedServerUrl = serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org'
    setAuthCookies(
      c,
      result.accessToken,
      result.accessTokenExpiration,
      result.refreshToken,
      result.refreshTokenExpiration,
      resolvedServerUrl
    )

    // Check if Telegram is bound in DB
    const userCheck = await db.execute({
      sql: 'SELECT telegramUserId FROM users WHERE email = ? LIMIT 1',
      args: [result.emailAddress]
    })
    const dbUser = userCheck.rows[0]

    // If the user already has a bound Telegram account, automatically sync 
    // the newest encrypted password and refresh token to keep the bot operational.
    if (dbUser) {
      await db.execute({
        sql: `UPDATE users 
              SET encryptedPassword = ?, refreshToken = ?, updatedAt = CURRENT_TIMESTAMP 
              WHERE email = ?`,
        args: [
          encrypt(password),
          result.refreshToken,
          result.emailAddress
        ]
      })
      console.log(`[Auth Sync] Updated credentials for bound user: ${result.emailAddress}`)
    }

    return apiSuccess(c, {
      username: result.username,
      emailAddress: result.emailAddress,
      isAdmin: result.isAdmin,
      isDomainAdmin: result.isDomainAdmin,
      serverUrl: resolvedServerUrl,
      isTelegramBound: !!(dbUser && dbUser.telegramUserId),
    }, 'Authentication successful')
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during authentication'
    return apiError(c, errorMessage, 500)
  }
})

// Helper to retrieve and automatically refresh SmarterMail access token from cookies
async function getValidAccessToken(c: Context, forceRefresh = false): Promise<{ accessToken: string; serverUrl: string } | null> {
  const accessToken = forceRefresh ? null : getCookie(c, 'sm_access_token')
  const accessTokenExpires = getCookie(c, 'sm_access_token_expires')
  const refreshToken = getCookie(c, 'sm_refresh_token')
  const serverUrl = getCookie(c, 'sm_server_url')

  if (!serverUrl) return null

  if (accessToken && !forceRefresh && !shouldRefreshAccessToken(accessTokenExpires)) {
    return { accessToken, serverUrl }
  }

  if (refreshToken) {
    try {
      console.log('Refreshing expired SmarterMail access token in helper...')
      const refreshResult = await refreshSmarterMailToken(serverUrl, refreshToken)

      if (refreshResult.success && refreshResult.accessToken) {
        setAuthCookies(
          c,
          refreshResult.accessToken,
          refreshResult.accessTokenExpiration,
          refreshResult.refreshToken || refreshToken,
          refreshResult.refreshTokenExpiration,
          serverUrl
        )
        return { accessToken: refreshResult.accessToken, serverUrl }
      }
    } catch (err) {
      console.error('Token refresh helper failed:', err)
      if (!(err instanceof SmarterMailHttpError) || err.status !== 401) {
        throw err
      }
    }
  }

  if (accessToken && !forceRefresh) {
    return { accessToken, serverUrl }
  }

  return null
}

// Wrapper helper to execute SmarterMail requests and automatically retry on 401
async function callSmarterMail<T>(
  c: Context,
  operation: (client: SmarterMailClient, accessToken: string) => Promise<T>
): Promise<T> {
  let authContext = await getValidAccessToken(c)
  if (!authContext) {
    clearAuthCookies(c)
    throw new HTTPException(401, { message: 'Not authenticated' })
  }

  let client = new SmarterMailClient(authContext.serverUrl)
  try {
    return await operation(client, authContext.accessToken)
  } catch (err) {
    if (err instanceof SmarterMailHttpError && err.status === 401) {
      console.log('[SmarterMail Client] Detected 401 error. Attempting token refresh and retry...')
      authContext = await getValidAccessToken(c, true)
      if (authContext) {
        client = new SmarterMailClient(authContext.serverUrl)
        return await operation(client, authContext.accessToken)
      }
      clearAuthCookies(c)
      throw new HTTPException(401, { message: 'Not authenticated' })
    }
    throw err
  }
}

// GET /api/auth/me
app.get('/auth/me', async (c) => {
  try {
    const result = await callSmarterMail(c, async (client, accessToken) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Not authenticated' })
      }
      return { userData, serverUrl: getCookie(c, 'sm_server_url')! }
    })

    const { userData, serverUrl } = result
    const emailAddress = userData.emailAddress!
    const username = userData.userName || emailAddress.split('@')[0]

    // Check if Telegram is bound in DB
    const userCheck = await db.execute({
      sql: 'SELECT telegramUserId FROM users WHERE email = ? LIMIT 1',
      args: [emailAddress]
    })
    const dbUser = userCheck.rows[0]

    return apiSuccess(c, {
      username,
      emailAddress,
      serverUrl,
      isTelegramBound: !!(dbUser && dbUser.telegramUserId),
    }, 'Current user retrieved successfully')
  } catch (err) {
    console.error('getUserSettings in me failed:', err)
    if (err instanceof HTTPException && err.status === 401) {
      clearAuthCookies(c)
      return apiError(c, 'Not authenticated', 401)
    }
    const errorMessage = err instanceof Error ? err.message : 'An error occurred while retrieving current user'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/auth/logout
app.post('/auth/logout', (c) => {
  clearAuthCookies(c)
  return apiSuccess(c, null, 'Successfully logged out')
})

// POST /api/auth/telegram/bind-token
app.post('/auth/telegram/bind-token', async (c) => {
  try {
    const { password } = await c.req.json()
    if (!password) {
      return apiError(c, 'Password is required to confirm and link your Telegram account', 400)
    }

    const { email, serverUrl } = await callSmarterMail(c, async (client, accessToken) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      return { email: userData.emailAddress, serverUrl: getCookie(c, 'sm_server_url')! }
    })

    const client = new SmarterMailClient(serverUrl)

    // 2. Validate password against SmarterMail
    const verifyAuth = await client.authenticateUser(email, password)
    if (!verifyAuth.success) {
      return apiError(c, 'Verification failed. Password is incorrect.', 401)
    }

    // 3. Encrypt credentials and store bind token (expires in 10 minutes)
    const encryptedPassword = encrypt(password)
    const token = nodeCrypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await db.execute({
      sql: `INSERT INTO bind_tokens (token, email, serverUrl, encryptedPassword, refreshToken, expiresAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        token,
        email,
        serverUrl,
        encryptedPassword,
        verifyAuth.refreshToken,
        expiresAt
      ]
    })

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CraneMailImagesBot'
    const bindUrl = `https://t.me/${botUsername}?start=${token}`

    return apiSuccess(c, { token, bindUrl }, 'Binding link generated successfully')
  } catch (error) {
    console.error('Bind token error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while generating bind token'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/upload
app.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return apiError(c, 'No file uploaded or invalid file format', 400)
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name || `web_upload_${Date.now()}`

    const uploadResult = await callSmarterMail(c, async (client, accessToken) => {
      const folderPath = SmarterMailClient.getPublicFolder() + SmarterMailClient.getDatePath()

      // Fetch email address of the current user to tag database records
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress

      // 1. Upload to SmarterMail storage
      const uploadRes = await client.uploadFile(accessToken, fileBuffer, fileName, folderPath)
      if (!uploadRes.success || !uploadRes.uploadData) {
        throw new Error(uploadRes.message || 'SmarterMail upload failed')
      }

      const fileMeta = uploadRes.uploadData[fileName]
      if (!fileMeta || !fileMeta.id) {
        throw new Error('Uploaded file metadata missing')
      }

      // 2. Generate public share link
      const linkResult = await client.generatePublicLink(accessToken, fileMeta.id)
      if (!linkResult.success || !linkResult.publicLink) {
        throw new Error(linkResult.message || 'Failed to generate public share link')
      }

      return {
        email,
        fileId: fileMeta.id,
        publicLink: linkResult.publicLink
      }
    })

    // 3. Save uploaded image metadata to database
    const imageId = nodeCrypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO uploaded_images (id, email, fileId, fileName, publicLink, size, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        imageId,
        uploadResult.email,
        uploadResult.fileId,
        fileName,
        uploadResult.publicLink,
        file.size,
        'web'
      ]
    })

    return apiSuccess(c, {
      id: imageId,
      fileName,
      publicLink: uploadResult.publicLink,
      size: file.size,
    }, 'File uploaded successfully')
  } catch (error) {
    console.error('Web upload endpoint error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during file upload'
    return apiError(c, errorMessage, 500)
  }
})

// GET /api/images
app.get('/images', async (c) => {
  try {
    const email = await callSmarterMail(c, async (client, accessToken) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      return userData.emailAddress
    })

    const result = await db.execute({
      sql: 'SELECT * FROM uploaded_images WHERE email = ? ORDER BY createdAt DESC',
      args: [email]
    })

    return apiSuccess(c, result.rows, 'Uploaded images retrieved successfully')
  } catch (error) {
    console.error('Fetch images error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching images'
    return apiError(c, errorMessage, 500)
  }
})

// DELETE /api/images/:id
app.delete('/images/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) {
      return apiError(c, 'Image ID is required', 400)
    }

    const deleteResult = await callSmarterMail(c, async (client, accessToken) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress

      // Check if the image belongs to this user
      const checkRes = await db.execute({
        sql: 'SELECT id, fileId, fileName FROM uploaded_images WHERE id = ? AND email = ? LIMIT 1',
        args: [id, email]
      })

      if (checkRes.rows.length === 0) {
        throw new HTTPException(404, { message: 'Image not found or access denied' })
      }

      const image = checkRes.rows[0]
      const fileId = typeof image.fileId === 'string' ? image.fileId : ''
      if (!fileId) {
        throw new HTTPException(409, { message: 'Cannot delete workspace file because this image record is missing a file ID' })
      }

      const deleteRes = await client.deleteFiles(accessToken, [fileId])
      if (!deleteRes.success) {
        throw new Error(deleteRes.message || 'Failed to delete workspace file')
      }

      return {
        id,
        fileId,
        fileName: typeof image.fileName === 'string' ? image.fileName : undefined,
      }
    })

    // Delete from local DB only after the workspace file has been deleted.
    await db.execute({
      sql: 'DELETE FROM uploaded_images WHERE id = ?',
      args: [id]
    })

    return apiSuccess(c, deleteResult, 'Workspace file deleted successfully')
  } catch (error) {
    console.error('Delete image error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while deleting image'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/images/sync
app.post('/images/sync', async (c) => {
  try {
    const syncResult = await callSmarterMail(c, async (client, accessToken) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress

      let syncedCount = 0

      // Recursive folder scanning function
      const walkFolder = async (folderPath: string) => {
        const res = await client.getFolder(accessToken, folderPath)
        if (!res.success || !res.folder) {
          console.warn(`[Sync] Failed to list folder "${folderPath}":`, res.message)
          return
        }

        // 1. Process files in current folder
        const files = res.folder.files || []
        for (const file of files) {
          // Only sync images
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName)) {
            let publicLink = file.publicDownloadLink

            // Generate public link if not already generated/published
            if (!publicLink) {
              try {
                const linkRes = await client.generatePublicLink(accessToken, file.id)
                if (linkRes.success && linkRes.publicLink) {
                  publicLink = linkRes.publicLink
                }
              } catch (linkErr) {
                console.warn(`[Sync] Failed to generate public link for file "${file.fileName}" (${file.id}):`, linkErr)
              }
            }

            if (publicLink) {
              // Check if the image record is already in our DB (either by fileId or publicLink)
              const checkExist = await db.execute({
                sql: 'SELECT id FROM uploaded_images WHERE fileId = ? OR publicLink = ? LIMIT 1',
                args: [file.id, publicLink]
              })

              if (checkExist.rows.length === 0) {
                const imageId = nodeCrypto.randomUUID()
                let createdAt = new Date().toISOString()
                if (file.dateAdded) {
                  try {
                    createdAt = new Date(file.dateAdded).toISOString()
                  } catch {
                    // Fallback
                  }
                }

                await db.execute({
                  sql: `INSERT INTO uploaded_images (id, email, fileId, fileName, publicLink, size, source, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  args: [
                    imageId,
                    email,
                    file.id,
                    file.fileName,
                    publicLink,
                    file.size,
                    'workspace',
                    createdAt
                  ]
                })
                syncedCount++
              }
            }
          }
        }

        // 2. Recurse into subdirectories
        const subFolders = res.folder.subFolders || []
        for (const sub of subFolders) {
          if (sub.path) {
            await walkFolder(sub.path)
          }
        }
      }

      // Start scanning from public folder path
      await walkFolder(SmarterMailClient.getPublicFolder())
      return { syncedCount }
    })

    return apiSuccess(c, { syncedCount: syncResult.syncedCount }, `Successfully synced ${syncResult.syncedCount} new workspace images`)
  } catch (error) {
    console.error('Workspace sync error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during synchronization'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/telegram/webhook
app.post('/telegram/webhook', async (c) => {
  try {
    const update = await c.req.json()
    // Process update asynchronously or wait
    await handleTelegramUpdate(update)
    return c.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    // Always return OK 200 to Telegram to prevent retry loop
    return c.json({ ok: true })
  }
})

// Export HTTP method handlers to be consumed by Next.js App Router
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)
export const OPTIONS = handle(app)
