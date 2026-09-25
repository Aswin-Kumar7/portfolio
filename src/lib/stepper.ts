import { ScrollTrigger } from './gsap'
import { glideTo, isGliding, isScrollLocked, setAnchorResolver, setWheelFilter } from './scroll'

/*
 * Section stepper — mouse / trackpad desktops only.
 *
 * The page rests on "stops": every section's screen, plus a few moments inside pinned
 * sections (the About paragraph lit, each Journey milestone…). One wheel gesture or key
 * press glides to the next stop, and the rest of that gesture (trackpad momentum) is
 * swallowed, so a flick is always exactly one step. Sections register their own stops;
 * scrollbar drags and nav glides pass through untouched. Touch devices scroll natively.
 */

const STEPPER_MQ = '(pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)'

type StopSource = () => number[]
const sources = new Set<StopSource>()

/** Register scroll positions the page should rest on. Returns an unregister function. */
export function addStops(source: StopSource) {
  sources.add(source)
  return () => void sources.delete(source)
}

/** Stops for a plain section: its top, and — if it's taller than the screen — its bottom too. */
export function sectionStops(el: Element) {
  const st = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom bottom' })
  const off = addStops(() => (st.end - st.start > window.innerHeight * 0.2 ? [st.start, st.end] : [st.start]))
  return () => {
    off()
    st.kill()
  }
}

/** Stops for a pinned timeline: where the pin starts and where it releases. */
export function pinStops(st: ScrollTrigger | undefined) {
  return addStops(() => (st ? [st.start, st.end] : []))
}

function stops() {
  const max = ScrollTrigger.maxScroll(window)
  const raw = [0, max, ...[...sources].flatMap((s) => s())]
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

function go(target: number | undefined) {
  if (target === undefined) return
  const distance = Math.abs(target - window.scrollY)
  const duration = Math.min(1.5, Math.max(0.95, 0.75 + distance / 2400))
  settling = false
  glideTo(target, duration, () => (settling = true))
}

function onWheel(deltaX: number, deltaY: number, event: WheelEvent | TouchEvent) {
  if (!enabled || event.type !== 'wheel' || (event as WheelEvent).ctrlKey || isScrollLocked()) return true
  if (Math.abs(deltaX) > Math.abs(deltaY)) return true
  if (event.cancelable) event.preventDefault()
  // when the input happened, not when we got to it: a slow frame (a shader compiling the first
  // time a section appears) must not split one flick's momentum into two "gestures"
  const now = event.timeStamp || performance.now()
  const gap = now - lastInput
  lastInput = now
  if (isGliding()) return false
  if (settling) {
    if (gap < 220) return false
    settling = false
  }
  if (Math.abs(deltaY) < 1) return false
  go(nextStop(deltaY > 0 ? 1 : -1))
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
