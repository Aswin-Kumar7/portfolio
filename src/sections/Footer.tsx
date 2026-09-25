import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Download } from 'lucide-react'
import { BrandIcon } from '../components/BrandIcon'
import { HeroScene } from './Hero'
import { EASE, MQ, SplitText, gsap, useGSAP } from '../lib/gsap'
import { nav, profile } from '../data/resume'
import type { SceneControls } from '../three/state'

const footerControls: SceneControls = { intro: { v: 0 }, scroll: { v: 0 } }

function LocalTime() {
  const format = () =>
    new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date())
  const [time, setTime] = useState(format)
  useEffect(() => {
    const id = window.setInterval(() => setTime(format()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular-nums">{time}</span>
}

function FooterLink({ href, children, external, download }: { href: string; children: React.ReactNode; external?: boolean; download?: boolean }) {
  return (
    <a
      href={href}
      download={download || undefined}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      data-track={external || download ? 'footer_link' : undefined}
      data-track-label={typeof children === 'string' ? children : undefined}
      className="group relative inline-flex items-center gap-1.5 py-1 font-serif text-[1.15rem] leading-none text-soft transition-colors duration-500 hover:text-fg sm:text-[1.35rem] 3xl:text-[1.6rem]"
    >
      <span className="relative">
        {children}
        <span className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-ice transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] group-hover:origin-left group-hover:scale-x-100" />
      </span>
      {external && (
        <ArrowUpRight size={15} className="text-muted transition-all duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ice" />
      )}
      {download && <Download size={14} className="text-muted transition-colors duration-700 group-hover:text-ice" />}
    </a>
  )
}

export function Footer() {
  const root = useRef<HTMLElement>(null)
  const year = new Date().getFullYear()
  const shortName = profile.name.split(' ').slice(0, 2).join(' ')

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const stage = q('[data-stage]')[0]!
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // the columns rise in; the scene dawns and the name climbs over the horizon as you reach the end
        gsap.fromTo(
          q('[data-col]'),
          { y: 44, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 1.7, stagger: 0.12, ease: EASE.rise, scrollTrigger: { trigger: root.current, start: 'top 82%', once: true } },
        )
        gsap.fromTo(
          footerControls.intro,
          { v: 0 },
          { v: 1, ease: 'none', scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom bottom', scrub: 1.2 } },
        )
        SplitText.create(q('[data-wordmark]')[0]!, {
          type: 'chars',
          mask: 'chars',
          charsClass: 'split-char',
          autoSplit: true,
          onSplit: (self) =>
            gsap.fromTo(
              self.chars,
              { yPercent: 140, y: 0 },
              {
                yPercent: 0,
                y: 0,
                ease: 'none',
                stagger: 0.05,
                scrollTrigger: { trigger: stage, start: 'top 80%', end: 'bottom bottom', scrub: 1.4 },
              },
            ),
        })
      })
      mm.add(MQ.reduce, () => {
        footerControls.intro.v = 1
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  const columnTitle = 'mono-label mb-3 block text-[10px] text-muted sm:mb-5'

  return (
    <footer ref={root} aria-labelledby="footer-title" className="relative grid min-h-[100svh] grid-rows-[auto_minmax(140px,1fr)_auto] overflow-hidden border-t border-line bg-ink sm:grid-rows-[auto_minmax(180px,1fr)_auto]">
      <h2 id="footer-title" className="sr-only">
        Site footer
      </h2>

      {/* ---- columns ------------------------------------------------------ */}
      <div className="relative z-20 mx-[var(--gutter)] grid grid-cols-2 gap-x-6 gap-y-5 px-5 pt-10 pb-4 sm:gap-x-8 sm:gap-y-10 sm:px-8 sm:pt-16 sm:pb-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-12 lg:pt-20 3xl:pt-24">
        <div data-col className="col-span-2 max-w-[26rem] sm:col-span-1">
          <div className="flex items-center gap-3">
            <img src={profile.avatar} alt="" className="size-10 rounded-full object-cover ring-1 ring-white/20" />
            <span className="font-serif text-[1.5rem] leading-none text-fg">{profile.name}</span>
          </div>
          <p className="mt-5 hidden text-[14px] leading-[1.7] text-muted sm:block">
            Full-stack, mobile &amp; AI developer building fast, thoughtful products — from {profile.location.split(',')[0]} to anywhere.
          </p>
          <p className="mono-label mt-4 inline-flex items-center gap-2 rounded-full sm:mt-6 border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-soft">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            Open to SDE roles &amp; internships
          </p>
        </div>

        <nav data-col aria-label="Footer">
          <span className={columnTitle}>Navigate</span>
          <ul className="space-y-1.5 sm:space-y-3">
            {[...nav, { id: 'contact', label: 'Contact' }].map((n) => (
              <li key={n.id}>
                <FooterLink href={`#${n.id}`}>{n.label}</FooterLink>
              </li>
            ))}
          </ul>
        </nav>

        <div data-col>
          <span className={columnTitle}>Elsewhere</span>
          <ul className="space-y-1.5 sm:space-y-3">
            <li>
              <FooterLink href={profile.github} external>
                GitHub
              </FooterLink>
            </li>
            <li>
              <FooterLink href={profile.linkedin} external>
                LinkedIn
              </FooterLink>
            </li>
            <li>
              <FooterLink href={`mailto:${profile.email}`} external>
                Email
              </FooterLink>
            </li>
            <li>
              <FooterLink href={profile.resume} download>
                Resume
              </FooterLink>
            </li>
          </ul>
        </div>

        <div data-col className="col-span-2 sm:col-span-1">
          <span className={columnTitle}>Local time</span>
          <div className="flex items-end justify-between gap-4 sm:block">
            <div>
              <p className="font-serif text-[2rem] leading-none text-fg sm:text-[2.4rem] 3xl:text-[2.8rem]">
                <LocalTime />
              </p>
              <p className="mono-label mt-3 text-[10px] text-muted">{profile.location} · IST</p>
            </div>
            <p className="mt-6 hidden text-[13px] leading-[1.6] text-muted sm:block">Usually replies within a day.</p>
            <div className="flex gap-2 sm:mt-6">
              <a
                href={profile.github}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="btn btn-dark btn-icon !size-10"
              >
                <BrandIcon slug="github" className="size-4" />
              </a>
              <a
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="btn btn-dark btn-icon !size-10"
              >
                <BrandIcon slug="linkedin" className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ---- stage: takes whatever height the screen has left; the black hole dawns, the name floats over it ---- */}
      <div data-stage className="relative [container-type:size]">
        <div className="absolute inset-0 z-0">
          <HeroScene framing="footer" controls={footerControls} />
        </div>
        <div aria-hidden className="absolute inset-x-0 top-0 z-[1] h-[35%] bg-gradient-to-b from-ink to-transparent" />
        <p
          data-wordmark
          aria-hidden
          className={
            // tight leading + negative tracking: each letter's mask opens past its box (--mask-*)
            'pointer-events-none absolute inset-x-0 top-[8%] z-10 text-center font-serif text-[length:max(3rem,min(17cqw,36cqh))] leading-[0.8] tracking-[-0.035em] whitespace-nowrap text-white/85 [--mask-top:-0.3em] [--mask-bottom:-0.08em] [mask-image:linear-gradient(to_bottom,#000_30%,rgba(0,0,0,0.12))]'
          }
        >
          {shortName}
        </p>
      </div>

      {/* ---- bottom bar ---------------------------------------------------- */}
      <div className="relative z-20 mx-[var(--gutter)] flex items-center justify-between gap-4 border-t border-line px-5 py-4 sm:px-8 sm:py-6 lg:px-12">
        <p className="mono-label text-[10px] text-muted">
          © {year} {profile.name}
        </p>
        <p className="mono-label hidden text-[10px] text-dim md:block">Designed &amp; engineered with React, GSAP &amp; three.js</p>
        <a href="#home" className="group mono-label inline-flex items-center gap-3 text-[10px] text-soft transition-colors duration-500 hover:text-white">
          Back to top
          <span className="btn btn-dark btn-icon !size-9">
            <ArrowUp size={14} className="transition-transform duration-700 group-hover:-translate-y-0.5" />
          </span>
        </a>
      </div>
    </footer>
  )
}
