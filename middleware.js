import { next, waitUntil } from '@vercel/functions'
import { TURNSTILE, challenge, hasPass, searchEngine, spendTicket, traffic } from './server/shield.js'
import { QUIET, RESUME, digest, downloadAllowed, notice, noteRequest, policy, who } from './server/visits.js'

/*
 * Runs on Vercel before every request for the site's pages and root files (not its bundled
 * assets, the API or BotID's challenge), in this order:
 * 1. bots not on the allow-list are turned away with a 403 (server/visits.js, policy): people,
 *    AIs fetching the page for someone, search engines and link previews get in, and so do browsers
 *    until their own page gives them away as automated (then they're out for a day);
 * 2. the request is counted, so floods show up (one IP hammering, or the whole site swamped);
 * 3. the résumé needs a fresh Cloudflare Turnstile check for every download (a one-use ticket),
 *    and stays within a few downloads per IP;
 * 4. pages need a check too, but only while a flood is on;
 * 5. everything is logged, after the response is on its way: people and AIs fetching for someone
 *    get an alert each, every other bot a line in the day's digest.
 * Nothing here may stand between a visitor and the site: any error lets the request through.
 */

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!static/|assets/|fonts/|api/|_vercel/|149e9513-01fa-4fb0-aad4-566afd725d1b/).*)'],
}

const text = (/** @type {string} */ body, /** @type {number} */ status, /** @type {Record<string, string>} */ headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers } })

/** @param {Request} request */
export default async function middleware(request) {
  try {
    const url = new URL(request.url)
    const path = url.pathname
    if (QUIET.has(path)) return next()
    const w = who(request)

    const rule = policy(w, path, request.method)
    if (rule.block) {
      waitUntil(digest(w, 'blocked', rule.label))
      return text('Automated access to this site isn’t allowed.\n', 403, { 'x-robots-tag': 'noindex, noai, noimageai' })
    }

    const load = await traffic(w.ip, w.key)
    if (load.flagged) {
      waitUntil(digest(w, 'blocked', 'Caught automated (out for a day)'))
      return text('Automated access to this site isn’t allowed.\n', 403, { 'x-robots-tag': 'noindex, noai, noimageai' })
    }
    if (load.tripped) {
      waitUntil(
        notice(
          'shield',
          `**Shield on**: ${load.perMinute} requests in the last minute, far past normal. For the next 10 minutes every page asks visitors for a Turnstile check first${TURNSTILE ? '' : ' (not yet: Turnstile keys aren’t set in Vercel)'}.`,
        ),
      )
    }
    if (path === RESUME) {
      // every download its own check: a flood pass or an earlier check doesn't count
      if (TURNSTILE && !(await spendTicket(url.searchParams.get('ticket'), w.ip))) {
        noteRequest(request, 'challenged')
        return challenge('resume')
      }
      const { ok, retry } = await downloadAllowed(w.ip)
      noteRequest(request, ok ? 'download' : 'refused')
      if (!ok) return text('Too many downloads from your network. Please try again a little later.\n', 429, { 'retry-after': String(retry) })
      return next()
    }

    const passed = TURNSTILE && hasPass(request, w.ip)
    if (TURNSTILE && !passed && (load.flooding || load.shield)) {
      if (searchEngine(w.ua)) {
        noteRequest(request, 'deferred')
        return text('Busy right now, please come back shortly.\n', 503, { 'retry-after': '600' })
      }
      noteRequest(request, 'challenged')
      return challenge('page')
    }
    noteRequest(request)
  } catch (err) {
    console.warn(`[middleware] ${String(err).slice(0, 120)}`)
  }
  return next()
}
