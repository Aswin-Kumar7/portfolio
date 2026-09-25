import { trackingOff } from './consent'

/*
 * Visit alerts. Each visit posts one message to a private Discord channel through
 * api/visit.js, which keeps the webhook secret and adds the IP and location. Whenever the
 * visitor hides or leaves the tab, the message is edited with the time they've spent on the
 * page, how far they scrolled and what they clicked.
 *
 * A visit lasts while this browser keeps showing up within half an hour: reloads, other tabs
 * and coming straight back all stay on the same message (the server also recognises a browser
 * that lost its storage). New or returning comes from a random id this browser keeps. Vercel
 * BotID vouches for the browser before its first alert. The privacy note's switch, or
 * ?notrack, turns all of it off (src/lib/consent.ts).
 */

const ENDPOINT = '/api/visit'
const KEY = 'visit'
/** a visit ends after this long without a sign of life (as in api/visit.js) */
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
  /** the Discord message, and the signature that lets this visit edit it */
  id?: string
  sig?: string
  /** the server summarised it instead (a busy spell): no alert of its own to edit */
  quiet?: boolean
  data: Record<string, unknown>
  /** visible time banked so far, across its tabs, in ms */
  active: number
  /** seconds in the last update sent, so an unchanged one isn't sent again */
  sent: number
  depth: number
  actions: string[]
  loads: number
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
  if (trackingOff() || navigator.webdriver) return () => {}
  const stored = read<Visit>(KEY)
  if (stored?.data && Date.now() - stored.last < IDLE) {
    visit = stored
    change((v) => v.loads++)
  } else visit = begin()
  if (!visit.id && !visit.quiet) void open()
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
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onLeave)
  window.addEventListener('pageshow', onReturn)
  return () => {
    window.clearInterval(alive)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onLeave)
    window.removeEventListener('pageshow', onReturn)
  }
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
      started: now,
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
    },
    active: 0,
    sent: -1,
    depth: 0,
    actions: [],
    loads: 1,
  }
  write(KEY, v)
  return v
}

/** Posts the visit's first alert and keeps the handle that edits it. */
async function open() {
  if (!visit || opening) return
  opening = true
  try {
    const ch = visit.data.ch ?? (await hints())
    change((v) => (v.data.ch = ch))
    await protect()
    const body = JSON.stringify({ ...visit.data, type: 'start', loads: visit.loads })
    // (BotID fetches its challenge first: never wait on it forever)
    const res = await Promise.race([
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true }),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 15_000)),
    ])
    if (!res?.ok) return
    if (res.status === 202) return change((v) => (v.quiet = true))
    const out = (await res.json()) as { id?: unknown; sig?: unknown; loads?: unknown }
    if (typeof out.id !== 'string' || typeof out.sig !== 'string') return
    const { id, sig } = out
    const loads = typeof out.loads === 'number' ? out.loads : 1
    change((v) => {
      v.id = id
      v.sig = sig
      v.loads = Math.max(v.loads, loads)
    })
    // they hid the tab before the message existed: bring it up to date now
    if (document.hidden) update()
  } catch {
    // offline, blocked, or BotID said no: no alert this time
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
    return v && { model: v.model, platform: v.platform, platformVersion: v.platformVersion, mobile: v.mobile }
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

/** Edits the visit's message with its time, depth and clicks so far. */
function update() {
  if (!visit?.id || trackingOff()) return
  const seconds = Math.round(visit.active / 1000)
  if (seconds === visit.sent) return
  change((v) => (v.sent = seconds))
  const v = visit
  const body = JSON.stringify({ ...v.data, type: 'update', id: v.id, sig: v.sig, seconds, depth: v.depth, actions: v.actions, loads: v.loads })
  // a beacon survives the page closing; keepalive fetch where beacons aren't available
  if (!navigator.sendBeacon?.(ENDPOINT, body)) void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => undefined)
}
