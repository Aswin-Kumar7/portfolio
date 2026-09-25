import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'

interface Star {
  x: number
  y: number
  r: number
  a: number
  speed: number
  phase: number
  sparkle: boolean
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Crisp, twinkling stars + the 4-point glints from the design. Drawn on a 2D
 * canvas at full device resolution so they stay sharp above the (deliberately
 * soft, lower-resolution) WebGL sky.
 */
export function Starfield({
  className,
  seed = 7,
  density = 1,
  sparkles = 10,
  maxY = 0.72,
}: {
  className?: string
  seed?: number
  density?: number
  sparkles?: number
  maxY?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let stars: Star[] = []
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let visible = true
    let last = 0

    const tint = getComputedStyle(document.documentElement).getPropertyValue('--ice-rgb').trim().split(/\s+/).join(',') || '159,214,255'

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const rand = rng(seed)
      const count = Math.round(((w * h) / 9000) * density)
      stars = []
      for (let i = 0; i < count; i++) {
        stars.push({
          x: rand(),
          y: Math.pow(rand(), 1.5) * maxY,
          r: 0.35 + rand() * 0.75,
          a: 0.25 + rand() * 0.65,
          speed: 0.4 + rand() * 1.6,
          phase: rand() * Math.PI * 2,
          sparkle: false,
        })
      }
      const glints = Math.round(sparkles * Math.min(1, Math.max(0.45, w / 1100)))
      for (let i = 0; i < glints; i++) {
        stars.push({
          x: 0.04 + rand() * 0.92,
          y: 0.05 + Math.pow(rand(), 1.2) * (maxY - 0.08),
          r: 0.7 + rand() * 0.9,
          a: 0.75 + rand() * 0.25,
          speed: 0.35 + rand() * 0.8,
          phase: rand() * Math.PI * 2,
          sparkle: true,
        })
      }
    }

    const draw = (time: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      for (const s of stars) {
        const tw = still ? 1 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase)
        const x = s.x * w
        const y = s.y * h
        const alpha = s.a * tw
        if (!s.sparkle) {
          ctx.globalAlpha = alpha
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(x, y, s.r, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        const size = s.r * (5.5 + 1.5 * tw)
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6)
        glow.addColorStop(0, `rgba(255,255,255,${0.55 * alpha})`)
        glow.addColorStop(0.25, `rgba(${tint},${0.22 * alpha})`)
        glow.addColorStop(1, `rgba(${tint},0)`)
        ctx.globalAlpha = 1
        ctx.fillStyle = glow
        ctx.fillRect(x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2)
        // four-point glint
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        const k = size * 0.16
        ctx.moveTo(x, y - size)
        ctx.quadraticCurveTo(x + k, y - k, x + size, y)
        ctx.quadraticCurveTo(x + k, y + k, x, y + size)
        ctx.quadraticCurveTo(x - k, y + k, x - size, y)
        ctx.quadraticCurveTo(x - k, y - k, x, y - size)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const loop = (time: number) => {
      raf = 0
      if (!visible) return
      if (time - last > 33) {
        draw(time)
        last = time
      }
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      if (still) draw(0)
      else if (!raf) raf = requestAnimationFrame(loop)
    }

    build()
    start()

    const ro = new ResizeObserver(() => {
      build()
      if (still) draw(0)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible) start()
    })
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [seed, density, sparkles, maxY])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}
