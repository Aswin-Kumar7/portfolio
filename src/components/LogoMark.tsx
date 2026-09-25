import type { LogoImage } from '../data/types'
import { cn } from '../lib/cn'

/** Move the artwork's measured centre to the middle of the circle, then zoom around it. */
function centre({ scale = 1, focus = [0.5, 0.5] }: LogoImage) {
  const dx = (0.5 - focus[0]) * 100
  const dy = (0.5 - focus[1]) * 100
  return `scale(${scale}) translate(${dx}%, ${dy}%)`
}

/**
 * An organisation's logo in a round crop. Logos arrive with very different padding and
 * backgrounds, so each one carries its own fit: a fill colour behind it, a zoom past its
 * padding, and its artwork's measured centre. Without a logo, the initials stand in.
 */
export function LogoMark({ logo, monogram, className }: { logo?: LogoImage; monogram: string; className?: string }) {
  return (
    <span
      className={cn(
        'relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full shadow-[0_6px_18px_-8px_rgba(0,0,0,0.9)] ring-1 ring-white/20',
        className,
      )}
      style={{ background: logo?.bg ?? 'var(--mono-grad)' }}
    >
      {logo ? (
        <img
          src={logo.src}
          alt=""
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
          style={{ transform: centre(logo) }}
        />
      ) : (
        <span className="font-mono text-[10px] font-medium tracking-[0.04em] text-white">{monogram}</span>
      )}
    </span>
  )
}
