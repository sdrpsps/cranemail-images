import crypto from 'crypto'

// Derive a secure 32-byte key from the configured ENCRYPTION_KEY environment variable.
// If not specified, we fall back to a hardcoded string for development ease, but warn the user.
const rawKey = process.env.ENCRYPTION_KEY || 'cranemail-images-app-default-development-encryption-key'
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[WARNING] ENCRYPTION_KEY env variable is not set! Using default key in production is highly insecure.')
}

// SHA-256 hashes the raw key to guarantee exactly 32 bytes (256 bits) for AES-256
const key = crypto.createHash('sha256').update(rawKey).digest()

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 12 bytes is standard for GCM

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:encryptedText
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag().toString('hex')
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypts a colon-separated cipher text using AES-256-GCM.
 */
export function decrypt(cipherText: string): string {
  const parts = cipherText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
