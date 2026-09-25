import { next, waitUntil } from '@vercel/functions'
import { TURNSTILE, challenge, hasPass, searchEngine, trainingCrawler, traffic } from './server/shield.js'
import { QUIET, RESUME, downloadAllowed, notice, noteRequest, who } from './server/visits.js'

/*
 * Runs on Vercel before every request for the site's pages and root files (not its bundled
 * assets, the API or BotID's challenge), in this order:
 * 1. AI training crawlers are turned away (server/shield.js has the list);
 * 2. the request is counted, so floods show up (one IP hammering, or the whole site swamped);
 * 3. the résumé needs a Cloudflare Turnstile pass, then stays within a few downloads per IP;
 * 4. pages need that pass too, but only while a flood is on;
 * 5. everything is logged for the visit alerts, bots included, after the response is on its way.
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
    const path = new URL(request.url).pathname
    if (QUIET.has(path)) return next()
    const w = who(request)

    const crawler = trainingCrawler(w.ua)
    if (crawler) {
      noteRequest(request, 'blocked')
      return text('This site does not allow its content to be collected for AI training.\n', 403, { 'x-robots-tag': 'noindex, noai, noimageai' })
    }

    const load = await traffic(w.ip)
    if (load.tripped) {
      waitUntil(
        notice(
          'shield',
          `**Shield on**: ${load.perMinute} requests in the last minute, far past normal. For the next 10 minutes every page asks visitors for a Turnstile check first${TURNSTILE ? '' : ' (not yet: Turnstile keys aren’t set in Vercel)'}.`,
        ),
      )
    }
    const passed = TURNSTILE && hasPass(request, w.ip)

    if (path === RESUME) {
      if (TURNSTILE && !passed) {
        noteRequest(request, 'challenged')
        return challenge('resume')
      }
      const { ok, retry } = await downloadAllowed(w.ip)
      noteRequest(request, ok ? 'download' : 'refused')
      if (!ok) return text('Too many downloads from your network. Please try again a little later.\n', 429, { 'retry-after': String(retry) })
      return next()
    }

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
