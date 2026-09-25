import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '../lib/cn'

/*
 * Project photos are published scrambled (`.bin`, XOR with KEY; see scripts/project-image.py),
 * so the network panel shows bytes that don't open as an image and there's no image URL to copy.
 * The page unscrambles them in memory and hands the <img> a blob: URL that's revoked as soon as
 * the picture is decoded. It deters casual saving; nothing a browser displays is truly un-copyable.
 */

const KEY = new TextEncoder().encode('aswinkumar.dev') // must match scripts/project-image.py
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

async function unveil(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal, credentials: 'omit' })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  for (let i = 0; i < bytes.length; i++) bytes[i]! ^= KEY[i % KEY.length]!
  return URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
}

interface VeiledImageProps {
  /** `/assets/projects/<name>` without the size and extension. */
  base: string
  /** Published widths (`<base>-<w>.bin`); omit for a single fixed file (`<base>.bin`). */
  widths?: number[]
  alt: string
  className?: string
  style?: CSSProperties
}

export function VeiledImage({ base, widths, alt, className, style }: VeiledImageProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const img = ref.current
    if (!img) return
    const controller = new AbortController()
    let url: string | undefined
    // fetched when it comes near the screen, at the smallest size that stays sharp
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        const need = img.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2)
        const file = widths ? `${base}-${widths.find((w) => w >= need) ?? widths.at(-1)}.bin` : `${base}.bin`
        unveil(file, controller.signal)
          .then((u) => setSrc((url = u)))
          .catch(() => undefined)
      },
      { rootMargin: '800px' },
    )
    io.observe(img)
    return () => {
      io.disconnect()
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [base, widths])

  return (
    <img
      ref={ref}
      src={src ?? BLANK}
      alt={alt}
      decoding="async"
      draggable={false}
      // once decoded the image stays on screen, but its blob: address stops resolving
      onLoad={() => src && URL.revokeObjectURL(src)}
      className={cn('transition-opacity duration-700', src ? 'opacity-100' : 'opacity-0', className)}
      style={style}
    />
  )
}
