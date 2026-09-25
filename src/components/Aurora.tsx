import { useEffect, useRef, useState, type RefObject } from 'react'
import { presets, type AuroraPresetName } from '../webgl/presets'
import { loadAurora } from '../webgl/loader'
import { cn } from '../lib/cn'

interface AuroraProps {
  preset: AuroraPresetName
  seed?: number
  interactive?: boolean
  className?: string
  /** A canvas that receives a small copy of every frame (for blurred backdrops). */
  mirror?: RefObject<HTMLCanvasElement | null>
}

export function Aurora({ preset, seed = 0, interactive = false, className, mirror }: AuroraProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const config = presets[preset]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let detach: (() => void) | undefined
    let cancelled = false
    loadAurora().then((engine) => {
      if (!engine || cancelled) return
      detach = engine.attach(canvas, {
        preset: config,
        seed,
        interactive,
        mirrors: mirror?.current ? [mirror.current] : [],
        onReady: () => setReady(true),
      })
    })
    return () => {
      cancelled = true
      detach?.()
    }
  }, [config, seed, interactive, mirror])

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ background: config.fallback }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full transition-opacity duration-[1400ms] ease-out"
        style={{ opacity: ready ? 1 : 0 }}
      />
    </div>
  )
}
