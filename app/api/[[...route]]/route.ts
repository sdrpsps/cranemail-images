import { Hono } from 'hono'
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

    return apiSuccess(c, {
      username: result.username,
      emailAddress: result.emailAddress,
      isAdmin: result.isAdmin,
      isDomainAdmin: result.isDomainAdmin,
      serverUrl: serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org',
      isTelegramBound: !!(dbUser && dbUser.telegramUserId),
    }, 'Authentication successful')
  } catch (error: any) {
    console.error('Login error:', error)
    return apiError(c, error.message || 'An error occurred during authentication', 500)
  }
})

// GET /api/auth/me
app.get('/auth/me', async (c) => {
  let accessToken = getCookie(c, 'sm_access_token')
  const refreshToken = getCookie(c, 'sm_refresh_token')
  const serverUrl = getCookie(c, 'sm_server_url')

  if (!serverUrl) {
    return apiError(c, 'Not authenticated (missing server context)', 401)
  }

  const client = new SmarterMailClient(serverUrl)
  let emailAddress = ''
  let username = ''

  // Try to use access token
  if (accessToken) {
    try {
      const userSettings = await client.getUserSettings(accessToken)
      if (userSettings && userSettings.success !== false) {
        emailAddress = userSettings.emailAddress
        username = userSettings.username || userSettings.emailAddress?.split('@')[0]
      }
    } catch (err) {
      console.warn('Access token verification failed, trying refresh token...', err)
    }
  }

  // Try to refresh token if access token was missing or expired
  if (!emailAddress && refreshToken) {
    try {
      console.log('Refreshing SmarterMail access token...')
      const refreshResult = await client.refreshToken(refreshToken)
      
      if (refreshResult.success && refreshResult.accessToken) {
        // Set new cookies
        setCookie(c, 'sm_access_token', refreshResult.accessToken, getCookieOptions(refreshResult.accessTokenExpiration))
        setCookie(c, 'sm_refresh_token', refreshResult.refreshToken || refreshToken, getCookieOptions(refreshResult.refreshTokenExpiration))

        // Get user settings using new access token
        const userSettings = await client.getUserSettings(refreshResult.accessToken)
        emailAddress = userSettings.emailAddress
        username = userSettings.username || userSettings.emailAddress?.split('@')[0]
      }
    } catch (err: any) {
      console.error('Token refresh failed:', err)
    }
  }

  if (emailAddress) {
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

  // If both failed or are missing, clear cookies and unauthorized
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
  } catch (error: any) {
    console.error('Bind token error:', error)
    return apiError(c, error.message || 'An error occurred while generating bind token', 500)
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
