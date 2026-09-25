import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { gsap, ScrollTrigger, prefersReducedMotion } from './gsap'

let lenis: Lenis | null = null

type WheelFilter = (deltaX: number, deltaY: number, event: WheelEvent | TouchEvent) => boolean
let wheelFilter: WheelFilter | null = null
/** Let the section stepper see wheel input first; returning `false` means it handled it. */
export const setWheelFilter = (fn: WheelFilter | null) => {
  wheelFilter = fn
}

let anchorResolver: ((top: number) => number) | null = null
/** Map an anchor's top edge to where the page should actually rest (the stepper's stops). */
export const setAnchorResolver = (fn: ((top: number) => number) | null) => {
  anchorResolver = fn
}

/** True while scrolling is held (the intro, the mobile menu). */
export const isScrollLocked = () => !!lenis?.isStopped

/** Where the page is heading (Lenis's target), falling back to where it is. */
export const wheelTarget = () => lenis?.targetScroll ?? window.scrollY

/**
 * Scroll exactly as a wheel tick would — same smoothing — but to a position we chose.
 * Trackpad input is already smooth, so it passes a lighter `lerp` (less lag behind the fingers).
 */
export function wheelTo(y: number, lerp?: number) {
  if (!lenis) return window.scrollTo(0, y)
  const { duration, easing } = lenis.options
  lenis.scrollTo(y, { programmatic: false, lerp: lerp ?? lenis.options.lerp, duration, easing })
}

const expoInOut = (t: number) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2

/**
 * Lenis gives the page its slow, weighted glide. It is driven by GSAP's ticker
 * so ScrollTrigger, Lenis and every scrubbed timeline advance in the same frame.
 */
export function initSmoothScroll() {
  if (lenis || prefersReducedMotion()) return () => {}
  lenis = new Lenis({
    lerp: 0.075,
    wheelMultiplier: 0.85,
    smoothWheel: true,
    syncTouch: false,
    virtualScroll: ({ deltaX, deltaY, event }) => wheelFilter?.(deltaX, deltaY, event) ?? true,
  })
  lenis.on('scroll', ScrollTrigger.update)
  const raf = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)
  return () => {
    gsap.ticker.remove(raf)
    lenis?.destroy()
    lenis = null
  }
}

let gliding = false
let dragging = false
let guard: gsap.core.Tween | null = null

/**
 * True while the page is being scrolled programmatically (anchor glides, steppers) or by
 * dragging the custom scrollbar — scroll-driven steppers should stay passive meanwhile.
 */
export const isGliding = () => gliding || dragging

export const setDragging = (on: boolean) => {
  dragging = on
}

/**
 * Follow a scrollbar drag 1:1, like a native bar: when the pointer lets go the page is already
 * where the thumb is, so nothing is still easing in when steppers wake back up.
 */
export function followTo(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true })
  else window.scrollTo(0, y)
}

// Lenis never calls onComplete when a glide is interrupted (a wheel mid-glide, an immediate
// jump), so the flag also clears itself shortly after the glide should have ended
function startGlide(duration: number, onDone?: () => void) {
  gliding = true
  guard?.kill()
  guard = gsap.delayedCall(duration + 0.35, () => {
    gliding = false
    onDone?.()
  })
  return () => {
    guard?.kill()
    gliding = false
    onDone?.()
  }
}

export function scrollToTarget(target: HTMLElement | number, duration = 2) {
  if (lenis) {
    lenis.scrollTo(target, { duration, easing: expoInOut, onComplete: startGlide(duration) })
    return
  }
  const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Glide to an exact scroll position and hold user input until it arrives —
 * used by the Journey stepper so one wheel gesture = one milestone.
 */
export function glideTo(y: number, duration = 0.9, onComplete?: () => void) {
  if (!lenis) {
    window.scrollTo({ top: y })
    onComplete?.()
    return
  }
  lenis.scrollTo(y, { duration, easing: easeInOutCubic, lock: true, force: true, onComplete: startGlide(duration, onComplete) })
}

export function lockScroll(locked: boolean) {
  if (!lenis) return
  if (locked) lenis.stop()
  else lenis.start()
}

/**
 * Where a section starts in the document. Measured through ScrollTrigger so pin spacing counts
 * (a pinned section's live rect sits at the top of the screen), then snapped to a stop.
 */
function anchorTop(el: HTMLElement) {
  const probe = ScrollTrigger.create({ trigger: el, start: 'top top' })
  const top = probe.start
  probe.kill()
  return anchorResolver ? anchorResolver(top) : top
}

/** Route in-page anchor clicks through Lenis so they glide instead of jumping. */
export function interceptAnchors() {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]')
    if (!link) return
    const id = link.getAttribute('href')!.slice(1)
    if (!id) return
    e.preventDefault()
    if (id === 'home') return scrollToTarget(0)
    const el = document.getElementById(id)
    if (el) scrollToTarget(anchorTop(el))
    // the URL stays clean (no #section): a reload starts at the top, like any fresh visit
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
