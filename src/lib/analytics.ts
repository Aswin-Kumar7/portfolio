import Clarity from '@microsoft/clarity'
import { inject as startVercel, track as vercelTrack } from '@vercel/analytics'

/*
 * Analytics.
 *
 * Vercel Web Analytics (page views, visitors, referrers, countries, devices) starts in
 * production builds on aswinkumar.dev; Vercel serves its script first-party from /_vercel/insights.
 * Every event below is also sent to it as a custom event (recorded on Vercel's Pro plan).
 *
 * Microsoft Clarity (heatmaps, session recordings, scroll depth, rage clicks) starts in
 * production builds when VITE_CLARITY_PROJECT_ID is set — so local dev and Vercel preview
 * deployments never record sessions. Our CTA clicks become Clarity custom events.
 *
 * Events: resume_download · contact_click · copy_email · mail_compose · project_open ·
 *         projects_view_all · offer_cta · contact_link · footer_link ·
 *         scroll_depth · engaged_time
 */

type Props = Record<string, string | number | boolean>

const CLARITY_ID = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim()
let clarity = false
/** Clarity measures these itself — no need to send them as custom events. */
const CLARITY_NATIVE = new Set(['scroll_depth', 'engaged_time'])

function startClarity() {
  if (clarity || !import.meta.env.PROD || !CLARITY_ID) return
  try {
    Clarity.init(CLARITY_ID)
    clarity = true
  } catch {
    // analytics must never break the page
  }
}

export function track(event: string, props: Props = {}) {
  const payload: Props = { ...props }
  try {
    if (import.meta.env.PROD && location.hostname.endsWith('aswinkumar.dev')) vercelTrack(event, payload)
    // e.g. "contact_click:hero" — filterable in Clarity's dashboard
    if (clarity && !CLARITY_NATIVE.has(event)) Clarity.event(payload.label ? `${event}:${payload.label}` : event)
  } catch {
    // analytics must never break the page
  }
  if (import.meta.env.DEV) console.info('[analytics]', event, payload)
}

export function initAnalytics() {
  // Vercel's page-view script is ~1 kB and deferred: it starts straight away, so short visits count too
  if (import.meta.env.PROD && location.hostname.endsWith('aswinkumar.dev')) startVercel({ mode: 'production', framework: 'vite' })

  // Clarity loads once the page is idle, so it never competes with the intro or the 3D scenes
  // (Safari has no requestIdleCallback — a timeout stands in)
  const hasIdle = typeof window.requestIdleCallback === 'function'
  const idle = hasIdle ? window.requestIdleCallback(startClarity, { timeout: 4000 }) : window.setTimeout(startClarity, 2500)

  // Declarative CTA tracking: <a data-track="resume_download" data-track-label="hero">
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-track]')
    if (el?.dataset.track) track(el.dataset.track, { label: el.dataset.trackLabel ?? '' })
  }
  document.addEventListener('click', onClick, true)

  // Scroll depth milestones.
  const marks = [25, 50, 75, 100]
  const seen = new Set<number>()
  let raf = 0
  const onScroll = () => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const doc = document.documentElement
      const pct = ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100
      for (const m of marks) {
        if (pct >= m - 0.5 && !seen.has(m)) {
          seen.add(m)
          track('scroll_depth', { percent: m })
        }
      }
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  // Engaged time, reported once when the visitor leaves or hides the tab.
  const start = performance.now()
  let reported = false
  const onHide = () => {
    if (reported || document.visibilityState !== 'hidden') return
    reported = true
    track('engaged_time', { seconds: Math.round((performance.now() - start) / 1000) })
  }
  document.addEventListener('visibilitychange', onHide)

  return () => {
    if (hasIdle) window.cancelIdleCallback(idle)
    else window.clearTimeout(idle)
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', onHide)
    cancelAnimationFrame(raf)
  }
}
