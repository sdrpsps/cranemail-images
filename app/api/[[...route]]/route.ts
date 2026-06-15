import { Hono, Context } from 'hono'
import { handle } from 'hono/vercel'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
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

    // Set HTTP-Only cookies
    setCookie(c, 'sm_access_token', result.accessToken, getCookieOptions(result.accessTokenExpiration))
    setCookie(c, 'sm_refresh_token', result.refreshToken, getCookieOptions(result.refreshTokenExpiration))
    // Store server url in cookie so subsequent operations know which mail server to target
    setCookie(c, 'sm_server_url', serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org', getCookieOptions(result.refreshTokenExpiration))

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
      serverUrl: serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org',
      isTelegramBound: !!(dbUser && dbUser.telegramUserId),
    }, 'Authentication successful')
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during authentication'
    return apiError(c, errorMessage, 500)
  }
})

// Helper to retrieve and automatically refresh SmarterMail access token from cookies
async function getValidAccessToken(c: Context): Promise<{ accessToken: string; serverUrl: string } | null> {
  const accessToken = getCookie(c, 'sm_access_token')
  const refreshToken = getCookie(c, 'sm_refresh_token')
  const serverUrl = getCookie(c, 'sm_server_url')

  if (!serverUrl) return null

  if (accessToken) {
    return { accessToken, serverUrl }
  }

  if (refreshToken) {
    try {
      console.log('Refreshing expired SmarterMail access token in helper...')
      const client = new SmarterMailClient(serverUrl)
      const refreshResult = await client.refreshToken(refreshToken)
      
      if (refreshResult.success && refreshResult.accessToken) {
        setCookie(c, 'sm_access_token', refreshResult.accessToken, getCookieOptions(refreshResult.accessTokenExpiration))
        setCookie(c, 'sm_refresh_token', refreshResult.refreshToken || refreshToken, getCookieOptions(refreshResult.refreshTokenExpiration))
        return { accessToken: refreshResult.accessToken, serverUrl }
      }
    } catch (err) {
      console.error('Token refresh helper failed:', err)
    }
  }

  return null
}

// GET /api/auth/me
app.get('/auth/me', async (c) => {
  const authContext = await getValidAccessToken(c)
  if (!authContext) {
    deleteCookie(c, 'sm_access_token', { path: '/' })
    deleteCookie(c, 'sm_refresh_token', { path: '/' })
    deleteCookie(c, 'sm_server_url', { path: '/' })
    return apiError(c, 'Not authenticated', 401)
  }

  const { accessToken, serverUrl } = authContext
  const client = new SmarterMailClient(serverUrl)

  try {
    const userSettings = await client.getUserSettings(accessToken)
    if (userSettings && userSettings.success !== false && userSettings.emailAddress) {
      const emailAddress = userSettings.emailAddress
      const username = userSettings.username || emailAddress.split('@')[0]

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
    }
  } catch (err) {
    console.error('getUserSettings in me failed:', err)
  }

  deleteCookie(c, 'sm_access_token', { path: '/' })
  deleteCookie(c, 'sm_refresh_token', { path: '/' })
  deleteCookie(c, 'sm_server_url', { path: '/' })
  return apiError(c, 'Not authenticated', 401)
})

// POST /api/auth/logout
app.post('/auth/logout', (c) => {
  deleteCookie(c, 'sm_access_token', { path: '/' })
  deleteCookie(c, 'sm_refresh_token', { path: '/' })
  deleteCookie(c, 'sm_server_url', { path: '/' })
  return apiSuccess(c, null, 'Successfully logged out')
})

// POST /api/auth/telegram/bind-token
app.post('/auth/telegram/bind-token', async (c) => {
  const accessToken = getCookie(c, 'sm_access_token')
  const serverUrl = getCookie(c, 'sm_server_url')

  if (!accessToken || !serverUrl) {
    return apiError(c, 'Not authenticated', 401)
  }

  try {
    const { password } = await c.req.json()
    if (!password) {
      return apiError(c, 'Password is required to confirm and link your Telegram account', 400)
    }

    const client = new SmarterMailClient(serverUrl)
    
    // 1. Fetch current email
    const userSettings = await client.getUserSettings(accessToken)
    if (!userSettings || userSettings.success === false || !userSettings.emailAddress) {
      return apiError(c, 'Failed to fetch user email context', 401)
    }
    const email = userSettings.emailAddress

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

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CranemailImagesBot'
    const bindUrl = `https://t.me/${botUsername}?start=${token}`

    return apiSuccess(c, { token, bindUrl }, 'Binding link generated successfully')
  } catch (error) {
    console.error('Bind token error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while generating bind token'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/upload
app.post('/upload', async (c) => {
  const authContext = await getValidAccessToken(c)
  if (!authContext) {
    return apiError(c, 'Not authenticated', 401)
  }

  const { accessToken, serverUrl } = authContext

  try {
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return apiError(c, 'No file uploaded or invalid file format', 400)
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name || `web_upload_${Date.now()}`

    const client = new SmarterMailClient(serverUrl)
    const folderPath = SmarterMailClient.getUtc8DatePath()

    // 1. Upload to SmarterMail storage
    const uploadResult = await client.uploadFile(accessToken, fileBuffer, fileName, folderPath)
    if (!uploadResult.success || !uploadResult.uploadData) {
      return apiError(c, uploadResult.message || 'SmarterMail upload failed', 500)
    }

    const fileMeta = uploadResult.uploadData[fileName]
    if (!fileMeta || !fileMeta.id) {
      return apiError(c, 'Uploaded file metadata missing', 500)
    }

    // 2. Generate public share link
    const linkResult = await client.generatePublicLink(accessToken, fileMeta.id)
    if (!linkResult.success || !linkResult.publicLink) {
      return apiError(c, linkResult.message || 'Failed to generate public share link', 500)
    }

    return apiSuccess(c, {
      fileName,
      publicLink: linkResult.publicLink,
      size: file.size,
    }, 'File uploaded successfully')
  } catch (error) {
    console.error('Web upload endpoint error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during file upload'
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
