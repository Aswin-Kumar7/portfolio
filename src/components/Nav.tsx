import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Mail, Menu, X } from 'lucide-react'
import { nav, profile } from '../data/resume'
import { cn } from '../lib/cn'
import { EASE, gsap, prefersReducedMotion, useGSAP } from '../lib/gsap'

const SLANT = 13
const RADIUS = 16

/** The hanging tab: slanted shoulders at the top edge, rounded bottom corners. */
function tabPath(w: number, h: number, closed: boolean) {
  const len = Math.hypot(SLANT, h)
  const kx = (SLANT * RADIUS) / len
  const ky = (h * RADIUS) / len
  const d = [
    `M0 0`,
    `L${SLANT - kx} ${h - ky}`,
    `Q${SLANT} ${h} ${SLANT + RADIUS} ${h}`,
    `L${w - SLANT - RADIUS} ${h}`,
    `Q${w - SLANT} ${h} ${w - SLANT + kx} ${h - ky}`,
    `L${w} 0`,
  ].join(' ')
  return closed ? `${d} Z` : d
}

function useActiveSection() {
  const [active, setActive] = useState<string>('home')
  useEffect(() => {
    const ids = [...nav.map((n) => n.id), 'contact']
    let raf = 0
    const update = () => {
      raf = 0
      const line = window.innerHeight * 0.45
      let current = 'home'
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return active
}

export function Nav() {
  const tabRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const active = useActiveSection()

  useLayoutEffect(() => {
    const el = tabRef.current
    if (!el) return
    // Measure the border box: contentRect excludes the padding, which made the
    // drawn tab narrower than the real one and left the buttons hanging outside it.
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Mobile menu: a slow curtain (clip-path) with the links rising in sequence.
  useGSAP(
    () => {
      const menu = menuRef.current
      if (!menu) return
      const items = menu.querySelectorAll('[data-menu-item]')
      const fast = prefersReducedMotion()
      if (open) {
        gsap
          .timeline()
          .set(menu, { visibility: 'visible' })
          .fromTo(
            menu,
            { clipPath: 'inset(0% 0% 100% 0% round 16px)' },
            { clipPath: 'inset(0% 0% 0% 0% round 16px)', duration: fast ? 0 : 0.9, ease: EASE.cine },
          )
          .fromTo(
            items,
            { yPercent: 60, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: fast ? 0 : 0.9, stagger: 0.06, ease: EASE.rise },
            fast ? 0 : 0.25,
          )
      } else {
        gsap
          .timeline()
          .to(menu, { clipPath: 'inset(0% 0% 100% 0% round 16px)', duration: fast ? 0 : 0.6, ease: 'power3.in' })
          .set(menu, { visibility: 'hidden' })
      }
    },
    { dependencies: [open] },
  )

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <div
        ref={tabRef}
        data-nav-tab
        className="pointer-events-auto relative flex h-[60px] items-center gap-1 pr-[22px] pl-[20px] md:h-[64px] md:gap-2 md:pr-[26px] md:pl-[24px]"
      >
        {size.w > 0 && (
          <svg
            aria-hidden
            className="absolute inset-0 -z-10 overflow-visible"
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
          >
            <path
              d={tabPath(size.w, size.h, true)}
              className="transition-[fill] duration-700"
              style={{ fill: scrolled || open ? 'var(--nav-fill-solid)' : 'var(--nav-fill)' }}
            />
            <path
              d={tabPath(size.w, size.h, false)}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 backdrop-blur-md"
          style={{ clipPath: size.w ? `path('${tabPath(size.w, size.h, true)}')` : undefined }}
        />

        <a href="#home" className="shrink-0 rounded-full" aria-label="Back to top">
          <img
            src={profile.avatar}
            alt=""
            width={34}
            height={34}
            className="size-[34px] rounded-full object-cover ring-1 ring-white/25"
          />
        </a>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center">
            {nav.map((item) => {
              const isActive = active === item.id
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'mono-label relative block rounded-full px-3.5 py-2 text-[11.5px] transition-colors duration-500',
                      isActive ? 'text-white' : 'text-[var(--nav-link)] hover:text-white',
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute -bottom-0.5 left-1/2 h-px -translate-x-1/2 bg-ice shadow-[0_0_8px_rgb(var(--ice-rgb))] transition-[width,opacity] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]',
                        isActive ? 'w-4 opacity-100' : 'w-0 opacity-0',
                      )}
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <button
          type="button"
          className="mono-label flex items-center gap-2 rounded-full px-3 py-2 text-[11.5px] text-soft md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={15} /> : <Menu size={15} />}
          {open ? 'Close' : 'Menu'}
        </button>

        <a
          href="#contact"
          aria-label="Contact"
          title="Contact"
          className="btn btn-dark btn-icon ml-1 !size-9 shrink-0"
          data-track="contact_click"
          data-track-label="nav"
        >
          <Mail size={15} strokeWidth={1.8} />
        </a>
      </div>

      <div
        ref={menuRef}
        id="mobile-menu"
        className="pointer-events-auto invisible absolute top-[70px] w-[min(92vw,360px)] rounded-2xl border border-white/10 bg-[var(--menu-bg)] p-2 shadow-2xl backdrop-blur-xl md:hidden"
        style={{ clipPath: 'inset(0% 0% 100% 0% round 16px)' }}
      >
        <ul>
          {[...nav, { id: 'contact', label: 'Contact' }].map((item) => (
            <li key={item.id} data-menu-item>
              <a
                href={`#${item.id}`}
                onClick={() => setOpen(false)}
                className={cn(
                  'mono-label flex items-center justify-between rounded-xl px-4 py-3.5 text-[12px]',
                  active === item.id ? 'bg-white/[0.06] text-white' : 'text-[var(--nav-link)]',
                )}
              >
                {item.label}
                {active === item.id && <span className="size-1.5 rounded-full bg-ice" />}
              </a>
            </li>
          ))}
        </ul>
        <div data-menu-item>
          <a href={profile.resume} download className="btn btn-glow mt-2 w-full" data-track="resume_download" data-track-label="menu" onClick={() => setOpen(false)}>
            <Download size={14} /> Download resume
          </a>
        </div>
      </div>
    </header>
  )
}
