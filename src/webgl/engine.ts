import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type IUniform,
} from 'three'
import { fragmentShader, vertexShader } from './shader'
import type { AuroraPreset } from './presets'

/**
 * One WebGL context for the whole page.
 *
 * Every <Aurora> surface (hero sky, cards, project covers…) registers a plain
 * 2D canvas. Each frame the shared three.js renderer draws the scene for every
 * *visible* target into a scratch viewport and blits it into that target's
 * canvas. This sidesteps per-page context limits (mobile Safari caps them low),
 * keeps shader compilation to a single program, and lets off-screen surfaces
 * cost nothing.
 */

interface AttachOptions {
  preset: AuroraPreset
  seed?: number
  interactive?: boolean
  /** Canvases that receive a downscaled copy of every frame (e.g. a blurred backdrop). */
  mirrors?: HTMLCanvasElement[]
  onReady?: () => void
}

interface Target {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  preset: AuroraPreset
  seed: number
  interactive: boolean
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
  mouse: Vector2
}

const hex = (value: string) => {
  const n = Number.parseInt(value.replace('#', ''), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const MAX_SIDE = 1800

class AuroraEngine {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private uniforms: Record<string, IUniform>
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
  private pointer = new Vector2()
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private coarse = window.matchMedia('(pointer: coarse)').matches

  constructor() {
    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(1, 1, false)

    this.uniforms = {
      uRes: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uCrop: { value: new Vector4(0, 0, 1, 1) },
      uAspect: { value: 1 },
      uMouse: { value: new Vector2() },
      uZenith: { value: new Vector3() },
      uZenith2: { value: new Vector3() },
      uSky: { value: new Vector3() },
      uHaze: { value: new Vector3() },
      uShade: { value: new Vector3() },
      uLit: { value: new Vector3() },
      uHi: { value: new Vector3() },
      uBase: { value: new Vector3() },
      uSunCol: { value: new Vector3() },
      uVanish: { value: new Vector2() },
      uStretch: { value: 1 },
      uAngle: { value: 0 },
      uScale: { value: 1 },
      uCoverage: { value: 0.5 },
      uSoftness: { value: 0.2 },
      uOpacity: { value: 1 },
      uSpeed: { value: 0 },
      uPuff: { value: 0 },
      uWarp: { value: 1 },
      uBand: { value: 1 },
      uFade: { value: new Vector2() },
      uFadeTop: { value: new Vector2(2, 3) },
      uStars: { value: 0 },
      uSun: { value: new Vector3() },
      uVignette: { value: 0 },
      uGlow: { value: 0 },
      uCurve: { value: 0 },
      uPink: { value: 0 },
      uTopDim: { value: 0.45 },
    }

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    })
    const quad = new Mesh(new PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    this.scene.add(quad)
    this.renderer.compile(this.scene, this.camera)

    this.io = new IntersectionObserver(this.onIntersect, { rootMargin: '120px 0px' })
    this.ro = new ResizeObserver(this.onResize)

    const el = this.renderer.domElement
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    el.addEventListener('webglcontextrestored', () => {
      this.lost = false
      this.targets.forEach((t) => (t.dirty = true))
      this.ensureLoop()
    })

    window.addEventListener('pointermove', this.onPointer, { passive: true })
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
    const target: Target = {
      canvas,
      ctx,
      preset: opts.preset,
      seed: opts.seed ?? 0,
      interactive: !!opts.interactive,
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
      mouse: new Vector2(),
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

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
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
      this.draw(t, time)
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

  /** Drop resolution if the device can't hold ~45fps with the hero on screen. */
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

  private draw(t: Target, time: number) {
    if (t.w > this.glW || t.h > this.glH) {
      this.glW = Math.max(this.glW, t.w)
      this.glH = Math.max(this.glH, t.h)
      this.renderer.setSize(this.glW, this.glH, false)
    }

    if (t.interactive) t.mouse.lerp(this.pointer, 0.04)
    this.apply(t, time)

    this.renderer.setViewport(0, 0, t.w, t.h)
    this.renderer.setScissor(0, 0, t.w, t.h)
    this.renderer.setScissorTest(true)
    this.renderer.render(this.scene, this.camera)

    // WebGL's origin is bottom-left; our viewport lives in the canvas' bottom rows.
    t.ctx.drawImage(this.renderer.domElement, 0, this.glH - t.h, t.w, t.h, 0, 0, t.w, t.h)
    for (const m of t.mirrors) m.ctx.drawImage(t.canvas, 0, 0, m.canvas.width, m.canvas.height)
  }

  private apply(t: Target, time: number) {
    const p = t.preset
    const u = this.uniforms
    const c = p.colors
    ;(u.uRes!.value as Vector2).set(t.w, t.h)
    u.uTime!.value = time + t.seed * 17.0
    u.uSeed!.value = t.seed
    u.uAspect!.value = t.cssW / Math.max(t.cssH, 1)
    ;(u.uMouse!.value as Vector2).copy(t.mouse)
    ;(u.uZenith!.value as Vector3).copy(hexCache(c.zenith))
    ;(u.uZenith2!.value as Vector3).copy(hexCache(c.zenith2))
    ;(u.uSky!.value as Vector3).copy(hexCache(c.sky))
    ;(u.uHaze!.value as Vector3).copy(hexCache(c.haze))
    ;(u.uShade!.value as Vector3).copy(hexCache(c.shade))
    ;(u.uLit!.value as Vector3).copy(hexCache(c.lit))
    ;(u.uHi!.value as Vector3).copy(hexCache(c.hi))
    ;(u.uBase!.value as Vector3).copy(hexCache(c.base))
    ;(u.uSunCol!.value as Vector3).copy(hexCache(c.sun))
    ;(u.uVanish!.value as Vector2).set(p.vanish[0], p.vanish[1])
    u.uStretch!.value = p.stretch
    u.uAngle!.value = p.angle
    u.uScale!.value = p.scale
    u.uCoverage!.value = p.coverage
    u.uSoftness!.value = p.softness
    u.uOpacity!.value = p.opacity
    u.uSpeed!.value = p.speed
    u.uPuff!.value = p.puff
    u.uWarp!.value = p.warp
    u.uBand!.value = p.band
    ;(u.uFade!.value as Vector2).set(p.fade[0], p.fade[1])
    ;(u.uFadeTop!.value as Vector2).set(p.fadeTop[0], p.fadeTop[1])
    u.uStars!.value = p.stars
    ;(u.uSun!.value as Vector3).set(p.sun[0], p.sun[1], p.sun[2])
    u.uVignette!.value = p.vignette
    u.uGlow!.value = p.glow
    u.uCurve!.value = p.curve
    u.uPink!.value = p.pink
    u.uTopDim!.value = p.topDim
  }
}

const cache = new Map<string, Vector3>()
function hexCache(value: string) {
  let v = cache.get(value)
  if (!v) {
    v = hex(value)
    cache.set(value, v)
  }
  return v
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
