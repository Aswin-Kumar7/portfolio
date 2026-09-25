import { GL, type Program } from '../scene/gl'
import { fragmentShader, vertexShader } from './shader'
import type { AuroraPreset } from './presets'

/**
 * One WebGL context for the whole page.
 *
 * Every <Aurora> surface (cards, tiles, project covers…) registers a plain 2D canvas.
 * Each frame the shared context draws the scene for every *visible* target into a
 * scratch viewport and blits it into that target's canvas. This sidesteps per-page
 * context limits (mobile Safari caps them low), keeps shader compilation to a single
 * program, and lets off-screen surfaces cost nothing.
 */

interface AttachOptions {
  preset: AuroraPreset
  seed?: number
  /** Canvases that receive a downscaled copy (e.g. a blurred backdrop). */
  mirrors?: HTMLCanvasElement[]
  onReady?: () => void
}

interface Target {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  preset: AuroraPreset
  colors: Record<keyof AuroraPreset['colors'], [number, number, number]>
  seed: number
  mirrors: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[]
  onReady?: () => void
  cssW: number
  cssH: number
  w: number
  h: number
  visible: boolean
  dirty: boolean
  ready: boolean
  last: number
  mirrored: number
}

const hex = (value: string): [number, number, number] => {
  const n = Number.parseInt(value.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const MAX_SIDE = 1800
/** Blurred backdrops don't need every frame: under an 18px blur, a few updates a second look the same. */
const MIRROR_INTERVAL = 250

class AuroraEngine {
  private canvas = document.createElement('canvas')
  private g: GL
  private program: Program
  private compiled = false
  private targets = new Set<Target>()
  private byCanvas = new Map<Element, Target>()
  private io: IntersectionObserver
  private ro: ResizeObserver
  private raf = 0
  private start = performance.now()
  private glW = 1
  private glH = 1
  private quality = 1
  private frameTimes: number[] = []
  private lastTick = 0
  private lost = false
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private coarse = window.matchMedia('(pointer: coarse)').matches

  constructor() {
    this.g = new GL(this.canvas)
    this.program = this.g.program(vertexShader, fragmentShader)
    this.canvas.width = this.canvas.height = 1

    this.io = new IntersectionObserver(this.onIntersect, { rootMargin: '120px 0px' })
    this.ro = new ResizeObserver(this.onResize)

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false
      this.g = new GL(this.canvas)
      this.program = this.g.program(vertexShader, fragmentShader)
      this.compiled = false
      this.targets.forEach((t) => (t.dirty = true))
      this.ensureLoop()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLoop()
      else this.ensureLoop()
    })
    this.reducedMotion.addEventListener('change', () => {
      this.targets.forEach((t) => (t.dirty = true))
      this.ensureLoop()
    })
  }

  attach(canvas: HTMLCanvasElement, opts: AttachOptions): () => void {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return () => {}
    const mirrors = (opts.mirrors ?? []).flatMap((m) => {
      const mctx = m.getContext('2d', { alpha: false })
      return mctx ? [{ canvas: m, ctx: mctx }] : []
    })
    const c = opts.preset.colors
    const target: Target = {
      canvas,
      ctx,
      preset: opts.preset,
      colors: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, hex(v)])) as Target['colors'],
      seed: opts.seed ?? 0,
      mirrors,
      onReady: opts.onReady,
      cssW: 0,
      cssH: 0,
      w: 0,
      h: 0,
      visible: false,
      dirty: true,
      ready: false,
      last: 0,
      mirrored: 0,
    }
    this.targets.add(target)
    this.byCanvas.set(canvas, target)
    this.measure(target, canvas.getBoundingClientRect())
    this.io.observe(canvas)
    this.ro.observe(canvas)
    return () => {
      this.io.unobserve(canvas)
      this.ro.unobserve(canvas)
      this.targets.delete(target)
      this.byCanvas.delete(canvas)
    }
  }

  // ------------------------------------------------------------------ sizing
  private measure(t: Target, rect: { width: number; height: number }) {
    t.cssW = rect.width
    t.cssH = rect.height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = t.preset.renderScale * (1 + (dpr - 1) * 0.5) * this.quality
    const aspect = t.cssW / Math.max(t.cssH, 1)
    let w = Math.max(2, Math.round(t.cssW * scale))
    let h = Math.max(2, Math.round(t.cssH * scale))
    if (w > MAX_SIDE) {
      w = MAX_SIDE
      h = Math.round(w / aspect)
    }
    if (h > MAX_SIDE) {
      h = MAX_SIDE
      w = Math.round(h * aspect)
    }
    if (w !== t.w || h !== t.h) {
      t.w = w
      t.h = h
      t.canvas.width = w
      t.canvas.height = h
      for (const m of t.mirrors) {
        m.canvas.width = Math.max(4, Math.round(w / 4))
        m.canvas.height = Math.max(4, Math.round(h / 4))
      }
      t.dirty = true
      t.mirrored = 0
    }
  }

  private onResize = (entries: ResizeObserverEntry[]) => {
    for (const e of entries) {
      const t = this.byCanvas.get(e.target)
      if (t) this.measure(t, e.contentRect)
    }
    this.ensureLoop()
  }

  private onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const e of entries) {
      const t = this.byCanvas.get(e.target)
      if (!t) continue
      t.visible = e.isIntersecting
      if (t.visible) t.dirty = t.dirty || !t.ready
    }
    this.ensureLoop()
  }

  // -------------------------------------------------------------------- loop
  private ensureLoop() {
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick)
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick = (now: number) => {
    this.raf = 0
    if (this.lost) return
    // the program compiles off the main thread where supported; poll until it's linked
    if (!this.compiled) {
      try {
        this.compiled = this.program.ready()
      } catch (err) {
        console.warn('[aurora] shader failed, using CSS fallback.', err)
        return
      }
      if (!this.compiled) {
        this.ensureLoop()
        return
      }
    }

    const still = this.reducedMotion.matches
    const time = still ? 12 : (now - this.start) / 1000
    let anyAnimating = false
    let heavy = false

    for (const t of this.targets) {
      if (!t.visible || t.w < 2) continue
      const animating = !still
      anyAnimating ||= animating
      const fps = this.coarse ? Math.min(t.preset.fps, 30) : t.preset.fps
      const due = t.dirty || (animating && now - t.last >= 1000 / fps - 2)
      if (!due) continue
      if (t.w * t.h > 250_000) heavy = true
      this.draw(t, time, now)
      t.last = now
      t.dirty = false
      if (!t.ready) {
        t.ready = true
        t.onReady?.()
      }
    }

    if (heavy && !still) this.trackPerformance(now)
    this.lastTick = now
    if (anyAnimating) this.raf = requestAnimationFrame(this.tick)
  }

  /** Drop resolution if the device can't hold ~45fps with a large surface on screen. */
  private trackPerformance(now: number) {
    if (this.lastTick) this.frameTimes.push(now - this.lastTick)
    if (this.frameTimes.length < 90) return
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 16
    this.frameTimes.length = 0
    if (median > 22 && this.quality > 0.5) {
      this.quality = Math.max(0.5, this.quality * 0.8)
      this.targets.forEach((t) => this.measure(t, { width: t.cssW, height: t.cssH }))
    }
  }

  private draw(t: Target, time: number, now: number) {
    const { g } = this
    const gl = g.gl
    if (t.w > this.glW || t.h > this.glH) {
      this.glW = Math.max(this.glW, t.w)
      this.glH = Math.max(this.glH, t.h)
      this.canvas.width = this.glW
      this.canvas.height = this.glH
    }

    this.program.use()
    this.apply(t, time)
    g.bind(null, t.w, t.h)
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(0, 0, t.w, t.h)
    g.draw()
    gl.disable(gl.SCISSOR_TEST)

    // WebGL's origin is bottom-left; our viewport lives in the canvas' bottom rows.
    t.ctx.drawImage(this.canvas, 0, this.glH - t.h, t.w, t.h, 0, 0, t.w, t.h)
    if (t.mirrors.length && now - t.mirrored >= MIRROR_INTERVAL) {
      for (const m of t.mirrors) m.ctx.drawImage(t.canvas, 0, 0, m.canvas.width, m.canvas.height)
      t.mirrored = now
    }
  }

  private apply(t: Target, time: number) {
    const p = t.preset
    const u = this.program
    const c = t.colors
    u.u2f('uRes', t.w, t.h)
    u.u1f('uTime', time + t.seed * 17.0)
    u.u1f('uSeed', t.seed)
    u.u4f('uCrop', 0, 0, 1, 1)
    u.u1f('uAspect', t.cssW / Math.max(t.cssH, 1))
    u.u2f('uMouse', 0, 0)
    u.u3f('uZenith', ...c.zenith)
    u.u3f('uZenith2', ...c.zenith2)
    u.u3f('uSky', ...c.sky)
    u.u3f('uHaze', ...c.haze)
    u.u3f('uShade', ...c.shade)
    u.u3f('uLit', ...c.lit)
    u.u3f('uHi', ...c.hi)
    u.u3f('uBase', ...c.base)
    u.u3f('uSunCol', ...c.sun)
    u.u2f('uVanish', p.vanish[0], p.vanish[1])
    u.u1f('uStretch', p.stretch)
    u.u1f('uAngle', p.angle)
    u.u1f('uScale', p.scale)
    u.u1f('uCoverage', p.coverage)
    u.u1f('uSoftness', p.softness)
    u.u1f('uOpacity', p.opacity)
    u.u1f('uSpeed', p.speed)
    u.u1f('uPuff', p.puff)
    u.u1f('uWarp', p.warp)
    u.u1f('uBand', p.band)
    u.u2f('uFade', p.fade[0], p.fade[1])
    u.u2f('uFadeTop', p.fadeTop[0], p.fadeTop[1])
    u.u1f('uStars', p.stars)
    u.u3f('uSun', p.sun[0], p.sun[1], p.sun[2])
    u.u1f('uVignette', p.vignette)
    u.u1f('uGlow', p.glow)
    u.u1f('uCurve', p.curve)
    u.u1f('uPink', p.pink)
    u.u1f('uTopDim', p.topDim)
  }
}

let instance: AuroraEngine | null | undefined

export function getEngine(): AuroraEngine | null {
  if (instance !== undefined) return instance
  try {
    instance = new AuroraEngine()
  } catch (err) {
    console.warn('[aurora] WebGL unavailable, using CSS fallback.', err)
    instance = null
  }
  return instance
}

export type { AuroraEngine }
