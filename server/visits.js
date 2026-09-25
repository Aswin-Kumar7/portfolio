import { timingSafeEqual } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { claim, count, hmac, put, read, run, tag } from './store.js'
/** @typedef {import('./store.js').Command} Command */

/*
 * Visit alerts: every visitor, person or bot, as one Discord message that keeps itself current.
 *
 * Two sources feed each visitor's record (kept in Upstash Redis, keyed by a hash of IP + browser):
 * - middleware.js sees every page, file and probe request on the server, so crawlers that never
 *   run JavaScript (most AI crawlers don't) still show up, along with what they asked for;
 * - api/visit.js hears from the page itself when it runs: screen, clock, real input, time on the
 *   page, scroll depth, clicks, and Vercel BotID's verdict.
 * Each change re-renders the alert (a few seconds apart at most), and every alert says what the
 * visitor is: a person, a named bot (ChatGPT, Claude, Google...), a scanner, or a likely bot and why.
 *
 * Anyone can reach both entry points, so nothing here trusts the caller:
 * - what visitors send, including paths and user agents, only reaches Discord as inert code (no
 *   pings, links or formatting); the only links are built from Vercel's own headers
 * - the page edits its own visit only, with a signed token; records are keyed by hashes
 * - budgets per IP and for everyone together (past the ceiling, one summary instead of a flood),
 *   and a full stop whenever Discord pushes back, so the webhook is never hammered into a ban
 * - an IP is kept in its visit's record for two hours at most; everything else is hashed
 * - a browser opened with ?notrack (my own devices: src/lib/consent.ts sets a va_off cookie) isn't logged
 * - each browser keeps one visitor id (the va_id cookie, set here for two years): the privacy
 *   note shows it and every alert is signed with it, so a deletion request can name its visits
 */

// ------------------------------------------------------------------ settings
const WEBHOOK = (process.env.DISCORD_WEBHOOK_URL ?? '').trim().replace(/\/+$/, '')
export const READY = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(WEBHOOK)

const MINUTE = 60_000
/** one visit: the same IP and browser with no gap longer than this */
const VISIT = 30 * MINUTE
/** a record, and so its alert's edits, lasts this long after its last request (seconds) */
const KEEP = 2 * 60 * 60
/** a new alert waits this long, so a person's page and its scripts arrive as one; edits come at most this often */
const FIRST = Number(process.env.VISIT_FIRST_MS) || 8000
const EDIT = Number(process.env.VISIT_EDIT_MS) || 3000
/** per IP, per hour: new browsers (new alerts), and requests of any kind */
const PER_IP = { visits: 10, events: 600 }
/** everyone together: past this many new alerts in the window, the rest go into one summary */
const EVERYONE = { alerts: 60, window: 10 * MINUTE }
/** the résumé, and how often one IP may download it */
export const RESUME = '/Aswin-Kumar-BS-Resume.pdf'
const DOWNLOADS = { burst: 5, window: 10 * MINUTE, daily: 20 }

const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hour = () => Math.floor(Date.now() / 3_600_000)

// ------------------------------------------------------------------ tokens
/** @param {string} key */
const sign = (key) => hmac('visit', key, 32)
/** What the page gets back: it can edit its own visit, and nothing else. @param {string} key */
export const token = (key) => `${key}.${sign(key)}`
/** @param {unknown} t @returns {string | null} the visit's key, if the token is genuine */
export function readToken(t) {
  if (typeof t !== 'string' || t.length > 80) return null
  const [key = '', sig = ''] = t.split('.')
  if (!/^[\w-]{22}$/.test(key)) return null
  const x = Buffer.from(sign(key))
  const y = Buffer.from(sig)
  return x.length === y.length && timingSafeEqual(x, y) ? key : null
}

// ------------------------------------------------------------------ who's asking
/**
 * Everything a request says about its sender, validated: nothing raw is kept.
 * @param {Request} request
 */
export function who(request) {
  const h = request.headers
  const rawIp = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  const ip = /^[\da-f:.]{3,45}$/i.test(rawIp) ? rawIp : 'unknown'
  const ua = clean(h.get('user-agent') ?? '', 400)
  const country = h.get('x-vercel-ip-country') ?? ''
  const region = h.get('x-vercel-ip-country-region') ?? ''
  const lat = h.get('x-vercel-ip-latitude') ?? ''
  const lon = h.get('x-vercel-ip-longitude') ?? ''
  const number = /^-?\d{1,3}(\.\d{1,6})?$/
  return {
    ip,
    ua,
    key: tag(`${ip}|${ua}`),
    geo: {
      country: /^[A-Z]{2}$/.test(country) ? country : '',
      region: /^[\w-]{1,4}$/.test(region) ? region : '',
      city: decodeCity(h.get('x-vercel-ip-city') ?? ''),
      lat: number.test(lat) ? lat : '',
      lon: number.test(lon) ? lon : '',
    },
    /** the first language the browser asks for; scripts rarely send one */
    lang: (h.get('accept-language') ?? '').match(/^[a-z]{2,3}(-[a-z\d]{2,8})?/i)?.[0] ?? '',
    /** headers every current browser sends on its own requests */
    browserHeaders: !!(h.get('sec-fetch-mode') || h.get('sec-ch-ua')),
    /** Web Bot Auth: agents such as ChatGPT's sign their requests and name themselves here */
    signature: (h.get('signature-agent') ?? '').match(/https?:\/\/([a-z\d.-]{3,60})/i)?.[1]?.toLowerCase() ?? '',
    referer: clean(h.get('referer') ?? '', 200),
    optedOut: /(?:^|;\s*)va_off=1(?:;|$)/.test(h.get('cookie') ?? ''),
    /** this browser's visitor id, if it has one (va_id, set by api/visit.js) */
    visitorId: (h.get('cookie') ?? '').match(/(?:^|;\s*)va_id=([\w-]{4,40})(?:;|$)/)?.[1] ?? '',
  }
}
/** @typedef {ReturnType<typeof who>} Who */

// ------------------------------------------------------------------ records
// Per visitor: `va:rec:<key>` holds its details (JSON, changed rarely), `va:hits:<key>:<n>` counts
// what it did (a hash, bumped atomically, so requests landing together never lose a count),
// `va:last:<key>` its last request and `va:msg:<key>:<n>` its Discord message. <n> numbers the
// visitor's visits, so a new visit starts clean without deleting anything.

/** @param {unknown} raw @returns {Record<string, any> | null} */
function parse(raw) {
  if (typeof raw !== 'string') return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}
/** @param {string} key */
const load = async (key) => parse((await run([['GET', `va:rec:${key}`]]))[0])
/** @param {Record<string, any>} v */
const save = (v) => put(`va:rec:${v.key}`, JSON.stringify(v), KEEP)
/** @param {unknown} raw a Redis hash, as Upstash's REST API (a flat list) or an object @returns {Record<string, number>} */
function hashOf(raw) {
  /** @type {Record<string, number>} */
  const out = {}
  if (Array.isArray(raw)) for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1]) || 0
  else if (raw && typeof raw === 'object') for (const [f, n] of Object.entries(raw)) out[f] = Number(n) || 0
  return out
}

/** A visitor's record: the current visit, or a new one after half an hour's silence. @param {Who} w */
async function openVisit(w) {
  const [raw, last] = await run([['GET', `va:rec:${w.key}`], ['GET', `va:last:${w.key}`]])
  const v = parse(raw)
  if (v && Date.now() - Number(last) < VISIT) return v
  const now = Date.now()
  const tooMany = (await count(`va:ip:${tag(w.ip)}:visits:${hour()}`, 3700)) > PER_IP.visits
  const fresh = {
    key: w.key,
    /** which visit of this visitor's this is */
    n: (Number(v?.n) || 0) + 1,
    first: now,
    ip: w.ip,
    ua: w.ua,
    geo: w.geo,
    lang: w.lang,
    browserHeaders: w.browserHeaders,
    signature: w.signature,
    referer: w.referer,
    vid: w.visitorId,
    /** visits from this IP and browser in the last 30 days, this one included */
    seen: await count(`va:seen:${w.key}`, 30 * 86_400),
    quiet: tooMany ? 'ip' : '',
  }
  // saved with its time, together: a request landing in between would otherwise start a second visit
  await run([
    ['SET', `va:rec:${w.key}`, JSON.stringify(fresh), 'EX', KEEP],
    ['SET', `va:last:${w.key}`, String(now), 'EX', KEEP],
  ])
  return fresh
}

/**
 * Applies one event to a visitor and schedules its alert.
 * @param {Who} w
 * @param {{ path?: string, counters?: string[], edit?: (v: Record<string, any>) => boolean }} event
 *   path: a request to list; counters: tallies to bump; edit: changes to its details (true if any)
 * @param {string} [key] an existing visit (from the page's token): changed only while it's still kept
 */
async function note(w, { path, counters = [], edit }, key) {
  if (!READY || w.optedOut) return
  if ((await count(`va:ip:${tag(w.ip)}:events:${hour()}`, 3700)) > PER_IP.events) return
  const v = key ? await load(key) : await openVisit(w)
  if (!v) return
  const table = `va:hits:${v.key}:${v.n}`
  /** @type {Command[]} */
  const commands = []
  if (path) {
    // up to 25 different requests are listed; after that they're only counted
    const [known, size] = await run([['HEXISTS', table, `p:${path}`], ['HLEN', table]])
    commands.push(['HINCRBY', table, Number(known) || Number(size) < 32 ? `p:${path}` : 'c:more', 1])
  }
  for (const c of counters) commands.push(['HINCRBY', table, `c:${c}`, 1])
  commands.push(['EXPIRE', table, KEEP], ['SET', `va:last:${v.key}`, String(Date.now()), 'EX', KEEP])
  await run(commands)
  if (edit?.(v)) await save(v)
  schedule(v.key, v.n)
}

// ------------------------------------------------------------------ what the middleware sees
const PROBE =
  /(^|\/)\.(env|git|svn|aws|ssh|htaccess|htpasswd|ds_store|vscode|idea|npmrc|docker)|wp-(admin|login|content|includes|json|config)|xmlrpc|phpmyadmin|\.(php\d?|asp|aspx|jsp|cgi|sql|bak|old|swp|log|ini|conf|yml|yaml|env)$|\/(admin|administrator|backup|config|server-status|actuator|cgi-bin|vendor|debug|console|shell|boaform|setup)(\/|$)/i
const FILES = new Set(['/robots.txt', '/sitemap.xml', '/llms.txt', '/og-image.jpg', '/site.webmanifest', '/2d65fab03c01f21a86fb78e445364a74.txt'])
/** requests a page makes by itself: not worth a line in the alert */
export const QUIET = new Set(['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'])
/** every file at the site's root that the build ships (scripts/check-site.mjs keeps this honest) */
export const KNOWN = ['/', '/index.html', RESUME, ...FILES, ...QUIET]

/** @param {string} path @param {string} method */
function kindOf(path, method) {
  if (PROBE.test(path) || !/^(GET|HEAD)$/.test(method)) return 'probe'
  if (path === '/' || path === '/index.html') return 'page'
  if (FILES.has(path)) return 'file'
  return 'missing'
}

/**
 * A request the middleware let through, or stopped: logged in the background.
 * @param {Request} request
 * @param {'download' | 'refused' | 'blocked' | 'challenged' | 'deferred'} [as]
 *   refused: past the download limit; blocked: an AI training crawler; challenged: shown the
 *   Turnstile check; deferred: a search engine asked to come back during a flood
 */
export function noteRequest(request, as) {
  const url = new URL(request.url)
  const path = clean(decodeSafe(url.pathname), 120) || '/'
  const kind = as ?? kindOf(path, request.method)
  const shown = request.method === 'GET' ? path : `${request.method} ${path}`
  const w = who(request)
  /** @type {Record<string, string>} */
  const tally = { download: 'downloads', refused: 'refused', probe: 'probes', missing: 'missing', blocked: 'blocked', challenged: 'challenged', deferred: 'deferred' }
  const counters = tally[kind] ? [tally[kind]] : []
  waitUntil(
    note(w, {
      path: shown,
      counters,
      // a later request can fill in what the first one lacked
      edit: (v) => {
        const referer = !v.referer && !!w.referer
        const headers = !v.browserHeaders && w.browserHeaders
        const id = !v.vid && !!w.visitorId
        if (referer) v.referer = w.referer
        if (headers) v.browserHeaders = true
        if (id) v.vid = w.visitorId
        return referer || headers || id
      },
    }).catch((err) => console.warn(`[visit] ${String(err).slice(0, 120)}`)),
  )
}

/** How a Turnstile check went (api/pass.js). @param {Request} request @param {boolean} ok */
export function notePass(request, ok) {
  waitUntil(note(who(request), { counters: [ok ? 'passed' : 'failed'] }).catch((err) => console.warn(`[visit] ${String(err).slice(0, 120)}`)))
}

/** Résumé downloads per IP: a few in a row, a handful a day. @param {string} ip */
export async function downloadAllowed(ip) {
  const now = Date.now()
  const slot = Math.floor(now / DOWNLOADS.window)
  const day = Math.floor(now / 86_400_000)
  const t = tag(ip)
  const [burst, , daily] = await run([
    ['INCR', `va:dl:${t}:${slot}`],
    ['EXPIRE', `va:dl:${t}:${slot}`, DOWNLOADS.window / 1000 + 60],
    ['INCR', `va:dl:${t}:d${day}`],
    ['EXPIRE', `va:dl:${t}:d${day}`, 90_000],
  ])
  if (Number(daily) > DOWNLOADS.daily) return { ok: false, retry: Math.ceil(((day + 1) * 86_400_000 - now) / 1000) }
  if (Number(burst) > DOWNLOADS.burst) return { ok: false, retry: Math.ceil(((slot + 1) * DOWNLOADS.window - now) / 1000) }
  return { ok: true, retry: 0 }
}

// ------------------------------------------------------------------ what the page says
/**
 * The page's own report, validated field by field; anything else is dropped.
 * @param {Record<string, any>} b
 */
export function clientData(b) {
  const visitor = b.visitor && typeof b.visitor === 'object' ? b.visitor : {}
  const screen = Array.isArray(b.screen) ? b.screen : []
  const ch = b.ch && typeof b.ch === 'object' ? b.ch : {}
  const now = Date.now()
  return {
    visitor: {
      id: typeof visitor.id === 'string' && /^[\w-]{4,40}$/.test(visitor.id) ? visitor.id : '',
      visits: int(visitor.visits, 1, 1e6) ?? 1,
      first: int(visitor.first, 1, now) ?? 0,
      previous: int(visitor.previous, 1, now) ?? 0,
    },
    page: clean(b.page, 160),
    referrer: clean(b.referrer, 200),
    screen: [int(screen[0], 0, 20_000) ?? 0, int(screen[1], 0, 20_000) ?? 0, typeof screen[2] === 'number' && screen[2] > 0 && screen[2] < 10 ? Math.round(screen[2] * 100) / 100 : 0],
    lang: typeof b.lang === 'string' && /^[\w-]{2,20}$/.test(b.lang) ? b.lang : '',
    tz: typeof b.tz === 'string' && /^[\w+/-]{1,40}$/.test(b.tz) ? b.tz : '',
    touch: int(b.touch, 0, 100) ?? 0,
    cores: int(b.cores, 0, 1024) ?? 0,
    memory: typeof b.memory === 'number' && b.memory > 0 && b.memory < 1024 ? b.memory : 0,
    brave: b.brave === true,
    webdriver: b.webdriver === true,
    ch: {
      model: clean(ch.model, 40),
      platformVersion: typeof ch.platformVersion === 'string' && /^[\d.]{1,20}$/.test(ch.platformVersion) ? ch.platformVersion : '',
      mobile: ch.mobile === true,
    },
  }
}

/**
 * The page has run: what it reports joins the visitor's record.
 * @param {Who} w @param {ReturnType<typeof clientData>} data
 * @param {string} botid 'human', 'bot', 'verified:<name>' or 'unchecked'
 */
export async function pageStarted(w, data, botid) {
  await note(w, {
    counters: ['loads'],
    edit: (v) => {
      const js = v.js ?? {}
      v.js = { ...data, botid, seconds: js.seconds ?? 0, depth: js.depth ?? 0, actions: js.actions ?? [], input: js.input === true, loads: js.loads ?? 0 }
      return true
    },
  })
  return token(w.key)
}

/** @param {string} key @param {Who} w @param {Record<string, any>} b */
export async function pageUpdated(key, w, b) {
  await note(
    w,
    {
      edit: (v) => {
        const js = v.js
        if (!js) return false
        js.seconds = Math.max(js.seconds, int(b.seconds, 0, 7 * 86_400) ?? 0)
        js.depth = Math.max(js.depth, int(b.depth, 0, 100) ?? 0)
        js.loads = Math.max(js.loads, int(b.loads, 1, 1e4) ?? 1)
        js.input = js.input || b.input === true
        if (Array.isArray(b.actions)) {
          for (const a of b.actions.slice(0, 20)) {
            const action = clean(a, 60)
            if (action && !js.actions.includes(action) && js.actions.length < 20) js.actions.push(action)
          }
        }
        return true
      },
    },
    key,
  )
}

// ------------------------------------------------------------------ rendering
/**
 * One edit per visitor every few seconds: a burst of requests becomes one message.
 * @param {string} key @param {number} n
 */
function schedule(key, n) {
  const job = (async () => {
    const [id] = await run([['GET', `va:msg:${key}:${n}`]])
    const delay = id ? EDIT : FIRST
    if (!(await claim(`va:render:${key}`, delay))) return
    await sleep(delay + 100)
    await render(key)
  })().catch((err) => console.warn(`[visit] render failed: ${String(err).slice(0, 120)}`))
  waitUntil(job)
}

/** @param {string} key */
async function render(key) {
  const v = await load(key)
  if (!v) return
  const [hits, id, last] = await run([['HGETALL', `va:hits:${key}:${v.n}`], ['GET', `va:msg:${key}:${v.n}`], ['GET', `va:last:${key}`]])
  const view = withCounts(v, hashOf(hits))
  const what = identify(view)
  if (typeof id === 'string') {
    await discord(`${WEBHOOK}/messages/${id}`, 'PATCH', compose(view, what))
    return
  }
  if (v.quiet) return summariseOnce(v, what)
  const slot = Math.floor(Date.now() / EVERYONE.window)
  if ((await count(`va:all:${slot}`, EVERYONE.window / 1000 + 60)) > EVERYONE.alerts) {
    v.quiet = 'busy'
    return summariseOnce(v, what)
  }
  const res = await discord(`${WEBHOOK}?wait=true`, 'POST', compose(view, what))
  const posted = res?.ok ? /** @type {{ id?: unknown }} */ (await res.json().catch(() => ({}))).id : null
  if (typeof posted !== 'string' || !/^\d{5,25}$/.test(posted)) return
  const [, now] = await run([['SET', `va:msg:${key}:${v.n}`, posted, 'EX', KEEP], ['GET', `va:last:${key}`]])
  // anything that arrived while the message was being posted gets its own edit
  if (Number(now) > Number(last)) schedule(key, v.n)
}

/** The details plus what the counters say. @param {Record<string, any>} v @param {Record<string, number>} hits */
function withCounts(v, hits) {
  /** @type {Record<string, number>} */
  const pages = {}
  for (const [f, n] of Object.entries(hits)) if (f.startsWith('p:')) pages[f.slice(2)] = n
  const loads = Math.max(hits['c:loads'] ?? 0, v.js?.loads ?? 0)
  return {
    ...v,
    pages,
    more: hits['c:more'] ?? 0,
    downloads: hits['c:downloads'] ?? 0,
    refused: hits['c:refused'] ?? 0,
    probes: hits['c:probes'] ?? 0,
    missing: hits['c:missing'] ?? 0,
    blocked: hits['c:blocked'] ?? 0,
    challenged: hits['c:challenged'] ?? 0,
    passed: hits['c:passed'] ?? 0,
    failed: hits['c:failed'] ?? 0,
    deferred: hits['c:deferred'] ?? 0,
    js: v.js ? { ...v.js, loads } : undefined,
  }
}

/** Past the ceiling: counted in one message per window, not lost. @param {Record<string, any>} v @param {Verdict} what */
async function summariseOnce(v, what) {
  if (v.summarised) return
  const latest = (await load(v.key)) ?? v
  latest.quiet = v.quiet
  latest.summarised = true
  await save(latest)
  const slot = Math.floor(Date.now() / EVERYONE.window)
  const ttl = EVERYONE.window / 1000 + 120
  const person = what.kind === 'human'
  const [all, , people] = await run([
    ['INCR', `va:summary:${slot}:n`],
    ['EXPIRE', `va:summary:${slot}:n`, ttl],
    person ? ['INCR', `va:summary:${slot}:people`] : ['GET', `va:summary:${slot}:people`],
  ])
  const n = Number(all) || 1
  const humans = Number(people) || 0
  const message = {
    content: `**Busy spell**: ${n} more ${n === 1 ? 'visitor' : 'visitors'} in these ${EVERYONE.window / MINUTE} minutes than the ${EVERYONE.alerts} that get their own alert (${humans} looked like people, ${n - humans} like bots). Counted here, not lost.`,
  }
  const id = await read(`va:summary:${slot}:id`)
  if (!id) {
    if (!(await claim(`va:summary:${slot}:lock`, ttl * 1000))) return
    const res = await discord(`${WEBHOOK}?wait=true`, 'POST', message)
    const posted = res?.ok ? /** @type {{ id?: unknown }} */ (await res.json().catch(() => ({}))).id : null
    if (typeof posted === 'string') await put(`va:summary:${slot}:id`, posted, ttl)
    return
  }
  if (await claim(`va:summary:${slot}:tick`, 15_000)) await discord(`${WEBHOOK}/messages/${id}`, 'PATCH', message)
}

// ------------------------------------------------------------------ person or bot
/**
 * Named by their user agent: [pattern, kind, name, what they're doing].
 * @type {[RegExp, Kind, string, string][]}
 */
const AGENTS = [
  [/ChatGPT-User/i, 'ai', 'ChatGPT', "fetching the page for someone's chat"],
  [/OAI-SearchBot/i, 'ai', 'ChatGPT search', 'indexing it for ChatGPT search'],
  [/GPTBot/i, 'ai', 'OpenAI GPTBot', 'crawling for AI training'],
  [/Claude-User/i, 'ai', 'Claude', "fetching the page for someone's chat"],
  [/Claude-SearchBot/i, 'ai', 'Claude search', 'indexing it for Claude search'],
  [/ClaudeBot|anthropic-ai/i, 'ai', 'Anthropic ClaudeBot', 'crawling for AI training'],
  [/Perplexity-User/i, 'ai', 'Perplexity', "fetching the page for someone's question"],
  [/PerplexityBot/i, 'ai', 'PerplexityBot', 'indexing it for Perplexity'],
  [/MistralAI-User/i, 'ai', 'Mistral Le Chat', "fetching the page for someone's chat"],
  [/DuckAssistBot/i, 'ai', 'DuckDuckGo DuckAssist', 'fetching it for an AI answer'],
  [/Google-CloudVertexBot|GoogleOther|Google-Extended/i, 'ai', 'Google AI', 'crawling for Google AI'],
  [/meta-external(agent|fetcher)/i, 'ai', 'Meta AI', 'crawling for Meta AI'],
  [/Applebot-Extended/i, 'ai', 'Apple Intelligence', 'crawling for Apple AI'],
  [/Amazonbot/i, 'ai', 'Amazonbot', 'crawling for Alexa and Amazon AI'],
  [/Bytespider/i, 'ai', 'ByteDance Bytespider', 'crawling for AI training'],
  [/CCBot/i, 'ai', 'Common Crawl', 'crawling for an open dataset AI models train on'],
  [/cohere-(ai|training)/i, 'ai', 'Cohere', 'crawling for AI'],
  [/YouBot/i, 'ai', 'You.com', 'crawling for AI search'],
  [/Diffbot|Timpibot|ImagesiftBot|omgili/i, 'ai', 'AI data crawler', 'collecting pages for AI'],
  [/Googlebot|Google-InspectionTool|Storebot-Google|AdsBot-Google|APIs-Google/i, 'search', 'Googlebot', 'indexing it for Google Search'],
  [/bingbot|BingPreview|msnbot/i, 'search', 'Bingbot', 'indexing it for Bing and Copilot'],
  [/Applebot/i, 'search', 'Applebot', 'indexing it for Siri and Spotlight'],
  [/DuckDuckBot/i, 'search', 'DuckDuckBot', 'indexing it for DuckDuckGo'],
  [/YandexBot|YandexImages/i, 'search', 'YandexBot', 'indexing it for Yandex'],
  [/Baiduspider/i, 'search', 'Baiduspider', 'indexing it for Baidu'],
  [/SeznamBot|Qwantbot|PetalBot|Sogou|Yeti\//i, 'search', 'Search crawler', 'indexing it for a search engine'],
  [/LinkedInBot/i, 'preview', 'LinkedIn', 'building a link preview'],
  [/Twitterbot/i, 'preview', 'X (Twitter)', 'building a link preview'],
  [/facebookexternalhit|FacebookBot|facebookcatalog/i, 'preview', 'Facebook / Instagram', 'building a link preview'],
  [/WhatsApp/i, 'preview', 'WhatsApp', 'building a link preview'],
  [/TelegramBot/i, 'preview', 'Telegram', 'building a link preview'],
  [/Slackbot|Slack-ImgProxy/i, 'preview', 'Slack', 'building a link preview'],
  [/Discordbot/i, 'preview', 'Discord', 'building a link preview'],
  [/redditbot|Pinterest|SkypeUriPreview|Iframely|Embedly|vkShare|Snapchat|Google-PageRenderer/i, 'preview', 'Link preview', 'building a link preview'],
  [/AhrefsBot|AhrefsSiteAudit/i, 'seo', 'Ahrefs', 'crawling for SEO data'],
  [/SemrushBot|SiteAuditBot/i, 'seo', 'Semrush', 'crawling for SEO data'],
  [/MJ12bot|DotBot|rogerbot|DataForSeoBot|BLEXBot|Screaming Frog|SERanking/i, 'seo', 'SEO crawler', 'crawling for SEO data'],
  [/UptimeRobot|Pingdom|StatusCake|BetterStack|Better Uptime|Uptime-Kuma/i, 'monitor', 'Uptime monitor', 'checking the site is up'],
  [/vercel-(screenshot|favicon)|vercelbot/i, 'monitor', 'Vercel', 'checking a deployment'],
  [/Lighthouse|PageSpeed|GTmetrix/i, 'monitor', 'Speed test', 'measuring the page'],
  [/archive\.org_bot|ia_archiver/i, 'crawler', 'Internet Archive', 'archiving the page'],
  [/zgrab|masscan|Nmap|Nuclei|nikto|sqlmap|WPScan|CensysInspect|Expanse|InternetMeasurement|LeakIX|BitSightBot|Detectify|Qualys|Acunetix|Netsparker|FortiGuard|Fortinet/i, 'scanner', 'Security scanner', 'scanning the site'],
  [/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Cypress/i, 'automation', 'Headless browser', 'automated browsing'],
  [/curl\/|Wget|python-requests|python-httpx|aiohttp|Python-urllib|Go-http-client|node-fetch|axios|undici|okhttp|Java\/|libwww-perl|PHP\/|Scrapy|HTTPie|PostmanRuntime|insomnia|Deno\/|Bun\//i, 'script', 'Script', 'fetching the page from code'],
  [/bot\b|crawl|spider|slurp|scrap|fetcher/i, 'crawler', 'Unnamed crawler', 'crawling'],
]

/** @typedef {'human' | 'ai' | 'search' | 'preview' | 'seo' | 'monitor' | 'crawler' | 'scanner' | 'script' | 'automation' | 'unknown'} Kind */
/** @typedef {{ kind: Kind, label: string, why: string[] }} Verdict */

/** A person, a named bot, or a likely bot and why. @param {Record<string, any>} v @returns {Verdict} */
export function identify(v) {
  const ua = String(v.ua ?? '')
  const js = v.js
  if (v.signature) {
    const chatgpt = v.signature === 'chatgpt.com' || v.signature.endsWith('.chatgpt.com') || v.signature.endsWith('.openai.com')
    return chatgpt
      ? { kind: 'ai', label: 'Bot: ChatGPT agent', why: ['browsing for someone in ChatGPT agent mode', `signed its requests as ${v.signature}`] }
      : { kind: 'ai', label: `Bot: signed agent (${v.signature})`, why: [`an AI or automated agent that signed its requests as ${v.signature}`] }
  }
  for (const [pattern, kind, name, what] of AGENTS) {
    if (pattern.test(ua)) return { kind, label: `Bot: ${name}`, why: [what, 'says so in its user agent'] }
  }
  if (typeof js?.botid === 'string' && js.botid.startsWith('verified:')) {
    return { kind: 'crawler', label: `Bot: ${js.botid.slice(9)}`, why: ['on Vercel BotID’s list of verified bots'] }
  }
  if (v.probes) return { kind: 'scanner', label: 'Scanner', why: [`asked for ${v.probes} ${v.probes === 1 ? 'path' : 'paths'} attackers look for (secrets, admin pages)`] }
  if (!ua) return { kind: 'script', label: 'Bot: no user agent', why: ['sent no user agent at all'] }

  const tells = []
  if (js?.webdriver) tells.push('driven by automation (navigator.webdriver)')
  if (js?.botid === 'bot') tells.push('Vercel BotID flagged it')
  const [w = 0, h = 0] = js?.screen ?? []
  if (js && (!w || !h)) tells.push('no screen')
  if (w === 800 && h === 600) tells.push('an 800×600 window, headless Chrome’s default')
  if (js && /^(Etc\/)?(UTC|UCT|GMT|Universal|Zulu)$/.test(js.tz) && /Linux|X11/.test(ua) && !/Android/.test(ua)) tells.push('Linux with its clock on plain UTC, like a server')
  if (!v.browserHeaders && /Mozilla/.test(ua)) tells.push('claims to be a browser but sends none of the headers browsers send')
  if (!v.lang && /Mozilla/.test(ua)) tells.push('asked for no language')
  if (v.missing >= 3) tells.push(`asked for ${v.missing} pages that don't exist`)
  if (tells.length) return { kind: 'automation', label: 'Likely bot', why: tells }

  if (!js) {
    return { kind: 'unknown', label: 'Not a person so far', why: ['fetched the page without running it: a crawler, a link preview or a text-only reader (people’s browsers run it)'] }
  }
  if (js.input) return { kind: 'human', label: 'Human', why: ['ran the page', js.botid === 'human' ? 'passed Vercel BotID' : 'BotID unchecked', 'real mouse, touch or keyboard input'] }
  return { kind: 'human', label: 'Probably human', why: ['ran the page', js.botid === 'human' ? 'passed Vercel BotID' : 'BotID unchecked', 'no input yet'] }
}

const COLORS = /** @type {Record<Kind, number>} */ ({
  human: 0x3ba55d,
  ai: 0x9b59b6,
  search: 0x95a5a6,
  preview: 0x95a5a6,
  seo: 0x95a5a6,
  monitor: 0x95a5a6,
  crawler: 0x95a5a6,
  scanner: 0xe74c3c,
  script: 0xe67e22,
  automation: 0xe67e22,
  unknown: 0xf1c40f,
})

/** @param {Record<string, any>} v @param {Verdict} what */
function compose(v, what) {
  const js = v.js
  const geo = v.geo ?? {}
  const code = geo.country ?? ''
  const flag = code ? [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') + ' ' : ''
  const place = [geo.city, geo.region !== geo.city ? geo.region : '', country(code)].filter(Boolean).join(', ') || 'somewhere unknown'
  const map = geo.lat && geo.lon ? ` · [map](https://www.google.com/maps?q=${geo.lat},${geo.lon})` : ''
  const person = what.kind === 'human'
  const visits = js?.visitor?.visits ?? 0
  const returning = person && visits > 1 ? `returning (${ordinal(visits)} visit)` : person ? 'new visitor' : ''

  /** @type {{ name: string, value: string, inline?: boolean }[]} */
  const fields = [
    { name: 'Verdict', value: `**${what.label}**: ${what.why.join(' · ')}`.slice(0, 1000) },
    { name: 'Where', value: `${flag}${place}${map}` },
    { name: 'IP', value: v.ip !== 'unknown' ? `[${v.ip}](https://ipinfo.io/${v.ip})` : 'unknown', inline: true },
    { name: 'Their time', value: js ? localTime(v.first, js.tz) : 'unknown (didn’t run the page)', inline: true },
    { name: 'Device', value: device(v) },
    { name: 'Browser', value: [browser(v.ua, js), mono(js?.lang || v.lang, 20)].filter(Boolean).join(' · ') },
  ]
  if (js) fields.push({ name: 'Visits', value: history(js.visitor) })
  else if (v.seen > 1) fields.push({ name: 'Seen before', value: `${v.seen} visits from this IP and browser in 30 days` })
  fields.push({ name: 'Came from', value: arrival(v) })
  fields.push({ name: 'Requested', value: requested(v) })
  if (v.downloads || v.refused) {
    fields.push({ name: 'Résumé', value: [v.downloads ? `downloaded ×${v.downloads}` : '', v.refused ? `${v.refused} refused (rate limit)` : ''].filter(Boolean).join(' · ') })
  }
  const guarded = [
    v.blocked ? `refused ×${v.blocked} (AI training crawler)` : '',
    v.challenged ? `Turnstile check shown ×${v.challenged}` : '',
    v.passed ? `passed ×${v.passed}` : '',
    v.failed ? `failed ×${v.failed}` : '',
    v.deferred ? `asked to come back later ×${v.deferred} (flood)` : '',
  ].filter(Boolean)
  if (guarded.length) fields.push({ name: 'Protection', value: guarded.join(' · ') })
  if (js) fields.push({ name: 'Session', value: session(js) })
  const clicks = (js?.actions ?? []).map((/** @type {unknown} */ a) => mono(a, 60)).filter(Boolean)
  if (clicks.length) fields.push({ name: 'Clicked', value: clicks.join(', ').slice(0, 1000) })
  if (!person) fields.push({ name: 'User agent', value: mono(v.ua, 300) || 'none' })

  return {
    // the plain line is what a phone notification shows
    content: `**${what.label}**${returning ? ` · ${returning}` : ''} · from ${flag}${place}`.slice(0, 300),
    embeds: [
      {
        color: person && visits > 1 ? 0x5865f2 : COLORS[what.kind],
        fields,
        // the id the privacy note shows that browser, so a deletion request can be matched here
        footer: { text: `visitor ${js?.visitor?.id || v.vid || String(v.key).slice(0, 8)}` },
        timestamp: new Date(v.first).toISOString(),
      },
    ],
  }
}

/** @param {Record<string, any>} v */
function requested(v) {
  const entries = Object.entries(/** @type {Record<string, number>} */ (v.pages ?? {}))
  if (!entries.length) return 'nothing yet (only the page’s own scripts)'
  const list = entries.map(([p, n]) => `${mono(p, 80)}${n > 1 ? ` ×${n}` : ''}`)
  let out = ''
  let shown = 0
  for (const item of list) {
    if (out.length + item.length > 900) break
    out += (out ? ', ' : '') + item
    shown++
  }
  const hidden = list.length - shown + (v.more ?? 0)
  return hidden > 0 ? `${out} (+${hidden} more)` : out
}

/** @param {Record<string, any>} js */
function session(js) {
  return [
    js.seconds ? `${duration(js.seconds)} on the page` : 'on the page now',
    js.depth ? `scrolled ${js.depth}%` : '',
    js.loads > 1 ? `opened ${js.loads} times` : '',
    js.input ? 'used mouse, touch or keys' : 'no input yet',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** @param {Record<string, any>} visitor */
function history(visitor) {
  const visits = visitor?.visits ?? 1
  if (visits <= 1) return 'First visit'
  const now = Date.now()
  const parts = [`${ordinal(visits)} visit`]
  if (visitor.previous) parts.push(`last seen ${ago(now - visitor.previous)}`)
  if (visitor.first) parts.push(`first seen ${new Date(visitor.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`)
  return parts.join(' · ')
}

/** @param {Record<string, any>} v */
function arrival(v) {
  const js = v.js
  const ref = js?.referrer || v.referer || ''
  let from = 'direct'
  if (ref) {
    try {
      const url = new URL(ref)
      from = mono(url.host + (url.pathname === '/' ? '' : url.pathname), 120)
    } catch {
      from = mono(ref, 120)
    }
  }
  const page = js?.page && js.page !== '/' ? ` · landed on ${mono(js.page, 160)}` : ''
  return from + page
}

/** @param {Record<string, any>} v */
function device(v) {
  const ua = String(v.ua ?? '')
  const js = v.js ?? {}
  const ch = js.ch ?? {}
  const touch = js.touch ?? 0
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)
  const kind = ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) || /Tablet/.test(ua) ? 'Tablet' : ch.mobile === true || /Mobi|iPhone|Android/.test(ua) ? 'Phone' : 'Desktop'
  const model = ch.model ? mono(ch.model, 40) : /iPhone/.test(ua) ? 'iPhone' : ipad ? 'iPad' : ''
  const pv = ch.platformVersion ?? ''
  const major = Number.parseInt(pv, 10)
  /** @type {RegExpMatchArray | null} */
  let m
  let os = 'unknown OS'
  if ((m = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/))) os = `${ipad ? 'iPadOS' : 'iOS'} ${m[1]}.${m[2]}`
  else if (ipad) os = 'iPadOS'
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) os = `Android ${major || m[1]}`
  else if (/Windows NT 10/.test(ua)) os = major ? (major >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows 10/11'
  else if ((m = ua.match(/Windows NT (\d+\.\d+)/))) os = `Windows NT ${m[1]}`
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Macintosh|Mac OS X/.test(ua)) os = pv ? `macOS ${pv.split('.').slice(0, 2).join('.')}` : 'macOS'
  else if (/Linux/.test(ua)) os = /Ubuntu/.test(ua) ? 'Linux (Ubuntu)' : /Fedora/.test(ua) ? 'Linux (Fedora)' : 'Linux'
  const [w, h, dpr] = js.screen ?? []
  return [
    model ? `${kind} (${model})` : kind,
    os,
    w && h ? `${w}×${h}${dpr ? ` @${dpr}x` : ''}` : '',
    js.cores ? `${js.cores} cores` : '',
    js.memory ? `${js.memory} GB` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** @param {string} ua @param {Record<string, any> | undefined} js */
function browser(ua, js) {
  /** @type {[string, RegExp][]} */
  const known = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /(?:OPR|OPT)\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Yandex', /YaBrowser\/(\d+)/],
    ['Vivaldi', /Vivaldi\/(\d+)/],
    ['Instagram in-app', /Instagram ([\d]+)/],
    ['Facebook in-app', /FB(?:AV|_IAB)\/(\d+)?/],
    ['LinkedIn in-app', /LinkedInApp(?:\/(\d+))?/],
    ['Chrome', /CriOS\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+(?:\.\d+)?).*Safari/],
  ]
  for (const [name, re] of known) {
    const m = ua.match(re)
    if (!m) continue
    const label = name === 'Chrome' && js?.brave === true ? 'Brave' : name
    return m[1] ? `${label} ${m[1]}` : label
  }
  return ua ? 'not a browser' : 'unknown'
}

// ------------------------------------------------------------------ Discord
/** Discord said stop (rate limit), or the webhook is gone: no calls before this time */
let pausedUntil = 0

/** @param {number} seconds */
async function pause(seconds) {
  pausedUntil = Date.now() + seconds * 1000
  await put('va:paused', '1', Math.max(1, Math.ceil(seconds)))
}

/** @param {string} url @param {string} method @param {object} message */
export async function discord(url, method, message) {
  if (!READY || Date.now() < pausedUntil || (await read('va:paused'))) return null
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    // nothing in a message may ping anyone, whatever it contains
    body: JSON.stringify({ ...message, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!res) return null
  if (res.status === 429) {
    // Discord's rate limit: wait it out (repeated 429s get the caller's IP banned)
    const retry = Number(res.headers.get('retry-after'))
    await pause(Math.min(Number.isFinite(retry) && retry > 0 ? retry : 10, 600))
  } else if (res.status === 401 || res.status === 403 || res.status === 404) {
    // the webhook was deleted or its token changed (a 404 for a deleted *message* is fine)
    const { code } = /** @type {{ code?: number }} */ (await res.clone().json().catch(() => ({})))
    if (res.status !== 404 || code === 10015) await pause(60 * 60)
  }
  if (!res.ok) console.warn(`[visit] Discord answered ${res.status} to a ${method}`)
  return res
}

/** Posted once a day at most: something needs the owner's attention. @param {string} key @param {string} text */
export async function notice(key, text) {
  if (await claim(`va:notice:${key}`, 86_400_000)) await discord(WEBHOOK, 'POST', { content: text.slice(0, 500) })
}

// ------------------------------------------------------------------ helpers
/** Visitor-supplied text, flattened: no control characters, no backticks, bounded. @param {unknown} v @param {number} max */
export function clean(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f`]/g, '').trim().slice(0, max) : ''
}

/** Shown as code, so it can't format, link or ping. @param {unknown} v @param {number} max */
function mono(v, max) {
  const s = clean(v, max)
  return s ? `\`${s}\`` : ''
}

/** @param {string} s */
function decodeSafe(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** @param {string} s */
function decodeCity(s) {
  return decodeSafe(s)
    .replace(/[^\p{L}\p{M}\s'.-]/gu, '')
    .slice(0, 60)
}

/** @param {unknown} v @param {number} min @param {number} max */
function int(v, min, max) {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined
}

/** @param {string} code */
function country(code) {
  if (!code) return ''
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** @param {number} at @param {unknown} tz */
function localTime(at, tz) {
  if (typeof tz !== 'string' || !tz) return 'unknown'
  try {
    return `${new Date(at).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })} · ${tz}`
  } catch {
    return 'unknown'
  }
}

/** @param {number} s */
function duration(s) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/** @param {number} ms */
function ago(ms) {
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** @param {number} n */
function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
}
