import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EASE, gsap, prefersReducedMotion } from '../lib/gsap'
import { profile } from '../data/resume'

/*
 * The résumé, behind a quick human check. Every résumé link still points at the PDF, but a
 * click downloads it from here: straight away if this browser already holds a pass, otherwise
 * after Cloudflare Turnstile (usually invisible) confirms a person is asking, in a small panel
 * by the link. The server asks the same of anyone fetching the PDF directly (middleware.js), so
 * bots that copy files for AI training go without.
 */

interface Gate {
  /** where the panel points from, in viewport pixels */
  x: number
  top: number
  bottom: number
  trigger: HTMLElement
  siteKey: string
}

type Phase = 'checking' | 'saving' | 'limited' | 'failed'

const FILE = profile.resume.split('/').pop() ?? 'resume.pdf'
const WIDTH = 320
const GAP = 10

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, options: Record<string, unknown>): string
      remove(id: string): void
    }
  }
}

let turnstileScript: Promise<void> | null = null
/** Cloudflare's widget script, loaded the first time a check is needed. */
function loadTurnstile() {
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      turnstileScript = null
      reject(new Error('Turnstile did not load'))
    }
    document.head.appendChild(s)
  })
  return turnstileScript
}

type Attempt = { ok: true } | { ok: false; siteKey?: string; limited?: boolean }

/** Fetches the PDF and saves it; otherwise says what stood in the way. */
async function download(): Promise<Attempt> {
  const res = await fetch(profile.resume, { credentials: 'same-origin', cache: 'no-store' })
  if (res.ok && (res.headers.get('content-type') ?? '').includes('pdf')) {
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = FILE
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return { ok: true }
  }
  if (res.status === 403 && res.headers.get('x-challenge') === 'turnstile') return { ok: false, siteKey: res.headers.get('x-turnstile-sitekey') ?? '' }
  return { ok: false, limited: res.status === 429 }
}

const MESSAGES: Record<Phase, string> = {
  checking: 'This keeps the résumé away from bots that copy it. It usually passes on its own.',
  saving: 'Thanks. Downloading…',
  limited: 'Too many downloads from your network just now. Please try again in a few minutes.',
  failed: 'That didn’t go through. Close this and try the link again.',
}

export function ResumeGate() {
  const [gate, setGate] = useState<Gate | null>(null)
  const [phase, setPhase] = useState<Phase>('checking')
  const panel = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  // every résumé link on the page (a modified click still gets the browser's default)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(`a[href="${profile.resume}"]`)
      if (!link) return
      e.preventDefault()
      const rect = link.getBoundingClientRect()
      // a link that's already gone (the mobile menu closing): point from the middle of the screen
      const shown = rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
      const at = shown ? { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom } : { x: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 }
      download()
        .then((attempt) => {
          if (attempt.ok) return
          setPhase(attempt.limited ? 'limited' : 'checking')
          if (attempt.siteKey !== undefined || attempt.limited) setGate({ ...at, trigger: link, siteKey: attempt.siteKey ?? '' })
          else window.location.assign(profile.resume)
        })
        // offline, or something unexpected: let the browser try it the plain way
        .catch(() => window.location.assign(profile.resume))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const close = (restoreFocus = false) => {
    const el = panel.current
    const closing = gate
    const done = () => {
      setGate((current) => (current === closing ? null : current))
      if (restoreFocus) closing?.trigger.focus()
    }
    if (!el || prefersReducedMotion()) return done()
    gsap.to(el, { autoAlpha: 0, y: -4, duration: 0.22, ease: 'power2.in', onComplete: done })
  }

  // the check: Turnstile's widget, then the pass, then the download
  useEffect(() => {
    if (!gate || phase !== 'checking' || !gate.siteKey) return
    let id: string | undefined
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: gate.siteKey,
          action: 'resume',
          theme: 'dark',
          size: 'flexible',
          callback: (token: string) => {
            setPhase('saving')
            fetch('/api/pass', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token }) })
              .then((res) => (res.ok ? download() : Promise.reject(new Error('no pass'))))
              .then((attempt) => (attempt.ok ? close() : setPhase(attempt.limited ? 'limited' : 'failed')))
              .catch(() => setPhase('failed'))
          },
          'error-callback': () => setPhase('failed'),
        })
      })
      .catch(() => setPhase('failed'))
    return () => {
      cancelled = true
      if (id) window.turnstile?.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, phase])

  // placement, then the reveal: the panel unfolds from its edge nearest the link
  useLayoutEffect(() => {
    const el = panel.current
    if (!gate || !el) return
    const width = Math.min(WIDTH, window.innerWidth - 24)
    const h = el.offsetHeight
    const below = gate.bottom + GAP + h <= window.innerHeight - 12
    const left = Math.min(Math.max(12, gate.x - width / 2), window.innerWidth - width - 12)
    const top = below ? gate.bottom + GAP : Math.max(12, gate.top - GAP - h)
    gsap.set(el, { width, left, top, autoAlpha: 1, y: 0 })
    el.focus({ preventScroll: true })
    if (prefersReducedMotion()) return
    const from = below ? 'inset(0% 0% 100% 0% round 18px)' : 'inset(100% 0% 0% 0% round 18px)'
    gsap.fromTo(el, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', duration: 0.5, ease: EASE.rise })
  }, [gate])

  // dismiss: a press outside, Escape, scrolling or resizing
  useEffect(() => {
    if (!gate) return
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close(true)
    }
    const onAway = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    const onResize = () => close()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onAway, { passive: true })
    window.addEventListener('touchmove', onAway, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onAway)
      window.removeEventListener('touchmove', onAway)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate])

  if (!gate) return null
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Quick check before the résumé"
      tabIndex={-1}
      className="invisible fixed z-[70] rounded-[18px] bg-[var(--menu-bg)] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 outline-none backdrop-blur-xl"
      style={{ left: 0, top: 0 }}
    >
      <p className="mono-label text-[10px] text-muted">Résumé</p>
      <p className="mt-2 font-serif text-[1.35rem] leading-[1.1] text-fg">A quick check first</p>
      <p aria-live="polite" className="mt-2 text-[12.5px] leading-[1.55] text-soft">
        {MESSAGES[phase]}
      </p>
      {phase === 'checking' && gate.siteKey && <div ref={box} className="mt-3 min-h-[65px]" />}
    </div>
  )
}
