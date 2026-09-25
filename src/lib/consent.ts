/*
 * The visitor's analytics choice. The privacy note's switch (in the footer) keeps Vercel
 * Analytics, Microsoft Clarity and the visit alerts out of this browser from then on. Opening
 * the site with ?notrack does the same (it's how I leave my own devices out); ?track undoes it.
 * A notrack cookie carries the choice to the server, whose request log skips this browser too.
 */

const KEY = 'notrack'

/** The server's copy of the choice: the cookie holds this one flag and nothing else. */
function cookie(off: boolean) {
  document.cookie = off ? `${KEY}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure` : `${KEY}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
}

function initial() {
  // (the prerender runs the app without a browser: nothing to read there)
  if (typeof window === 'undefined') return false
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
const listeners = new Set<() => void>()

export const trackingOff = () => (off ??= initial())

export function setTrackingOff(value: boolean) {
  off = value
  cookie(value)
  try {
    if (value) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: still off for this page
  }
  listeners.forEach((l) => l())
}

/** For useSyncExternalStore, and for analytics to stop what's already running. */
export function onTrackingChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
