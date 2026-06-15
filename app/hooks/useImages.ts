'use client'

import { useCallback, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { toast } from 'sonner'

import type { UploadedImage } from '@/app/types/app'

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  if (type === 'error') {
    toast.error(message)
    return
  }

  if (type === 'info') {
    toast.info(message)
    return
  }

  toast.success(message)
}

export function useImages() {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [syncing, setSyncing] = useState(false)

  const fetchImages = useCallback(async () => {
    setImagesLoading(true)
    setImagesError('')
    try {
      const res = await fetch('/api/images')
      const data = await res.json()
      if (data.success && data.data) {
        setImages(data.data)
      } else {
        setImagesError(data.message || 'Failed to fetch uploaded images')
      }
    } catch (err) {
      setImagesError('Network error. Failed to load uploaded images.')
      console.error(err)
    } finally {
      setImagesLoading(false)
    }
  }, [])

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadError('')

      const formData = new FormData()
      formData.append('file', file)

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.success && data.data) {
          const newImg: UploadedImage = {
            id: data.data.id,
            fileName: data.data.fileName,
            publicLink: data.data.publicLink,
            size: file.size,
            source: 'web',
            createdAt: data.data.createdAt || new Date().toISOString(),
          }
          setImages((prev) => [newImg, ...prev])
          showToast('Image uploaded successfully!')
        } else {
          setUploadError(data.message || 'Upload failed. Please try again.')
        }
      } catch (err) {
        setUploadError('Failed to upload file due to a connection error.')
        console.error(err)
      } finally {
        setUploading(false)
      }
    },
    [],
  )

  const syncWorkspace = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/images/sync', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success && data.data) {
        const count = data.data.syncedCount
        showToast(`Successfully synced ${count} new image(s) from workspace!`)
        fetchImages()
      } else {
        showToast(data.message || 'Sync failed. Please try again.', 'error')
      }
    } catch (err) {
      showToast('Network error during sync.', 'error')
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }, [fetchImages])

  const deleteImage = useCallback(
    async (id: string) => {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })

      try {
        const res = await fetch(`/api/images/${id}`, {
          method: 'DELETE',
        })
        const data = await res.json()
        if (data.success) {
          setImages((prev) => prev.filter((img) => img.id !== id))
          showToast('Image record removed')
        } else {
          showToast(data.message || 'Failed to delete the image record', 'error')
        }
      } catch (err) {
        showToast('Connection error. Failed to delete image.', 'error')
        console.error(err)
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [],
  )

  const copyLink = useCallback(
    async (url: string) => {
      await navigator.clipboard.writeText(url)
      showToast('Direct link copied to clipboard!')
    },
    [],
  )

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        await uploadFile(e.dataTransfer.files[0])
      }
    },
    [uploadFile],
  )

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        await uploadFile(e.target.files[0])
      }
      e.target.value = ''
    },
    [uploadFile],
  )

  return {
    images,
    imagesLoading,
    imagesError,
    uploading,
    uploadError,
    isDragActive,
    deletingIds,
    syncing,
    fetchImages,
    syncWorkspace,
    deleteImage,
    copyLink,
    handleDrag,
    handleDrop,
    handleFileChange,
    setImages,
  }
}
