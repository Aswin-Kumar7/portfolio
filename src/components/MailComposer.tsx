import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Mail } from 'lucide-react'
import { BrandIcon } from './BrandIcon'
import { EASE, gsap, prefersReducedMotion } from '../lib/gsap'
import { track } from '../lib/analytics'
import { profile } from '../data/resume'

/*
 * "Write to me" without the mailto: roulette. Every email link on the page still points at
 * mailto: (it works without JavaScript and crawlers read the address), but a click opens this
 * small menu instead: Gmail, Outlook, or the device's own mail app, each with the link's subject
 * and a greeting already filled in.
 *
 * On a computer, Gmail and Outlook open their compose page in a new tab. On a phone or tablet
 * they open the Gmail or Outlook app itself; if it isn't installed, their web compose page.
 */

interface Draft {
  to: string
  subject: string
  /** Where the menu points from, in viewport pixels. */
  x: number
  top: number
  bottom: number
  trigger: HTMLElement
}

type Device = 'ios' | 'android' | 'desktop'

/** iPadOS reports itself as a Mac, so a Mac with a touch screen is counted as iOS. */
function device(): Device {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return 'desktop'
}

const WIDTH = 272
const GAP = 10

const enc = encodeURIComponent // %20 for spaces: Outlook turns "+" into "++" for signed-out visitors
/** The message starts with a greeting, so writing it is one step shorter. */
const BODY = `Hi ${profile.firstName},\n\n`
const query = (d: Draft) => `subject=${enc(d.subject)}&body=${enc(BODY)}`

/**
 * Android: an intent for the app's compose screen (a mailto: SENDTO aimed at its package); Chrome
 * opens `fallback` instead when the app isn't installed.
 */
const androidApp = (d: Draft, pkg: string, fallback: string) =>
  `intent:${d.to}?${query(d)}#Intent;scheme=mailto;action=android.intent.action.SENDTO;package=${pkg};S.browser_fallback_url=${enc(fallback)};end`

interface Provider {
  id: 'gmail' | 'outlook' | 'app'
  label: string
  hint: Record<Device, string>
  icon: ReactNode
  /** The web address: what the link points at, and where a phone without the app ends up. */
  web: (d: Draft) => string
  /** The app on a phone or tablet. */
  app?: (d: Draft, on: Exclude<Device, 'desktop'>) => string
}

const providers: Provider[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    hint: { desktop: 'New message in Gmail', ios: 'Opens the Gmail app', android: 'Opens the Gmail app' },
    icon: <BrandIcon slug="gmail" className="size-[18px] text-[#ea4335]" />,
    web: (d) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(d.to)}&su=${enc(d.subject)}&body=${enc(BODY)}`,
    app: (d, on) =>
      on === 'ios' ? `googlegmail://co?to=${enc(d.to)}&${query(d)}` : androidApp(d, 'com.google.android.gm', providers[0]!.web(d)),
  },
  {
    id: 'outlook',
    label: 'Outlook',
    hint: { desktop: 'New message in Outlook', ios: 'Opens the Outlook app', android: 'Opens the Outlook app' },
    // a plain tile in Outlook's blue: Microsoft's marks aren't redistributed
    icon: <span className="grid size-[18px] place-items-center rounded-[4px] bg-[#0078d4] text-[11px] leading-none font-bold text-white">O</span>,
    web: (d) => `https://outlook.office.com/mail/deeplink/compose?to=${enc(d.to)}&${query(d)}`,
    app: (d, on) =>
      on === 'ios' ? `ms-outlook://compose?to=${enc(d.to)}&${query(d)}` : androidApp(d, 'com.microsoft.office.outlook', providers[1]!.web(d)),
  },
  {
    id: 'app',
    label: 'Mail app',
    hint: { desktop: 'Your default email app', ios: 'Your default email app', android: 'Your default email app' },
    icon: <Mail size={17} strokeWidth={1.7} className="text-ice" />,
    web: (d) => `mailto:${d.to}?${query(d)}`,
  },
]

/**
 * Opens the app on a phone. iOS can't tell a page whether an app is installed, so if the page is
 * still showing a moment later (no app took over), it goes to the web compose page instead.
 */
function openApp(provider: Provider, d: Draft, on: Exclude<Device, 'desktop'>) {
  const url = provider.app!(d, on)
  if (on === 'ios') {
    const fallback = window.setTimeout(() => {
      if (!document.hidden) window.location.href = provider.web(d)
    }, 1500)
    document.addEventListener('visibilitychange', () => window.clearTimeout(fallback), { once: true })
  }
  window.location.href = url
}

function Item({ provider, draft, on, onPick }: { provider: Provider; draft: Draft; on: Device; onPick: () => void }) {
  const external = provider.id !== 'app'
  return (
    <a
      role="menuitem"
      data-compose-item
      href={provider.web(draft)}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      onClick={(e) => {
        // phones and tablets: the app, not a browser tab
        if (on !== 'desktop' && provider.app) {
          e.preventDefault()
          openApp(provider, draft, on)
        }
        onPick()
      }}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors duration-300 hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10">{provider.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-fg">{provider.label}</span>
        <span className="block text-[12px] text-muted">{provider.hint[on]}</span>
      </span>
      <ArrowUpRight size={15} className="shrink-0 text-muted transition-[color,translate] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ice" />
    </a>
  )
}

export function MailComposer() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  // every mailto: link on the page opens the menu (a modified click still gets the default)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="mailto:"]')
      if (!link || link.closest('[data-compose]')) return
      e.preventDefault()
      const url = new URL(link.href)
      const rect = link.getBoundingClientRect()
      // a small button: point from it; a whole card: point from where it was clicked
      const small = rect.width < 320
      const x = small ? rect.left + rect.width / 2 : e.clientX || rect.left + rect.width / 2
      const y = small ? rect : { top: (e.clientY || rect.top) - 8, bottom: (e.clientY || rect.bottom) + 8 }
      setDraft({ to: decodeURIComponent(url.pathname), subject: url.searchParams.get('subject') ?? '', x, top: y.top, bottom: y.bottom, trigger: link })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const close = (restoreFocus = false) => {
    const el = panel.current
    const closing = draft
    // only clear the menu being closed: a click on another email link may have opened a new one
    const done = () => {
      setDraft((current) => (current === closing ? null : current))
      if (restoreFocus) closing?.trigger.focus()
    }
    if (!el || prefersReducedMotion()) return done()
    gsap.to(el, { autoAlpha: 0, y: -4, duration: 0.22, ease: 'power2.in', onComplete: done })
  }

  // placement, then the reveal: the panel unfolds from its edge nearest the button
  useLayoutEffect(() => {
    const el = panel.current
    if (!draft || !el) return
    const h = el.offsetHeight
    const below = draft.bottom + GAP + h <= window.innerHeight - 12
    const left = Math.min(Math.max(12, draft.x - WIDTH / 2), window.innerWidth - WIDTH - 12)
    const top = below ? draft.bottom + GAP : Math.max(12, draft.top - GAP - h)
    gsap.set(el, { left, top, autoAlpha: 1, y: 0 })
    el.querySelector<HTMLElement>('[data-compose-item]')?.focus({ preventScroll: true })
    if (prefersReducedMotion()) return
    const from = below ? 'inset(0% 0% 100% 0% round 18px)' : 'inset(100% 0% 0% 0% round 18px)'
    gsap.fromTo(el, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', duration: 0.5, ease: EASE.rise })
    gsap.fromTo(el.querySelectorAll('[data-compose-row]'), { y: below ? -6 : 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.05, ease: EASE.rise, delay: 0.06 })
  }, [draft])

  // dismiss: outside press, Escape, scrolling or resizing; arrows move between the options
  useEffect(() => {
    if (!draft) return
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('[data-compose-item]') ?? [])]
      const at = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // handled here, so the section stepper doesn't also move the page
        e.preventDefault()
        items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      } else if (e.key === 'Tab' && !panel.current?.contains(document.activeElement)) {
        close()
      }
    }
    const onAway = () => close()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onAway, { passive: true })
    window.addEventListener('touchmove', onAway, { passive: true })
    window.addEventListener('resize', onAway)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onAway)
      window.removeEventListener('touchmove', onAway)
      window.removeEventListener('resize', onAway)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  if (!draft) return null
  const on = device()
  return (
    <div
      ref={panel}
      data-compose
      role="menu"
      aria-label="Write an email"
      className="invisible fixed z-[70] rounded-[18px] bg-[var(--menu-bg)] p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/12 backdrop-blur-xl"
      style={{ width: WIDTH, left: 0, top: 0 }}
    >
      <p data-compose-row className="mono-label px-3 pt-2.5 pb-1.5 text-[10px] text-muted">
        Write with
      </p>
      {providers.map((p) => (
        <div key={p.id} data-compose-row>
          <Item
            provider={p}
            draft={draft}
            on={on}
            onPick={() => {
              track('mail_compose', { label: p.id })
              close()
            }}
          />
        </div>
      ))}
      <p data-compose-row className="truncate px-3 pt-1.5 pb-2 text-[11.5px] text-muted">
        to {draft.to}
      </p>
    </div>
  )
}
