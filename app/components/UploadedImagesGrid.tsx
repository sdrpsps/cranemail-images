'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertTriangle, Copy, ExternalLink, FileText, ImageIcon, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'

import type { UploadedImage } from '@/app/types/app'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface UploadedImagesGridProps {
  images: UploadedImage[]
  imagesLoading: boolean
  imagesError: string
  syncing: boolean
  deletingIds: Set<string>
  onSyncWorkspace: () => void
  onCopyLink: (url: string) => void
  onDeleteImage: (id: string) => Promise<void> | void
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const mb = bytes / (1024 * 1024)
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

function formatDate(isoString?: string) {
  if (!isoString) return ''
  try {
    const cleanIso = isoString.includes(' ') && !isoString.includes('T') ? `${isoString.replace(' ', 'T')}Z` : isoString
    const d = new Date(cleanIso)
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function getPublicUrl(publicLink: string) {
  if (/^https?:\/\//i.test(publicLink)) return publicLink

  const baseUrl = process.env.NEXT_PUBLIC_SMARTERMAIL_URL
  if (!baseUrl) return publicLink

  return `${baseUrl.replace(/\/$/, '')}/${publicLink.replace(/^\//, '')}`
}

function isPreviewable(fileName: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
}

function SourceBadge({ source }: { source: string }) {
  const styles =
    source === 'telegram'
      ? 'border-sky-500/20 bg-sky-500/10 text-sky-400'
      : source === 'workspace'
        ? 'border-purple-500/20 bg-purple-500/10 text-purple-400'
        : 'border-blue-500/20 bg-blue-500/10 text-blue-400'

  const label = source === 'telegram' ? 'Bot' : source === 'workspace' ? 'Workspace' : 'Web'

  return <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${styles}`}>{label}</span>
}

export function UploadedImagesGrid({
  images,
  imagesLoading,
  imagesError,
  syncing,
  deletingIds,
  onSyncWorkspace,
  onCopyLink,
  onDeleteImage,
}: UploadedImagesGridProps) {
  const [deleteTarget, setDeleteTarget] = useState<UploadedImage | null>(null)
  const isDeletingTarget = deleteTarget ? deletingIds.has(deleteTarget.id) : false

  const confirmDelete = async () => {
    if (!deleteTarget) return

    await onDeleteImage(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <>
      <Card className="space-y-3 border-zinc-800/80 bg-zinc-950/70 p-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Uploaded History ({images.length})</p>
          <div className="flex items-center space-x-2">
            <Button
              onClick={onSyncWorkspace}
              disabled={syncing || imagesLoading}
              variant="outline"
              size="xs"
              className="border-zinc-800 bg-zinc-950/60 text-[10px] text-zinc-300 hover:bg-zinc-900 hover:text-white"
              title="Sync existing images from your SmarterMail storage folders"
            >
              {syncing ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin text-purple-400" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 text-purple-400" />
                  <span>Sync Workspace</span>
                </>
              )}
            </Button>
            {imagesLoading && !syncing && <LoaderCircle className="h-4 w-4 animate-spin text-blue-500" />}
          </div>
        </div>

        {imagesError && <p className="text-xs text-red-400">{imagesError}</p>}

        {images.length > 0 ? (
          <div className="grid max-h-[520px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 overflow-y-auto rounded-xl bg-black/20 p-2 pr-1 ring-1 ring-zinc-900/80">
            {images.map((image) => {
              const publicUrl = getPublicUrl(image.publicLink)

              return (
                <Card
                  key={image.id}
                  className="flex min-w-0 flex-col gap-3 border-zinc-800/90 bg-zinc-900/75 p-3 py-3 text-xs shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/95 hover:shadow-[0_14px_30px_rgba(0,0,0,0.34)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {isPreviewable(image.fileName) ? (
                      <Image
                        src={publicUrl}
                        alt={image.fileName}
                        width={64}
                        height={64}
                        className="h-16 w-16 flex-shrink-0 cursor-zoom-in rounded-lg border border-zinc-700/80 bg-zinc-950 object-cover shadow-[0_6px_16px_rgba(0,0,0,0.32)] transition-transform duration-200 hover:scale-105"
                        onClick={() => window.open(publicUrl, '_blank')}
                      />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-950 shadow-[0_6px_16px_rgba(0,0,0,0.32)]">
                        <FileText className="h-5 w-5 text-zinc-500" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-zinc-200" title={image.fileName}>
                        {image.fileName}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">{formatSize(image.size)}</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-500">{formatDate(image.createdAt)}</span>
                        <SourceBadge source={image.source} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-1">
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'icon-xs',
                        className: 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100',
                      })}
                      title="Open Link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <Button
                      onClick={() => onCopyLink(publicUrl)}
                      variant="outline"
                      size="icon-xs"
                      className="border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-blue-400"
                      title="Copy Direct Link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => setDeleteTarget(image)}
                      disabled={deletingIds.has(image.id)}
                      variant="destructive"
                      size="icon-xs"
                      className="border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-red-900/40 hover:bg-red-950/40 hover:text-red-400"
                      title="Delete Record"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/25 py-6 text-center">
            <ImageIcon className="mb-2 h-7 w-7 text-zinc-600" />
            <p className="text-[11px] text-zinc-500">No images uploaded yet.</p>
            <p className="mt-0.5 text-[9px] text-zinc-600">Drag & drop files above to start.</p>
          </div>
        )}
      </Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/50">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-red-500/10 text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete workspace file?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This permanently deletes the file from your SmarterMail workspace and removes it from upload history. The file name is{' '}
              <span className="font-medium text-zinc-200">{deleteTarget?.fileName}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-zinc-800 bg-zinc-900/60">
            <AlertDialogCancel
              disabled={isDeletingTarget}
              className="border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeletingTarget}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {isDeletingTarget ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
