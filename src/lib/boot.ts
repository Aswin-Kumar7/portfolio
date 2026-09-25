import { EASE, gsap, prefersReducedMotion } from './gsap'

/*
 * The loader (markup and first-paint animation live inline in index.html, so it shows
 * before any JavaScript). Its counter follows real work: the app starting, the fonts,
 * and the black hole compiling, baking and drawing its first frame. When everything is
 * in, the icons lift away, a line of light draws across the screen and the hero opens from it.
 */

type Task = 'app' | 'fonts' | 'scene'

interface BootUI {
  el: HTMLElement
  /** Report overall progress, 0–1. The counter eases toward it. */
  set(value: number): void
  /** Resolves once the counter has reached 100. */
  full: Promise<void>
}

declare global {
  interface Window {
    __boot?: BootUI
  }
}

const weights: Record<Task, number> = { app: 0.12, fonts: 0.18, scene: 0.7 }
const values: Record<Task, number> = { app: 0, fonts: 0, scene: 0 }

let resolveBooted!: () => void
/** Resolves when the loader hands over: the hero's opening starts here. */
export const booted = new Promise<void>((resolve) => (resolveBooted = resolve))

let finishing = false

export function progress(task: Task, value: number) {
  values[task] = Math.max(values[task], Math.min(1, value))
  const total = (Object.keys(weights) as Task[]).reduce((sum, k) => sum + weights[k] * values[k], 0)
  window.__boot?.set(total)
  if (total > 0.999) void finish()
}

/** Called once from main: counts the app in, waits on the fonts, and caps the wait. */
export function startBoot() {
  const ui = window.__boot
  if (!ui || new URLSearchParams(location.search).has('skipintro')) {
    ui?.el.remove()
    resolveBooted()
    return
  }
  // the app counts as in once its sections have set up (see App)
  progress('app', 0.4)
  const fonts = Promise.all([
    document.fonts.load('400 1em "Instrument Serif"'),
    document.fonts.load('400 1em "Inter Variable"'),
  ]).catch(() => undefined)
  void Promise.race([fonts, wait(3000)]).then(() => progress('fonts', 1))
  // a slow GPU or network never holds the page hostage: the hero has a CSS stand-in
  window.setTimeout(() => (Object.keys(values) as Task[]).forEach((k) => progress(k, 1)), 6000)
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

async function finish() {
  const ui = window.__boot
  if (finishing || !ui) return
  finishing = true
  // kept short: long enough to register on a first visit, a blink once the session has seen it
  let seen = false
  try {
    seen = sessionStorage.getItem('booted') === '1'
    sessionStorage.setItem('booted', '1')
  } catch {
    // storage blocked: treat as a first visit
  }
  const minimum = (seen ? 300 : 800) - performance.now()
  await Promise.all([ui.full, wait(Math.max(0, minimum))])

  const q = (s: string) => ui.el.querySelectorAll(s)
  if (prefersReducedMotion()) {
    resolveBooted()
    gsap.to(ui.el, { autoAlpha: 0, duration: 0.5, ease: 'power1.out', onComplete: () => ui.el.remove() })
    return
  }

  // the icons and counter lift away, a slit of light draws across, and the hero's letterbox opens from it
  gsap
    .timeline({ onComplete: () => ui.el.remove() })
    // (the row, not the icons: their CSS wave animation would override inline styles)
    .to(q('.bt-icons, .bt-meta'), { autoAlpha: 0, y: -8, duration: 0.4, ease: 'power2.in', stagger: 0.05 }, 0)
    .fromTo(q('.bt-slit'), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: EASE.cine }, 0.15)
    .call(resolveBooted, [], 0.6)
    .to(q('.bt-bg'), { autoAlpha: 0, duration: 0.5, ease: 'power1.inOut' }, 0.6)
    .to(q('.bt-slit'), { autoAlpha: 0, scaleY: 6, duration: 0.8, ease: 'power2.out' }, 0.75)
}
