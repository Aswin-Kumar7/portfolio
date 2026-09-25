import { trackingOff } from './consent'

/*
 * The page's side of the visit alerts (api/visit.js and server/visits.js have the rest). The
 * server already logs every request, bots included; this adds what only a running page knows:
 * screen, clock, whether a real person moved the mouse, tapped or typed, time on the page, how
 * far they scrolled and what they clicked. Vercel BotID vouches for the browser on the way.
 *
 * A visit lasts while this browser keeps showing up within half an hour: reloads, other tabs and
 * coming straight back all stay on the same alert. New or returning comes from a random id this
 * browser keeps; the privacy note shows it, so a visitor can ask for their visits to be deleted.
 * ?notrack turns all of it off (src/lib/consent.ts).
 */

const ENDPOINT = '/api/visit'
const KEY = 'visit'
/** a visit ends after this long without a sign of life (as on the server) */
const IDLE = 30 * 60_000

interface Visitor {
  id: string
  visits: number
  first: number
  last: number
}

interface Visit {
  started: number
  /** its last sign of life */
  last: number
  /** from the server: lets this visit, and only this one, update its alert */
  token?: string
  data: Record<string, unknown>
  /** visible time banked so far, across its tabs, in ms */
  active: number
  /** seconds in the last update sent, so an unchanged one isn't sent again */
  sent: number
  depth: number
  actions: string[]
  loads: number
  /** a real mouse move, tap or key press has happened (synthetic events don't count) */
  input: boolean
}

// storage can be blocked outright (the getter throws) or full: alerts just carry on without it
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // blocked or full
  }
}

/** this page's copy; storage holds the one its tabs share */
let visit: Visit | null = null
/** when the current visible stretch began (0 while hidden) */
let since = 0
let opening = false
let guarded = false

/** Applies a change on top of whatever this visit's other tabs have saved since. */
function change(fn: (v: Visit) => void) {
  if (!visit) return
  const stored = read<Visit>(KEY)
  const v = stored?.started === visit.started ? stored : visit
  fn(v)
  v.last = Date.now()
  visit = v
  write(KEY, v)
}

/** Starts (or resumes) this visit's alert. Returns a cleanup. */
export function startVisits() {
  if (trackingOff()) return () => {}
  const stored = read<Visit>(KEY)
  if (stored?.data && Date.now() - stored.last < IDLE) {
    visit = stored
    change((v) => v.loads++)
  } else visit = begin()
  void open()
  since = document.hidden ? 0 : performance.now()

  const onVisibility = () => {
    if (!document.hidden) {
      since = performance.now()
      return
    }
    pause()
    update()
  }
  const onLeave = () => {
    pause()
    update()
  }
  // back from the back/forward cache: the clock picks up again
  const onReturn = (e: PageTransitionEvent) => {
    if (e.persisted && !document.hidden) since = performance.now()
  }
  // a sign of life while the tab stays open, so a long read doesn't end the visit
  const alive = window.setInterval(() => {
    if (!document.hidden) change(() => {})
  }, 5 * 60_000)
  const stopWatching = watchInput()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onLeave)
  window.addEventListener('pageshow', onReturn)
  return () => {
    stopWatching()
    window.clearInterval(alive)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onLeave)
    window.removeEventListener('pageshow', onReturn)
  }
}

/** The first real input (not a synthetic event) marks the visit as a person's, straight away. */
function watchInput() {
  const events = ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'keydown']
  const stop = () => events.forEach((t) => window.removeEventListener(t, onInput, true))
  function onInput(e: Event) {
    if (!e.isTrusted) return
    stop()
    if (visit?.input) return
    change((v) => (v.input = true))
    update(true)
  }
  if (!visit?.input) events.forEach((t) => window.addEventListener(t, onInput, { capture: true, passive: true }))
  return stop
}

/** Makes the server's id this browser's, here and in the visit already under way. */
function adoptId(id: string) {
  const prev = read<Visitor>('visitor')
  if (prev && prev.id !== id) write('visitor', { ...prev, id })
  change((v) => {
    const visitor = v.data.visitor as Record<string, unknown> | undefined
    if (visitor) visitor.id = id
  })
}

/** This browser's visitor id, as the alerts show it ("visitor 1a2b3c4d"), or '' if it has none. */
export function visitorId() {
  const id = read<Visitor>('visitor')?.id
  return typeof id === 'string' && /^[\w-]{4,40}$/.test(id) ? id : ''
}

/** Feeds the visit's scroll depth and clicks from the site's analytics events. */
export function noteVisit(event: string, props: Record<string, string | number | boolean>) {
  if (!visit || trackingOff() || event === 'engaged_time') return
  if (event === 'scroll_depth') {
    const depth = Number(props.percent) || 0
    change((v) => (v.depth = Math.max(v.depth, depth)))
    return
  }
  const action = props.label ? `${event}:${props.label}` : event
  change((v) => {
    if (!v.actions.includes(action) && v.actions.length < 20) v.actions.push(action)
  })
}

function begin(): Visit {
  const now = Date.now()
  const prev = read<Visitor>('visitor')
  const visitor: Visitor = {
    id: prev?.id ?? (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8),
    visits: (prev?.visits ?? 0) + 1,
    first: prev?.first ?? now,
    last: now,
  }
  write('visitor', visitor)

  let referrer = ''
  try {
    if (document.referrer && new URL(document.referrer).origin !== location.origin) referrer = document.referrer
  } catch {
    // not a URL
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const v: Visit = {
    started: now,
    last: now,
    data: {
      visitor: { id: visitor.id, visits: visitor.visits, first: visitor.first, previous: prev?.last ?? 0 },
      page: location.pathname + location.search,
      referrer,
      screen: [screen.width, screen.height, window.devicePixelRatio],
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touch: navigator.maxTouchPoints,
      cores: navigator.hardwareConcurrency,
      memory: nav.deviceMemory,
      brave: 'brave' in navigator,
      // reported, not hidden: the alert says a bot is a bot
      webdriver: navigator.webdriver === true,
    },
    active: 0,
    sent: -1,
    depth: 0,
    actions: [],
    loads: 1,
    input: false,
  }
  write(KEY, v)
  return v
}

/** Tells the server the page has run (each load, so it can count them), and keeps the token it hands back. */
async function open() {
  if (!visit || opening) return
  opening = true
  try {
    const ch = visit.data.ch ?? (await hints())
    change((v) => (v.data.ch = ch))
    await protect()
    const body = JSON.stringify({ ...visit.data, type: 'start' })
    // (BotID fetches its challenge first: never wait on it forever)
    const res = await Promise.race([
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true }),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 15_000)),
    ])
    if (!res?.ok) return
    const out = (await res.json()) as { token?: unknown; id?: unknown }
    if (typeof out.token !== 'string') return
    const token = out.token
    change((v) => (v.token = token))
    // the server keeps this browser's id (a cookie that outlives cleared storage): adopt it
    if (typeof out.id === 'string' && /^[\w-]{4,40}$/.test(out.id)) adoptId(out.id)
    // anything that happened before the token arrived (input, a hidden tab) goes up now
    if (visit.input || document.hidden) update(true)
  } catch {
    // offline or blocked: this load goes unreported
  } finally {
    opening = false
  }
}

/** Vercel BotID: runs its invisible challenge and vouches for this browser on the alert's requests. */
async function protect() {
  if (guarded) return
  const { initBotId } = await import('botid/client/core')
  initBotId({ protect: [{ path: ENDPOINT, method: 'POST' }] })
  guarded = true
}

/** Chromium's client hints: the real Windows/macOS/Android version and the phone model. */
async function hints() {
  type UAData = { getHighEntropyValues(keys: string[]): Promise<Record<string, unknown>> }
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
  if (!data) return undefined
  try {
    const v = await Promise.race([
      data.getHighEntropyValues(['model', 'platformVersion']),
      new Promise<undefined>((resolve) => window.setTimeout(resolve, 500)),
    ])
    return v && { model: v.model, platformVersion: v.platformVersion, mobile: v.mobile }
  } catch {
    return undefined
  }
}

/** Banks the visible stretch that just ended. */
function pause() {
  if (!visit || !since) return
  const stretch = performance.now() - since
  since = 0
  change((v) => (v.active += stretch))
}

/** Updates the visit's alert with its time, depth, clicks and input so far. */
function update(force = false) {
  if (!visit?.token || trackingOff()) return
  const seconds = Math.round(visit.active / 1000)
  if (seconds === visit.sent && !force) return
  change((v) => (v.sent = seconds))
  const v = visit
  const body = JSON.stringify({ type: 'update', token: v.token, seconds, depth: v.depth, actions: v.actions, loads: v.loads, input: v.input })
  // a beacon survives the page closing; keepalive fetch where beacons aren't available
  if (!navigator.sendBeacon?.(ENDPOINT, body)) void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => undefined)
}
