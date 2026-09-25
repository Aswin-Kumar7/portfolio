import { randomBytes, timingSafeEqual } from 'node:crypto'
import { claim, hmac, put, run, tag } from './store.js'

/*
 * Keeping the site's content out of AI training sets, the résumé away from bots, and the site up
 * under floods (middleware.js applies it; api/pass.js hands out the pass):
 * - AI training crawlers (GPTBot, ClaudeBot, Common Crawl...) are refused outright. robots.txt
 *   asks them to stay away; this makes it stick for the ones that don't listen.
 * - every résumé download needs its own Cloudflare Turnstile check (usually invisible): a passed
 *   check buys one ticket, good for a single download, from the same network, within a minute.
 *   Nothing is remembered per browser or session, so a click, a dragged link, a reopened tab or a
 *   shared URL each mean a new check.
 * - pages ask for a check only when traffic looks like a flood: one IP making many requests a
 *   minute, or the whole site getting far more than it ever does (shield mode, 10 minutes). A
 *   passed page check lasts 30 minutes on that network, so people can browse through a flood.
 *   Search engines get "come back later" (503) instead of a check they can't solve.
 * Until Turnstile's keys are set in Vercel, all of this except the crawler rule stays off.
 */

const SITE_KEY = (process.env.TURNSTILE_SITE_KEY ?? '').trim()
const SECRET_KEY = (process.env.TURNSTILE_SECRET_KEY ?? '').trim()
export const TURNSTILE = /^[\w-]{10,100}$/.test(SITE_KEY) && /^[\w-]{10,200}$/.test(SECRET_KEY)

/** how long a page pass lasts during a flood (seconds) */
const PASS = 30 * 60
/** how long a résumé ticket lasts (seconds): long enough to start the download, no longer */
const TICKET = 60
/** requests a minute from one IP before its pages need a pass */
const PER_IP_MINUTE = 40
/** requests a minute across the site before every page needs one (portfolio traffic is a few) */
const EVERYONE_MINUTE = 400
/** how long shield mode stays on once tripped (seconds) */
const SHIELD = 10 * 60

// ------------------------------------------------------------------ crawlers
/** Crawlers that collect pages to train AI models: refused everywhere. */
const TRAINING =
  /GPTBot|ClaudeBot|anthropic-ai|CCBot|Bytespider|meta-externalagent|FacebookBot|Amazonbot|GoogleOther|Google-CloudVertexBot|cohere-(ai|training)|Diffbot|Timpibot|ImagesiftBot|omgili|AI2Bot|Ai2Bot-Dolma|img2dataset|PanguBot|Kangaroo Bot|Sidetrade|webzio|ICC-Crawler/i
/** Search engines: never shown a check they can't solve, asked to come back instead. */
const SEARCH = /Googlebot|bingbot|Applebot|DuckDuckBot|YandexBot|Baiduspider/i

/** @param {string} ua @returns {string} the crawler's name, if it's one that trains AI */
export const trainingCrawler = (ua) => ua.match(TRAINING)?.[0] ?? ''
/** @param {string} ua */
export const searchEngine = (ua) => SEARCH.test(ua)

// ------------------------------------------------------------------ floods
/**
 * Counts this request, and says whether this IP, or the whole site, is past normal.
 * @param {string} ip
 */
export async function traffic(ip) {
  const minute = Math.floor(Date.now() / 60_000)
  const t = tag(ip)
  const [mine, , all, , shield] = await run([
    ['INCR', `sh:ip:${t}:${minute}`],
    ['EXPIRE', `sh:ip:${t}:${minute}`, 120],
    ['INCR', `sh:all:${minute}`],
    ['EXPIRE', `sh:all:${minute}`, 120],
    ['GET', 'sh:shield'],
  ])
  const tripped = !shield && Number(all) > EVERYONE_MINUTE
  if (tripped) await put('sh:shield', String(Date.now()), SHIELD)
  return { flooding: Number(mine) > PER_IP_MINUTE, shield: !!shield || tripped, tripped, perMinute: Number(all) || 0 }
}

// ------------------------------------------------------------------ the pass
/** @param {number} expires @param {string} ip */
const passSignature = (expires, ip) => hmac('pass', `${expires}.${tag(ip)}`, 32)

/** Set after a Turnstile check: good for this network only, for 30 minutes; scripts can't read it. @param {string} ip */
export function passCookies(ip) {
  const expires = Math.floor(Date.now() / 1000) + PASS
  return [`vpass=${expires}.${passSignature(expires, ip)}; Max-Age=${PASS}; Path=/; HttpOnly; Secure; SameSite=Lax`]
}

/** @param {Request} request @param {string} ip */
export function hasPass(request, ip) {
  const m = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)vpass=(\d{10})\.([\w-]{32})(?:;|$)/)
  if (!m) return false
  const expires = Number(m[1])
  const now = Date.now() / 1000
  if (expires < now || expires > now + PASS + 60) return false
  const a = Buffer.from(passSignature(expires, ip))
  const b = Buffer.from(m[2] ?? '')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ------------------------------------------------------------------ résumé tickets
/** One download of the résumé, for this network, within a minute. @param {string} ip */
export function ticketFor(ip) {
  const expires = Math.floor(Date.now() / 1000) + TICKET
  const nonce = randomBytes(9).toString('base64url')
  return `${expires}.${nonce}.${hmac('ticket', `${expires}.${nonce}.${tag(ip)}`, 32)}`
}

/** Spends a ticket: true only once, for the network it was issued to, before it runs out. @param {string | null} t @param {string} ip */
export async function spendTicket(t, ip) {
  const m = (t ?? '').match(/^(\d{10})\.([\w-]{12})\.([\w-]{32})$/)
  if (!m) return false
  const [, expires = '', nonce = '', sig = ''] = m
  const now = Date.now() / 1000
  if (Number(expires) < now || Number(expires) > now + TICKET + 5) return false
  const a = Buffer.from(hmac('ticket', `${expires}.${nonce}.${tag(ip)}`, 32))
  const b = Buffer.from(sig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  return claim(`sh:ticket:${nonce}`, (TICKET + 10) * 1000)
}

// ------------------------------------------------------------------ Turnstile
/**
 * Asks Cloudflare whether a Turnstile token is genuine (each one works once, for 5 minutes) and
 * was solved for this purpose: a page check's token can't buy a résumé download.
 * @param {unknown} token @param {string} ip @param {'resume' | 'page'} action
 */
export async function verifyTurnstile(token, ip, action) {
  if (!TURNSTILE || typeof token !== 'string' || !token || token.length > 2048) return false
  const body = new URLSearchParams({ secret: SECRET_KEY, response: token })
  if (ip !== 'unknown') body.set('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(6000) }).catch(() => null)
  const out = res?.ok ? /** @type {{ success?: boolean, hostname?: string, action?: string }} */ (await res.json().catch(() => null)) : null
  if (out?.success !== true) return false
  // Cloudflare's test keys report example.com and no action; real tokens must match both
  if (SECRET_KEY.startsWith('1x0000000000000000000000000000000')) return true
  return /^(www\.)?aswinkumar\.dev$/.test(String(out.hostname ?? '')) && out.action === action
}

/**
 * The check itself: a small page that runs Turnstile, then trades the token for a one-download
 * ticket (the résumé) or a flood pass (pages), and carries on to where the visitor was going.
 * The site's own scripts read the headers instead and run the same check in place.
 * @param {'resume' | 'page'} why
 */
export function challenge(why) {
  const nonce = randomBytes(16).toString('base64')
  const title = why === 'resume' ? 'A quick check before the résumé' : 'A quick check'
  const text =
    why === 'resume'
      ? 'This keeps the résumé away from bots that copy it. It usually passes on its own.'
      : 'The site is getting an unusual amount of traffic, so it’s checking that visitors are people. It usually passes on its own.'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Aswin Kumar | Checking you’re human</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: #04070f; color: #e8edf7; font: 15px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { width: min(420px, calc(100vw - 32px)); padding: 28px; border-radius: 20px; background: rgb(5 9 20 / 0.95); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 24px 60px -20px #000; }
  .mark { margin: 0 0 12px; font: 500 10px/1 ui-monospace, 'Cascadia Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #8b95ab; }
  h1 { margin: 0 0 8px; font: 400 26px/1.1 Georgia, 'Times New Roman', serif; }
  p { margin: 0 0 18px; color: #b6bfd1; }
  #state { min-height: 1.6em; margin: 14px 0 0; font-size: 13px; color: #8b95ab; }
</style>
<script nonce="${nonce}">
  function ready() {
    var state = document.getElementById('state')
    turnstile.render('#check', {
      sitekey: ${JSON.stringify(SITE_KEY)},
      action: ${JSON.stringify(why)},
      theme: 'dark',
      callback: function (token) {
        state.textContent = 'Thanks, one moment…'
        var failed = function () { state.textContent = 'That didn’t go through. Reload the page to try again.' }
        fetch('/api/pass', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: token, for: ${JSON.stringify(why)} }) })
          .then(function (r) {
            if (!r.ok) return failed()
            // the résumé: one download with the ticket; pages: the pass cookie is set, reload
            if (${JSON.stringify(why)} !== 'resume') return location.reload()
            return r.json().then(function (out) { location.replace(location.pathname + '?ticket=' + encodeURIComponent(out.ticket)) })
          })
          .catch(function () { state.textContent = 'You seem to be offline. Reload the page to try again.' })
      },
      'error-callback': function () { state.textContent = 'The check couldn’t load. Reload the page to try again.' },
    })
  }
</script>
<script nonce="${nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ready" defer></script>
</head>
<body>
<main>
  <p class="mark">Aswin Kumar</p>
  <h1>${title}</h1>
  <p>${text}</p>
  <div id="check"></div>
  <p id="state" role="status"></p>
  <noscript><p>This check needs JavaScript. Please turn it on and reload.</p></noscript>
</main>
</body>
</html>
`
  return new Response(html, {
    status: 403,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'unsafe-inline'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      // for the site's own scripts (src/components/ResumeGate.tsx): run the same check in place
      'x-challenge': 'turnstile',
      'x-turnstile-sitekey': SITE_KEY,
    },
  })
}
