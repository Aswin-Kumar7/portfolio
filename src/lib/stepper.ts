import { ScrollTrigger } from './gsap'
import { glideTo, isGliding, isScrollLocked, setAnchorResolver, setWheelFilter, wheelTarget, wheelTo } from './scroll'

/*
 * Section stepper — mouse / trackpad desktops only.
 *
 * Two kinds of places on the page:
 *  - stops: a section's screen. One flick glides (slowly, so its reveal is seen) to the
 *    next stop; the rest of that flick's momentum is swallowed, so a flick is one step.
 *    Trackpads are told apart from wheels and tuned for their own input (see below).
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
  // from where the page is heading, not where it is: a range still easing to its end isn't a stop away
  const y = wheelTarget()
  const list = stops()
  return dir > 0 ? list.find((s) => s > y + 6) : list.findLast((s) => s < y - 6)
}

let enabled = false
let lastInput = 0
/** This gesture ran a free range to its end: it may not also carry the page out of it. */
let edgeHold = false
/** A short hush after every landing (by the clock): input queued behind a slow frame can't double-step. */
let quietUntil = 0
/** A trackpad swipe made during a glide: taken as soon as the glide lands. */
let queued: 1 | -1 | 0 = 0

/*
 * Mouse wheels and trackpads send very different input. A wheel sends a few big notches
 * (~100px each, or lines); a trackpad sends a dense stream of small deltas, then keeps
 * streaming momentum for a second or more after the fingers lift. Trackpad gestures get:
 * a little intent before they step (a resting finger doesn't jump a section), more travel
 * and less smoothing in the free ranges (the fingers drive them directly), quicker glides,
 * and a new swipe told apart from momentum by its rise, so it can queue the next step.
 */
/** px of swipe before a trackpad gesture counts as a step. */
const PAD_INTENT = 36
/** Free ranges move this much further per trackpad pixel than per wheel pixel. */
const PAD_GAIN = 2.4
/** Smoothing for trackpad scrolling in free ranges (a wheel's is 0.075): the input is already smooth. */
const PAD_LERP = 0.18

interface Gesture {
  pad: boolean
  dir: 1 | -1 | 0
  /** swipe distance so far (raw px), for the intent threshold */
  travel: number
  /** the largest delta so far, and the last few: momentum only ever fades from its peak */
  peak: number
  recent: number[]
  /** this gesture already moved the page a step (or queued one): the rest of it is momentum */
  consumed: boolean
}

const fresh = (): Gesture => ({ pad: false, dir: 0, travel: 0, peak: 0, recent: [], consumed: false })
let gesture = fresh()

/** Fine-grained pixel deltas are a trackpad (or a free-spinning hi-res wheel, which behaves like one). */
function isPad(e: WheelEvent) {
  if (e.deltaMode !== 0) return false
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
  if (legacy && legacy === -3 * e.deltaY) return true // Chrome and Safari on macOS trackpads
  return Math.abs(e.deltaY) < 50
}

/** Momentum fades; a fresh swipe rises again from a faded stream, or turns around. */
function isNewSwipe(mag: number, dir: 1 | -1) {
  if (!gesture.pad || !gesture.dir) return false
  if (dir !== gesture.dir) return true
  const { recent, peak } = gesture
  if (recent.length < 3) return false
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length
  return avg < peak * 0.5 && mag > avg * 2 && mag > 6
}

function go(target: number | undefined, pad = false) {
  if (target === undefined) return
  // unhurried for a wheel: a screen takes ~1.5s, so each section's arrival is actually seen;
  // quicker for a trackpad, whose swipes come faster and whose momentum is already in motion
  const distance = Math.abs(target - window.scrollY)
  const duration = pad ? Math.min(1.35, Math.max(0.9, 0.7 + distance / 2000)) : Math.min(2.2, Math.max(1.3, 0.95 + distance / 1600))
  queued = 0
  glideTo(target, duration, () => {
    quietUntil = performance.now() + (pad ? 120 : 350)
    if (queued) {
      const dir = queued
      queued = 0
      go(nextStop(dir), true)
    }
  })
}

function onWheel(deltaX: number, deltaY: number, event: WheelEvent | TouchEvent) {
  if (!enabled || event.type !== 'wheel' || (event as WheelEvent).ctrlKey || isScrollLocked()) return true
  if (Math.abs(deltaX) > Math.abs(deltaY)) return true
  if ((event.target as Element | null)?.closest?.('[data-lenis-prevent], [data-lenis-prevent-wheel]')) return true
  if (event.cancelable) event.preventDefault()
  const e = event as WheelEvent
  // when the input happened, not when we got to it: a slow frame (a shader compiling the first
  // time a section appears) must not split one flick's momentum into two "gestures"
  const now = e.timeStamp || performance.now()
  const gap = now - lastInput
  lastInput = now
  const mag = Math.abs(e.deltaY)
  if (mag < 0.5) return false
  const dir = deltaY > 0 ? 1 : -1

  // one gesture = one intent: it ends at a pause, or (trackpads) when a new swipe starts
  if (gap >= GESTURE_GAP || isNewSwipe(mag, dir)) {
    gesture = fresh()
    edgeHold = false
  }
  gesture.pad ||= isPad(e)
  gesture.dir = dir
  gesture.peak = Math.max(gesture.peak, mag)
  gesture.recent = [...gesture.recent.slice(-2), mag]
  if (gesture.pad) gesture.travel += mag

  if (isGliding() || performance.now() < quietUntil) {
    // a fresh trackpad swipe mid-glide isn't lost: it's the next step, taken on landing
    if (gesture.pad && !gesture.consumed && gesture.travel >= PAD_INTENT) {
      queued = dir
      gesture.consumed = true
    }
    // a wheel gesture that overlaps a glide is spent, as before: the next step takes a fresh flick
    if (!gesture.pad) gesture.consumed = true
    return false
  }
  if (gesture.consumed) return false

  // inside a scroll-driven story: scroll it like a normal page, clamped to its ends
  const at = wheelTarget()
  const range = ranges().find(([a, b]) => at >= a - 2 && at <= b + 2)
  if (range) {
    const [a, b] = range
    if (dir > 0 ? at < b - 1 : at > a + 1) {
      const target = at + (gesture.pad ? deltaY * PAD_GAIN : deltaY)
      const clamped = Math.min(b, Math.max(a, target))
      if (clamped !== target) edgeHold = true
      wheelTo(clamped, gesture.pad ? PAD_LERP : undefined)
      return false
    }
    if (edgeHold) return false
  }
  // a trackpad needs a little intent first; a wheel notch is intent enough
  if (gesture.pad && gesture.travel < PAD_INTENT) return false
  gesture.consumed = true
  go(nextStop(dir), gesture.pad)
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
    gesture = fresh()
    edgeHold = false
    queued = 0
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
