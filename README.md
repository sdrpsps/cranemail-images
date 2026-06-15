# CraneMail Images

[简体中文](./README.zh-CN.md)

A focused image-hosting dashboard for CraneMail workspace storage. It uploads images into a configured CraneMail workspace folder, publishes public links, syncs existing workspace images, and supports Telegram bot uploads for linked users.

Need an email workspace for this project? You can sign up through the NameCrane referral link: [namecrane.com/r/434/email](https://namecrane.com/r/434/email).

Compatibility note: this project is developed and tested against CraneMail, but compatibility with other SmarterMail deployments is not guaranteed.

## Features

- Sign in with a CraneMail account and maintain sessions with access/refresh token cookies.
- Upload images from the web dashboard to CraneMail workspace storage.
- Generate public links automatically after upload.
- Sync existing workspace images under `PUBLIC_FOLDER`.
- Delete the real CraneMail workspace file first, then remove the local record.
- Bind Telegram accounts through temporary tokens generated from the web dashboard.
- Upload photos and documents through the Telegram bot.
- List recent uploads from the Telegram bot.
- Use local SQLite in development and Turso/libSQL in production.
- Frontend built with Next.js App Router, shadcn/ui, Tailwind CSS, lucide-react, and sonner.

## Tech Stack

- Next.js 16
- React 19
- Hono API routes on Next.js
- libSQL/Turso or local SQLite
- shadcn/ui with Base UI primitives
- Tailwind CSS v4
- Telegram Bot API

## Requirements

- Node.js 20 or newer
- npm
- A CraneMail workspace account with file storage access
- Optional: Telegram bot token from BotFather
- Optional: Turso database credentials for hosted deployments

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Configure the required values in `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SMARTERMAIL_URL=https://us1.workspace.org
SMARTERMAIL_CLIENT_ID=cranemail-images-app
PUBLIC_FOLDER=/public
TIMEZONE=Asia/Shanghai

ENCRYPTION_KEY=replace-with-a-secure-random-secret

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=CraneMailImagesBot

TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

Use a long random value for `ENCRYPTION_KEY`. For example:

```bash
openssl rand -hex 32
```

## Environment Variables

`NEXT_PUBLIC_SITE_URL`

Public site origin used for SEO metadata, canonical URLs, and Open Graph metadata.

`NEXT_PUBLIC_SMARTERMAIL_URL`

Base URL for your CraneMail workspace service. Do not include a trailing slash.

`SMARTERMAIL_CLIENT_ID`

Client identifier sent to the CraneMail/SmarterMail-compatible authentication endpoints.

`PUBLIC_FOLDER`

Workspace folder root used for uploads and sync. Both `public` and `/public` are valid. The app normalizes it to a leading slash and removes trailing slashes.

`TIMEZONE`

Timezone used for date-based upload folders and bot date formatting.

`ENCRYPTION_KEY`

Secret used to encrypt stored CraneMail passwords for Telegram bot re-authentication fallback.

`TELEGRAM_BOT_TOKEN`

Telegram bot token. Required only for bot upload and binding flows.

`TELEGRAM_BOT_USERNAME`

Telegram bot username used to generate binding links.

`ALLOWED_TELEGRAM_USERS`

Optional comma-separated Telegram user IDs or usernames. When set, only listed users may use the bot.

`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`

Optional libSQL/Turso database settings. If `TURSO_DATABASE_URL` is empty, the app writes to `local.db` in the project root.

## Development

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Main routes:

- `/` - sign-in page
- `/upload` - authenticated upload dashboard
- `/api/*` - Hono API routes

## Build

Build the project:

```bash
npm run build
```

## Database

The app initializes these tables automatically:

- `users`
- `bind_tokens`
- `uploaded_images`

Local development uses:

```text
local.db
```

Production should use Turso/libSQL by setting `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

## CraneMail Storage Behavior

Web uploads are stored in:

```text
PUBLIC_FOLDER/YYYY/MM/DD
```

For example:

```text
/public/2026/06/15
```

After upload, the app generates a public CraneMail workspace link and stores file metadata in `uploaded_images`.

Workspace sync scans `PUBLIC_FOLDER` recursively and imports image files that are not already present locally by `fileId` or `publicLink`.

Deleting an image from the web dashboard performs a real CraneMail workspace file deletion first. The local database record is removed only after the workspace API reports success.

## Telegram Bot

The bot supports:

- `/start <token>` - bind Telegram to a CraneMail account
- Photo or document upload - upload to CraneMail and return a public link
- `/list`, `/images`, or `📂 My Images / 我的图片` - list recent uploads
- `/help` or `❓ Help / 帮助` - show usage help

To bind a Telegram account:

1. Sign in on the web dashboard.
2. Open the Telegram integration panel.
3. Generate a binding token.
4. Launch the bot from the generated link.
5. Send files or photos to the bot.

The bot stores uploads in the same CraneMail `PUBLIC_FOLDER/YYYY/MM/DD` structure and records metadata in the same `uploaded_images` table.

## Telegram Webhook

Webhook endpoint:

```text
/api/telegram/webhook
```

For a deployed app, register it with Telegram:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook"
```

For local development, expose your local server with a tunnel such as ngrok or Cloudflare Tunnel, then register the tunnel URL.

## UI Notes

- Buttons, inputs, cards, alert dialogs, and toaster UI use shadcn/ui components.
- Icons use lucide-react.
- Toast notifications use sonner.
- The `/upload` dashboard is marked `noindex` because it is an authenticated application surface.
- A GitHub referral button is shown in the top-right corner and points to:

```text
https://github.com/sdrpsps/cranemail-images
```

## Current Bot Limitation

The Telegram bot can upload and list images, but it does not yet expose a delete command or inline delete buttons. File deletion is currently available from the web dashboard.

## Security Notes

- Use HTTPS in production.
- Keep `ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, and Turso credentials private.
- Use `ALLOWED_TELEGRAM_USERS` when the bot should be restricted to specific Telegram accounts.
- Rotate `ENCRYPTION_KEY` carefully. Existing encrypted passwords cannot be decrypted after changing it unless you migrate or rebind users.
- CraneMail workspace file deletion is destructive and cannot be undone by this app.
