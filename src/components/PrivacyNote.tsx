import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { EASE, gsap, prefersReducedMotion } from '../lib/gsap'
import { onTrackingChange, setTrackingOff, trackingOff } from '../lib/consent'
import { profile } from '../data/resume'

/*
 * The footer's privacy note: what the analytics collect and why, who handles it, a switch that
 * turns them off in this browser, and how to have your data deleted. It opens above its button,
 * the way the email menu does.
 */

const collected = [
  'Rough location and IP address',
  'Device, browser, screen size and language',
  'Pages and files requested, time on the site, scrolling and clicks, and replays of the visit',
]

const GAP = 12

export function PrivacyNote() {
  const [open, setOpen] = useState(false)
  const off = useSyncExternalStore(onTrackingChange, trackingOff, () => false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (restoreFocus = false) => {
    const el = panel.current
    const done = () => {
      setOpen(false)
      if (restoreFocus) button.current?.focus()
    }
    if (!el || prefersReducedMotion()) return done()
    gsap.to(el, { autoAlpha: 0, y: 6, duration: 0.25, ease: 'power2.in', onComplete: done })
  }

  // placement above the button, then the reveal: the note unfolds upward from its bottom edge
  useLayoutEffect(() => {
    const el = panel.current
    const anchor = button.current
    if (!open || !el || !anchor) return
    const r = anchor.getBoundingClientRect()
    const width = Math.min(380, window.innerWidth - 24)
    gsap.set(el, {
      width,
      left: Math.min(Math.max(12, r.left - 12), window.innerWidth - width - 12),
      bottom: window.innerHeight - r.top + GAP,
      autoAlpha: 1,
      y: 0,
    })
    // a short landscape screen: the note scrolls inside instead of running off the top
    el.style.maxHeight = `${Math.max(220, r.top - GAP - 12)}px`
    el.focus({ preventScroll: true })
    if (prefersReducedMotion()) return
    gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0% round 20px)' }, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 0.6, ease: EASE.rise })
    gsap.fromTo(el.querySelectorAll('[data-privacy-row]'), { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, stagger: 0.05, ease: EASE.rise, delay: 0.08 })
  }, [open])

  // dismiss: a press or focus outside, Escape, scrolling the page or resizing
  useEffect(() => {
    if (!open) return
    // the email menu opened from the note's delete link belongs to it
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (!!panel.current?.contains(t) || !!button.current?.contains(t) || !!(t instanceof Element && t.closest('[data-compose]')))
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close()
    }
    const onFocus = (e: FocusEvent) => {
      if (!inside(e.target)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close(true)
    }
    const onAway = (e: Event) => {
      if (!inside(e.target)) close()
    }
    const onResize = () => close()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onAway, { passive: true })
    window.addEventListener('touchmove', onAway, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onAway)
      window.removeEventListener('touchmove', onAway)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className="mono-label text-[10px] text-muted underline decoration-white/20 underline-offset-4 transition-colors duration-500 hover:text-white hover:decoration-ice"
      >
        Privacy
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            data-lenis-prevent
            className="invisible fixed z-[65] overflow-y-auto overscroll-contain rounded-[20px] bg-[var(--menu-bg)] p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 outline-none backdrop-blur-xl sm:p-6"
          >
            <p data-privacy-row className="mono-label text-[10px] text-muted">
              Privacy
            </p>
            <h3 id={`${id}-title`} data-privacy-row className="mt-3 font-serif text-[1.65rem] leading-[1.05] text-fg">
              What this site collects
            </h3>
            <p data-privacy-row className="mt-3 text-[13.5px] leading-[1.65] text-soft">
              I keep light analytics to see how people find this site and what they look at. That&rsquo;s the only reason:
              nothing is sold, used for ads or shared with anyone.
            </p>
            <ul data-privacy-row className="mt-4 space-y-2">
              {collected.map((item) => (
                <li key={item} className="flex gap-3 text-[13px] leading-[1.5] text-soft">
                  <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-ice/80" />
                  {item}
                </li>
              ))}
            </ul>
            <p data-privacy-row className="mt-4 text-[12px] leading-[1.6] text-muted">
              It&rsquo;s handled only by the tools the analytics run on: Vercel, Upstash, Microsoft Clarity and Discord.
            </p>
            <div data-privacy-row className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button type="button" onClick={() => setTrackingOff(!off)} className="btn btn-dark !h-10 !px-4 !text-[11px]">
                {off ? 'Turn back on' : 'Turn off analytics'}
              </button>
              <a
                href={`mailto:${profile.email}?subject=${encodeURIComponent('Delete my visit data')}`}
                className="text-[12.5px] text-soft underline decoration-white/25 underline-offset-4 transition-colors duration-500 hover:text-white hover:decoration-ice"
              >
                Ask me to delete yours
              </a>
            </div>
            <p data-privacy-row aria-live="polite" className="mt-3 min-h-[1.2em] text-[12px] text-muted">
              {off ? 'Off in this browser: nothing more is collected here.' : ''}
            </p>
          </div>,
          document.body,
        )}
    </>
  )
}
