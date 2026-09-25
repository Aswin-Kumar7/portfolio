/*
 * Analytics. Events are forwarded to whichever tool is on the page — Google Tag
 * Manager (dataLayer), GA4 (gtag), Umami or Plausible — so dropping any of their
 * snippets into index.html is all it takes.
 *
 * Events: resume_download · contact_click · copy_email · project_open ·
 *         projects_view_all · offer_cta · contact_link · footer_link ·
 *         scroll_depth · engaged_time
 */

type Props = Record<string, string | number | boolean>

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (command: 'event', name: string, params?: Props) => void
    umami?: { track: (name: string, data?: Props) => void }
    plausible?: (name: string, options?: { props?: Props }) => void
  }
}

export function track(event: string, props: Props = {}) {
  const payload: Props = { ...props }
  try {
    window.dataLayer?.push({ event, ...payload })
    window.gtag?.('event', event, payload)
    window.umami?.track(event, payload)
    window.plausible?.(event, { props: payload })
  } catch {
    // analytics must never break the page
  }
  if (import.meta.env.DEV) console.info('[analytics]', event, payload)
}

export function initAnalytics() {
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
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', onHide)
    cancelAnimationFrame(raf)
  }
}
