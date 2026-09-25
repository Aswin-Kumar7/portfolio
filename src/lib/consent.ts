/*
 * Leaving a browser out of the analytics: opening the site with ?notrack keeps Vercel Analytics,
 * Microsoft Clarity and the visit alerts out of it from then on (it's how I leave my own devices
 * out); ?track undoes it. A va_off cookie carries the choice to the server, whose request log
 * skips this browser too. Visitors ask for their data to be deleted instead (the privacy note).
 *
 * The flag used to be called "notrack", when visitors had a switch for it; that switch is gone,
 * and so is every choice made with it: old flags are cleared, and those browsers count again.
 */

const KEY = 'va-off'
const COOKIE = 'va_off'

/** The server's copy of the choice: the cookie holds this one flag and nothing else. */
function cookie(off: boolean) {
  document.cookie = off ? `${COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure` : `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
}

/** Clears the retired flag, wherever it was kept. */
function forgetLegacy() {
  try {
    localStorage.removeItem('notrack')
  } catch {
    // storage blocked
  }
  if (/(?:^|;\s*)notrack=/.test(document.cookie)) document.cookie = 'notrack=; Max-Age=0; Path=/; SameSite=Lax; Secure'
}

function initial() {
  // (the prerender runs the app without a browser: nothing to read there)
  if (typeof window === 'undefined') return false
  forgetLegacy()
  const q = new URLSearchParams(location.search)
  let choice = q.has('notrack')
  try {
    if (q.has('notrack')) localStorage.setItem(KEY, '1')
    else if (q.has('track')) localStorage.removeItem(KEY)
    choice = localStorage.getItem(KEY) === '1'
  } catch {
    // storage blocked: the choice lasts as long as the page
  }
  // kept in step with storage, so the server honours a choice made before the cookie existed
  cookie(choice)
  return choice
}

let off: boolean | undefined

export const trackingOff = () => (off ??= initial())
