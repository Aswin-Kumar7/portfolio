import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy } from 'lucide-react'
import { EASE, gsap, prefersReducedMotion } from '../lib/gsap'
import { trackingOff } from '../lib/consent'
import { visitorId } from '../lib/visits'
import { profile } from '../data/resume'

/*
 * The footer's privacy note: what the analytics collect and why, who handles it, and how to have
 * your data deleted. It shows this browser's visitor id (the one each Discord alert is signed
 * with), so a deletion request can name exactly which visits are theirs. It opens above its
 * button, the way the email menu does.
 */

const collected = [
  'Rough location and IP address',
  'Device, browser, screen size and language',
  'Pages and files requested, time on the site, scrolling and clicks, and replays of the visit',
]

const GAP = 12

export function PrivacyNote() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
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
        onClick={() => {
          if (open) return close()
          setCopied(false)
          setOpen(true)
        }}
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
            <Deletion copied={copied} onCopied={() => setCopied(true)} />
          </div>,
          document.body,
        )}
    </>
  )
}

/** This browser's visitor id, to copy, and a deletion request that already names it. */
function Deletion({ copied, onCopied }: { copied: boolean; onCopied: () => void }) {
  // read when the note opens: by then the visit has started and the id exists
  const [id] = useState(visitorId)
  if (trackingOff()) {
    return (
      <p data-privacy-row className="mt-5 text-[12.5px] leading-[1.6] text-soft">
        Analytics are off in this browser, so nothing is collected here.
      </p>
    )
  }
  const subject = id ? `Delete my visit data (visitor ${id})` : 'Delete my visit data'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
    } catch {
      // clipboard blocked (http / old browser): fall back to a hidden selection
      const input = document.createElement('input')
      input.value = id
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    onCopied()
  }
  return (
    <div data-privacy-row className="mt-5 rounded-[14px] bg-white/[0.04] p-4 ring-1 ring-white/10">
      <p className="mono-label text-[10px] text-muted">Your visitor ID</p>
      {id ? (
        <div className="mt-2 flex items-center gap-2">
          <code className="font-mono text-[15px] tracking-[0.06em] text-fg">{id}</code>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Visitor ID copied' : 'Copy visitor ID'}
            title={copied ? 'Copied' : 'Copy'}
            className="grid size-7 place-items-center rounded-full text-muted ring-1 ring-white/10 transition-colors duration-300 hover:text-white"
          >
            {copied ? <Check size={13} className="text-ice" /> : <Copy size={13} />}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-soft">None: this browser doesn’t keep one.</p>
      )}
      <p className="mt-2 text-[12px] leading-[1.6] text-muted">
        {id
          ? 'It stays the same in this browser (a private window or another browser gets its own). Include it in a request and I’ll find and delete your visits.'
          : 'You can still ask: tell me roughly when you visited.'}
      </p>
      <a
        href={`mailto:${profile.email}?subject=${encodeURIComponent(subject)}`}
        className="mt-3 inline-block text-[12.5px] text-soft underline decoration-white/25 underline-offset-4 transition-colors duration-500 hover:text-white hover:decoration-ice"
      >
        Ask me to delete your data
      </a>
    </div>
  )
}
