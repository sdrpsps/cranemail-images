import fs from 'fs'
import path from 'path'

// Load environment variables from .env.local manually before importing bot dependencies
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8')
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=')
        if (parts.length >= 2) {
          const key = parts[0].trim()
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
          process.env[key] = value
        }
      }
    })
    console.log('Loaded environment configuration from .env.local')
  }
} catch (err) {
  console.error('Error loading .env.local manually:', err)
}

import { handleTelegramUpdate } from '../lib/bot'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is not set in environment or .env.local')
  process.exit(1)
}

let offset = 0

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`)
    const data = await res.json()
    
    if (data.ok && data.result) {
      for (const update of data.result) {
        offset = update.update_id + 1
        console.log(`[Telegram Bot] Processing update_id: ${update.update_id}`)
        await handleTelegramUpdate(update)
      }
    } else if (!data.ok) {
      console.error('[Telegram Bot] getUpdates API Error:', data.description)
    }
  } catch (err) {
    console.error('[Telegram Bot] Connection error in polling loop:', err)
  }
  
  // Re-poll after a brief delay
  setTimeout(poll, 500)
}

console.log('----------------------------------------------------')
console.log('Starting local Telegram Bot polling loop...')
console.log(`Using Bot Token: ${token.substring(0, 8)}...${token.substring(token.length - 4)}`)
console.log('Send files or /start commands in Telegram to test.')
console.log('Press Ctrl+C to exit.')
console.log('----------------------------------------------------')

poll()
