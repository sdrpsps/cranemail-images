'use client'

import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { AlertTriangle, CheckCircle2, LogOut, Server } from 'lucide-react'

import { TelegramBindModal } from '@/app/components/TelegramBindModal'
import { UploadDropzone } from '@/app/components/UploadDropzone'
import { UploadedImagesGrid } from '@/app/components/UploadedImagesGrid'
import type { UploadedImage, User } from '@/app/types/app'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface UploadDashboardProps {
  user: User
  images: UploadedImage[]
  imagesLoading: boolean
  imagesError: string
  uploading: boolean
  uploadError: string
  isDragActive: boolean
  syncing: boolean
  deletingIds: Set<string>
  onLogout: () => void
  onRefreshSession: () => Promise<void>
  onRefreshImages: () => Promise<void>
  onSyncWorkspace: () => void
  onCopyLink: (url: string) => void
  onDeleteImage: (id: string) => Promise<void> | void
  onDrag: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function UploadDashboard({
  user,
  images,
  imagesLoading,
  imagesError,
  uploading,
  uploadError,
  isDragActive,
  syncing,
  deletingIds,
  onLogout,
  onRefreshSession,
  onRefreshImages,
  onSyncWorkspace,
  onCopyLink,
  onDeleteImage,
  onDrag,
  onDrop,
  onFileChange,
}: UploadDashboardProps) {
  const [showBindModal, setShowBindModal] = useState(false)

  const refreshBindStatus = async () => {
    await onRefreshSession()
    setShowBindModal(false)
  }

  return (
    <>
      <Card className="rounded-3xl border-zinc-700/70 bg-zinc-800/40 p-5 py-5 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.62)] ring-1 ring-white/5 backdrop-blur-2xl transition-all duration-500 sm:p-6 sm:py-6 lg:p-8 lg:py-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-zinc-700/60 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20">
              <Server className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">CraneMail Cloud Drive</h1>
              <p className="mt-1 text-sm text-zinc-400">Personal Cloud Image Host</p>
            </div>
          </div>

          <Button
            onClick={onLogout}
            variant="outline"
            className="h-11 border-zinc-700/80 bg-zinc-800/30 px-5 py-3 text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <aside className="space-y-4">
            <Card className="flex flex-col space-y-1.5 border-zinc-800/80 bg-zinc-950/65 p-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Account</span>
              <span className="select-all break-all font-medium text-zinc-200">{user.emailAddress}</span>
            </Card>

            <Card className="flex flex-col space-y-1.5 border-zinc-800/80 bg-zinc-950/65 p-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">SmarterMail Server</span>
              <span className="select-all break-all font-mono text-sm text-blue-400">{user.serverUrl}</span>
            </Card>

            <Card className="flex flex-col space-y-3 border-zinc-800/80 bg-zinc-950/65 p-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Telegram Upload Integration</span>

              {user.isTelegramBound ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 font-medium text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm">Linked Successfully</span>
                  </div>
                  <Button
                    onClick={() => setShowBindModal(true)}
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs text-zinc-400"
                  >
                    Re-link Account
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-2 font-medium text-amber-500">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm">Not Linked</span>
                  </div>
                  <Button
                    onClick={() => setShowBindModal(true)}
                    className="h-10 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/10 hover:from-blue-500 hover:to-indigo-500"
                  >
                    Link Telegram Bot
                  </Button>
                </div>
              )}
            </Card>

            <UploadDropzone
              uploading={uploading}
              uploadError={uploadError}
              isDragActive={isDragActive}
              onDrag={onDrag}
              onDrop={onDrop}
              onFileChange={onFileChange}
            />
          </aside>

          <UploadedImagesGrid
            images={images}
            imagesLoading={imagesLoading}
            imagesError={imagesError}
            syncing={syncing}
            deletingIds={deletingIds}
            onRefreshImages={onRefreshImages}
            onSyncWorkspace={onSyncWorkspace}
            onCopyLink={onCopyLink}
            onDeleteImage={onDeleteImage}
          />
        </div>
      </Card>

      {showBindModal && <TelegramBindModal onClose={() => setShowBindModal(false)} onRefreshStatus={refreshBindStatus} />}
    </>
  )
}
