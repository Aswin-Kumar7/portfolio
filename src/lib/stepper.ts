import { ScrollTrigger } from './gsap'
import { glideTo, isGliding, isScrollLocked, setAnchorResolver, setWheelFilter, wheelTarget, wheelTo } from './scroll'

/*
 * Section stepper — mouse / trackpad desktops only.
 *
 * Two kinds of places on the page:
 *  - stops: a section's screen. One flick glides (slowly, so its reveal is seen) to the
 *    next stop; the rest of that flick's momentum is swallowed, so a flick is one step.
 *  - free ranges: scroll-driven stories (the hero's camera dive, About's words lighting
 *    up, the projects gallery). Inside one the wheel scrolls normally and drives the
 *    animation; the page snaps only at its ends, and leaving takes a fresh flick.
 *
 * Sections register their own stops and ranges. Scrollbar drags and nav glides pass
 * through untouched. Touch devices scroll natively.
 */

const STEPPER_MQ = '(pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)'
/** Input closer together than this belongs to the same gesture (incl. trackpad momentum). */
const GESTURE_GAP = 220

type Range = [number, number]
const stopSources = new Set<() => number[]>()
const rangeSources = new Set<() => Range | null>()

/** Register scroll positions the page should rest on. Returns an unregister function. */
function addStops(source: () => number[]) {
  stopSources.add(source)
  return () => void stopSources.delete(source)
}

/** A plain section: rest on its top — and on its bottom too, if it's taller than the screen. */
export function sectionStops(el: Element) {
  const st = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom bottom' })
  const off = addStops(() => (st.end - st.start > window.innerHeight * 0.2 ? [st.start, st.end] : [st.start]))
  return () => {
    off()
    st.kill()
  }
}

/** A pinned, scrubbed story: the wheel drives it freely between the pin's start and end. */
export function pinRange(st: ScrollTrigger | undefined) {
  const source = () => (st ? ([st.start, st.end] as Range) : null)
  rangeSources.add(source)
  return () => void rangeSources.delete(source)
}

function ranges() {
  return [...rangeSources].map((s) => s()).filter((r): r is Range => !!r && r[1] - r[0] > 8)
}

function stops() {
  const max = ScrollTrigger.maxScroll(window)
  const raw = [0, max, ...[...stopSources].flatMap((s) => s()), ...ranges().flat()]
    .map((v) => Math.round(Math.min(max, Math.max(0, v))))
    .sort((a, b) => a - b)
  // stops closer than a few pixels are the same place
  const out: number[] = []
  for (const v of raw) if (!out.length || v - out[out.length - 1]! > 24) out.push(v)
  return out
}

function nextStop(dir: 1 | -1) {
  const y = window.scrollY
  const list = stops()
  return dir > 0 ? list.find((s) => s > y + 6) : list.findLast((s) => s < y - 6)
}

let enabled = false
let lastInput = 0
/** After a glide the gesture's momentum keeps arriving; wait for a pause before the next step. */
let settling = false
/** This gesture ran a free range to its end: it may not also carry the page out of it. */
let edgeHold = false
/** A short hush after every landing (by the clock): input queued behind a slow frame can't double-step. */
let quietUntil = 0

function go(target: number | undefined) {
  if (target === undefined) return
  // unhurried: a screen takes ~1.5s, so each section's arrival is actually seen
  const distance = Math.abs(target - window.scrollY)
  const duration = Math.min(2.2, Math.max(1.3, 0.95 + distance / 1600))
  settling = false
  glideTo(target, duration, () => {
    settling = true
    quietUntil = performance.now() + 350
  })
}

function onWheel(deltaX: number, deltaY: number, event: WheelEvent | TouchEvent) {
  if (!enabled || event.type !== 'wheel' || (event as WheelEvent).ctrlKey || isScrollLocked()) return true
  if (Math.abs(deltaX) > Math.abs(deltaY)) return true
  if ((event.target as Element | null)?.closest?.('[data-lenis-prevent], [data-lenis-prevent-wheel]')) return true
  if (event.cancelable) event.preventDefault()
  // when the input happened, not when we got to it: a slow frame (a shader compiling the first
  // time a section appears) must not split one flick's momentum into two "gestures"
  const now = event.timeStamp || performance.now()
  const gap = now - lastInput
  lastInput = now
  if (gap >= GESTURE_GAP) edgeHold = false
  if (isGliding() || performance.now() < quietUntil) return false
  if (settling) {
    if (gap < GESTURE_GAP) return false
    settling = false
  }
  if (Math.abs(deltaY) < 1) return false
  const dir = deltaY > 0 ? 1 : -1

  // inside a scroll-driven story: scroll it like a normal page, clamped to its ends
  const at = wheelTarget()
  const range = ranges().find(([a, b]) => at >= a - 2 && at <= b + 2)
  if (range) {
    const [a, b] = range
    if (dir > 0 ? at < b - 1 : at > a + 1) {
      const target = at + deltaY
      const clamped = Math.min(b, Math.max(a, target))
      if (clamped !== target) edgeHold = true
      wheelTo(clamped)
      return false
    }
    if (edgeHold) return false
  }
  go(nextStop(dir))
  return false
}

function onKey(e: KeyboardEvent) {
  if (!enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isScrollLocked()) return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  let dir: 1 | -1 | 0 = 0
  let jump: number | undefined
  switch (e.key) {
    case 'ArrowDown':
    case 'PageDown':
      dir = 1
      break
    case 'ArrowUp':
    case 'PageUp':
      dir = -1
      break
    case ' ':
      // space still presses a focused button / link
      if (target?.closest('a, button')) return
      dir = e.shiftKey ? -1 : 1
      break
    case 'Home':
      jump = 0
      break
    case 'End':
      jump = ScrollTrigger.maxScroll(window)
      break
    default:
      return
  }
  e.preventDefault()
  if (isGliding()) return
  go(jump ?? nextStop(dir as 1 | -1))
}

/** Nav links land on a section's first stop rather than its raw top edge. */
function resolveAnchor(top: number) {
  if (!enabled) return top
  return stops().find((s) => s >= top - 8) ?? top
}

export function initStepper() {
  const mq = window.matchMedia(STEPPER_MQ)
  const sync = () => {
    enabled = mq.matches
    settling = false
    edgeHold = false
  }
  sync()
  mq.addEventListener('change', sync)
  setWheelFilter(onWheel)
  setAnchorResolver(resolveAnchor)
  window.addEventListener('keydown', onKey)
  return () => {
    enabled = false
    mq.removeEventListener('change', sync)
    setWheelFilter(null)
    setAnchorResolver(null)
    window.removeEventListener('keydown', onKey)
  }
}
