# CraneMail Images

[English](./README.md)

CraneMail Images 是一个面向 CraneMail workspace 存储的轻量图片托管面板。它可以把图片上传到指定的 CraneMail workspace 文件夹，生成公开链接，同步 workspace 中已有图片，并支持已绑定用户通过 Telegram bot 上传文件。

需要为这个项目准备邮箱 workspace？可以通过我的 NameCrane 推荐链接注册：[namecrane.com/r/434/email](https://namecrane.com/r/434/email)。

兼容性说明：本项目基于 CraneMail 开发和测试，但不保证兼容其他 SmarterMail 部署。

## 功能

- 使用 CraneMail 账号登录，并通过 access/refresh token cookie 维持会话。
- 支持从 Web 页面上传图片到 CraneMail workspace 存储。
- 上传后自动生成公开访问链接。
- 支持同步 `PUBLIC_FOLDER` 下已有的 workspace 图片。
- Web 端删除图片时会先真正删除 CraneMail workspace 文件，再清理本地记录。
- 支持通过 Web 端临时 token 绑定 Telegram 账号。
- Telegram bot 支持上传照片和文档。
- Telegram bot 支持查看最近上传图片。
- 开发环境可使用本地 SQLite，生产环境可使用 Turso/libSQL。
- 前端基于 Next.js App Router、shadcn/ui、Tailwind CSS、lucide-react 和 sonner。

## 技术栈

- Next.js 16
- React 19
- 基于 Next.js 的 Hono API routes
- libSQL/Turso 或本地 SQLite
- shadcn/ui with Base UI primitives
- Tailwind CSS v4
- Telegram Bot API

## 环境要求

- Node.js 20 或更新版本
- npm
- 一个可访问文件存储的 CraneMail workspace 账号
- 可选：从 BotFather 获取 Telegram bot token
- 可选：用于部署环境的 Turso 数据库凭据

## 安装

安装依赖：

```bash
npm install
```

创建本地环境变量文件：

```bash
cp .env.example .env.local
```

在 `.env.local` 中配置必要变量：

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

`ENCRYPTION_KEY` 应使用足够长的随机值。例如：

```bash
openssl rand -hex 32
```

## 环境变量

`NEXT_PUBLIC_SITE_URL`

用于 SEO metadata、canonical URL 和 Open Graph metadata 的公开站点地址。

`NEXT_PUBLIC_SMARTERMAIL_URL`

CraneMail workspace 服务基础 URL。建议不要带结尾斜杠。

`SMARTERMAIL_CLIENT_ID`

发送给 CraneMail/SmarterMail-compatible 认证接口的 client identifier。

`PUBLIC_FOLDER`

用于上传和同步的 workspace 根目录。`public` 和 `/public` 都有效，应用会自动补齐开头斜杠并移除结尾斜杠。

`TIMEZONE`

用于按日期生成上传目录，以及 Telegram bot 中的日期格式化。

`ENCRYPTION_KEY`

用于加密存储的 CraneMail 密码，供 Telegram bot 在 refresh token 失效时重新认证。

`TELEGRAM_BOT_TOKEN`

Telegram bot token。只有在需要 bot 上传和绑定功能时才必须配置。

`TELEGRAM_BOT_USERNAME`

用于生成 Telegram 绑定链接的 bot 用户名。

`ALLOWED_TELEGRAM_USERS`

可选，逗号分隔的 Telegram user ID 或 username。配置后只有列表中的用户可以使用 bot。

`TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`

可选的 libSQL/Turso 数据库配置。如果 `TURSO_DATABASE_URL` 为空，应用会在项目根目录写入 `local.db`。

## 本地开发

启动开发服务器：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

主要路由：

- `/` - 登录页
- `/upload` - 已认证上传面板
- `/api/*` - Hono API routes

## 构建

正常构建：

```bash
npm run build
```

## 数据库

应用会自动初始化以下表：

- `users`
- `bind_tokens`
- `uploaded_images`

本地开发默认使用：

```text
local.db
```

生产环境建议配置 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN` 使用 Turso/libSQL。

## CraneMail 存储行为

Web 上传文件会保存到：

```text
PUBLIC_FOLDER/YYYY/MM/DD
```

例如：

```text
/public/2026/06/15
```

上传后，应用会生成 CraneMail workspace 公开链接，并把文件元数据保存到 `uploaded_images`。

Workspace 同步会递归扫描 `PUBLIC_FOLDER`，并根据 `fileId` 或 `publicLink` 导入本地尚未存在的图片。

从 Web 面板删除图片时，应用会先真正删除 CraneMail workspace 文件。只有 workspace API 返回删除成功后，本地数据库记录才会被移除。

## Telegram Bot

Bot 当前支持：

- `/start <token>` - 绑定 Telegram 到 CraneMail 账号
- 上传照片或文档 - 上传到 CraneMail 并返回公开链接
- `/list`、`/images` 或 `📂 My Images / 我的图片` - 查看最近上传
- `/help` 或 `❓ Help / 帮助` - 查看帮助

绑定 Telegram 账号：

1. 在 Web dashboard 登录。
2. 打开 Telegram integration 面板。
3. 生成绑定 token。
4. 通过生成的链接打开 bot。
5. 向 bot 发送文件或照片。

Bot 上传文件会使用同样的 CraneMail `PUBLIC_FOLDER/YYYY/MM/DD` 目录结构，并把元数据写入同一个 `uploaded_images` 表。

## Telegram Webhook

Webhook endpoint:

```text
/api/telegram/webhook
```

部署后，用 Telegram 注册 webhook：

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.example/api/telegram/webhook"
```

本地开发时，可以用 ngrok 或 Cloudflare Tunnel 暴露本地服务，再注册 tunnel URL。

## UI 说明

- 按钮、输入框、卡片、Alert Dialog 和 toaster 使用 shadcn/ui 组件。
- 图标使用 lucide-react。
- Toast notifications 使用 sonner。
- `/upload` 是登录后的应用页面，因此 metadata 中设置了 `noindex`。
- 右上角 GitHub 引流按钮指向：

```text
https://github.com/sdrpsps/cranemail-images
```

## 当前 Bot 限制

Telegram bot 当前可以上传和列出图片，但还没有删除命令或 inline 删除按钮。文件删除目前需要在 Web dashboard 中完成。

## 安全说明

- 生产环境请使用 HTTPS。
- 请妥善保护 `ENCRYPTION_KEY`、`TELEGRAM_BOT_TOKEN` 和 Turso credentials。
- 如果 bot 只应开放给特定账号，请配置 `ALLOWED_TELEGRAM_USERS`。
- 请谨慎轮换 `ENCRYPTION_KEY`。更换后，已有加密密码无法解密，除非你执行迁移或让用户重新绑定。
- CraneMail workspace 文件删除是破坏性操作，本应用无法撤销。
