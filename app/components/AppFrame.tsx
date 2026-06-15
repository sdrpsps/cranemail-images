import type { ReactNode } from 'react'

import { GitHubReferral } from '@/app/components/GitHubReferral'

interface AppFrameProps {
  children: ReactNode
  width?: 'narrow' | 'wide'
}

export function AppFrame({ children, width = 'narrow' }: AppFrameProps) {
  const maxWidth = width === 'wide' ? 'max-w-6xl' : 'max-w-lg'

  return (
    <div className="min-h-screen bg-[#0a0c10] text-zinc-100 font-sans px-4 py-8 sm:px-6 lg:px-8">
      <GitHubReferral />
      <main className={`mx-auto flex min-h-[calc(100vh-4rem)] w-full ${maxWidth} items-center`}>
        <div className="w-full">{children}</div>
      </main>
    </div>
  )
}
