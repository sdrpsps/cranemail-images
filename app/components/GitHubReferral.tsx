import { Star } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'

export function GitHubReferral() {
  return (
    <aside className="pointer-events-none fixed right-4 top-4 z-40 sm:right-6 sm:top-6">
      <a
        href="https://github.com/sdrpsps/cranemail-images"
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className:
            'pointer-events-auto h-9 border-zinc-700/80 bg-zinc-950/75 px-3 text-xs text-zinc-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl hover:bg-zinc-900 hover:text-white',
        })}
        aria-label="View CraneMail Images on GitHub"
      >
        <span>Star on GitHub</span>
        <Star className="h-3.5 w-3.5 text-amber-300" />
      </a>
    </aside>
  )
}
