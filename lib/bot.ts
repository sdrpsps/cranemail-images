import { db } from './db'
import { SmarterMailClient } from './smartermail'
import { decrypt } from './crypto'
import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

export interface TelegramUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramChat {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface BindTokenRow {
  token: string
  email: string
  serverUrl: string
  encryptedPassword: string | null
  refreshToken: string | null
  expiresAt: string
  createdAt?: string
}

interface UserRow {
  id: string
  email: string
  serverUrl: string
  telegramUserId: string | null
  encryptedPassword: string | null
  refreshToken: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Sends a text message to a specific Telegram chat.
 */
export async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    })
    if (!res.ok) {
      console.error('Telegram sendMessage error:', await res.text())
    }
  } catch (err) {
    console.error('Failed to send Telegram message:', err)
  }
}

/**
 * Core entrypoint to handle incoming Telegram updates (via webhook or polling).
 */
export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }

  // We only handle standard messages
  const message = update.message
  if (!message) return

  const chatId = message.chat.id
  const fromId = message.from?.id
  const fromUsername = message.from?.username
  const text = message.text

  if (!fromId) return

  // Check whitelist if configured
  const allowedUsersStr = process.env.ALLOWED_TELEGRAM_USERS || ''
  const allowedUsers = allowedUsersStr ? allowedUsersStr.split(',').map(u => u.trim().toLowerCase()) : []
  if (allowedUsers.length > 0) {
    const isAllowed =
      allowedUsers.includes(String(fromId)) ||
      (fromUsername && allowedUsers.includes(fromUsername.toLowerCase()))
    
    if (!isAllowed) {
      await sendTelegramMessage(
        chatId,
        `❌ <b>Access Denied:</b>\nYou are not authorized to use this bot.`
      )
      return
    }
  }

  // 1. Handle command /start <token>
  if (text && text.startsWith('/start')) {
    const args = text.split(' ')
    if (args.length < 2) {
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to Cranemail Image Host!</b>\n\nTo upload photos to your SmarterMail cloud storage using this bot, please link your account:\n\n1. Open our website in your browser.\n2. Sign in to your mail account.\n3. Click <b>"Link Telegram Bot"</b> to generate a binding link.\n\nOnce linked, any photo or document you send here will be uploaded and a public sharing link will be generated.`
      )
      return
    }

    const token = args[1].trim()
    try {
      const bindResult = await db.execute({
        sql: 'SELECT * FROM bind_tokens WHERE token = ? LIMIT 1',
        args: [token],
      })
      const bindToken = bindResult.rows[0] as unknown as BindTokenRow | undefined

      if (!bindToken || new Date(bindToken.expiresAt) < new Date()) {
        await sendTelegramMessage(
          chatId,
          '❌ <b>Binding Failed:</b>\nInvalid or expired binding token. Please go back to the web dashboard and generate a new link.'
        )
        return
      }

      // Check if user already exists in DB
      const userCheck = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ? LIMIT 1',
        args: [bindToken.email],
      })
      const existingUser = userCheck.rows[0]
      const userId = existingUser ? (existingUser.id as string) : crypto.randomUUID()

      // Create or update user association
      await db.execute({
        sql: `INSERT OR REPLACE INTO users (id, email, serverUrl, telegramUserId, encryptedPassword, refreshToken, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          userId,
          bindToken.email,
          bindToken.serverUrl,
          String(fromId),
          bindToken.encryptedPassword,
          bindToken.refreshToken,
        ],
      })

      // Clean up the temporary token
      await db.execute({
        sql: 'DELETE FROM bind_tokens WHERE token = ?',
        args: [token],
      })

      await sendTelegramMessage(
        chatId,
        `🎉 <b>Binding Successful!</b>\n\nYour Telegram account has been linked to Cranemail account: <code>${bindToken.email}</code>.\n\nYou can now send photos or files to this bot, and they will be uploaded directly to your cloud drive!`
      )
    } catch (err) {
      console.error('Error binding account:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      await sendTelegramMessage(chatId, `❌ <b>Binding Error:</b>\nAn error occurred while linking your account: ${errorMessage}`)
    }
    return
  }

  // 2. Handle incoming media uploads (photo or document)
  let fileId = ''
  let fileName = ''

  if (message.photo && message.photo.length > 0) {
    // Get the highest resolution photo
    const photo = message.photo[message.photo.length - 1]
    fileId = photo.file_id
    fileName = `photo_${Date.now()}.jpg`
  } else if (message.document) {
    fileId = message.document.file_id
    fileName = message.document.file_name || `file_${Date.now()}`
  }

  if (fileId) {
    try {
      // Check if the user is bound
      const userRes = await db.execute({
        sql: 'SELECT * FROM users WHERE telegramUserId = ? LIMIT 1',
        args: [String(fromId)],
      })
      const user = userRes.rows[0] as unknown as UserRow | undefined

      if (!user) {
        await sendTelegramMessage(
          chatId,
          '❌ <b>Upload Blocked:</b>\nYour Telegram account is not bound to a Cranemail account. Please sign in to the website and click <b>"Link Telegram Bot"</b> first.'
        )
        return
      }

      await sendTelegramMessage(chatId, '⚡ <i>Uploading to Cranemail Cloud Storage...</i>')

      if (!user.encryptedPassword) {
        throw new Error('No password stored. Please log out and re-bind your account on the web page.')
      }

      // Decrypt password to authenticate session
      const password = decrypt(user.encryptedPassword)
      const client = new SmarterMailClient(user.serverUrl)
      
      const authResult = await client.authenticateUser(user.email, password)
      if (!authResult.success || !authResult.accessToken) {
        throw new Error(authResult.message || 'SmarterMail authentication failed.')
      }

      // Fetch file path info from Telegram
      const tgFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
      const tgFileInfo = await tgFileRes.json()

      if (!tgFileInfo.ok || !tgFileInfo.result?.file_path) {
        throw new Error('Failed to retrieve file location from Telegram.')
      }

      const filePath = tgFileInfo.result.file_path
      
      // Download file bytes from Telegram
      const tgDownRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
      if (!tgDownRes.ok) {
        throw new Error('Failed to download file from Telegram servers.')
      }

      const fileBuffer = Buffer.from(await tgDownRes.arrayBuffer())

      const folderPath = SmarterMailClient.getUtc8DatePath()

      // Upload file to SmarterMail
      const uploadResult = await client.uploadFile(authResult.accessToken, fileBuffer, fileName, folderPath)
      if (!uploadResult.success || !uploadResult.uploadData) {
        throw new Error(uploadResult.message || 'SmarterMail upload failed.')
      }

      // Extract file details (uploadData keys map to uploaded filenames)
      const fileMeta = uploadResult.uploadData[fileName]
      if (!fileMeta || !fileMeta.id) {
        throw new Error('SmarterMail uploaded file metadata missing.')
      }

      // Publish the file and obtain the sharing URL
      const linkResult = await client.generatePublicLink(authResult.accessToken, fileMeta.id)
      if (!linkResult.success || !linkResult.publicLink) {
        throw new Error(linkResult.message || 'Failed to generate public download link.')
      }

      // Send the shareable link back to user
      await sendTelegramMessage(
        chatId,
        `✅ <b>File Uploaded Successfully!</b>\n\n` +
        `<b>Name:</b> <code>${fileName}</code>\n` +
        `<b>Link:</b> <a href="${linkResult.publicLink}">${linkResult.publicLink}</a>`
      )
    } catch (err) {
      console.error('Telegram bot file upload error:', err)
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during upload.'
      await sendTelegramMessage(
        chatId,
        `❌ <b>Upload Failed:</b>\n${errorMessage}`
      )
    }
    return
  }

  // 3. Fallback for unhandled text messages
  if (text) {
    await sendTelegramMessage(
      chatId,
      `💬 Send me a photo or a file to upload it directly to your Cranemail cloud drive!\n\nUse <code>/start</code> to view configuration instructions.`
    )
  }
}
