import { Fragment, useRef, type ReactNode } from 'react'
import { ArrowDown, ArrowUpRight, FileText, Mail } from 'lucide-react'
import { BrandIcon } from '../components/BrandIcon'
import { CopyEmail } from '../components/CopyEmail'
import { ScriptLabel } from '../components/SplitHeading'
import { EASE, MQ, gsap, useLazyGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { profile } from '../data/resume'

const HEADLINE = 'Let’s build something people remember.'

const card =
  'relative overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10 transition-[background-color,box-shadow] duration-500 hover:bg-white/[0.055] hover:ring-accent/45 hover:shadow-[0_18px_50px_-24px_rgb(var(--accent-rgb)/0.6)]'

function Arrow({ download }: { download?: boolean }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full text-muted ring-1 ring-white/10 transition-colors duration-500 group-hover:bg-white/5 group-hover:text-ice">
      {download ? (
        <ArrowDown size={16} className="transition-transform duration-500 group-hover:translate-y-0.5" />
      ) : (
        <ArrowUpRight size={16} className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </span>
  )
}

/** A secondary way to reach me: icon, what it is, where it goes. */
function LinkCard({ href, icon, label, value, download }: { href: string; icon: ReactNode; label: string; value: string; download?: boolean }) {
  const external = /^https?:/.test(href)
  return (
    <a
      data-link
      href={href}
      download={download || undefined}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      data-track="contact_link"
      data-track-label={label}
      className={`group flex items-center gap-3.5 p-4 sm:p-5 ${card}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--chip-bg)] text-soft ring-1 ring-white/10 transition-colors duration-500 group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-medium tracking-[0.12em] text-muted uppercase">{label}</span>
        <span className="mt-1 block text-[15.5px] font-medium text-fg transition-colors duration-500 group-hover:text-ice">{value}</span>
      </span>
      <Arrow download={download} />
    </a>
  )
}

export function Contact() {
  const root = useRef<HTMLElement>(null)
  const mailto = `mailto:${profile.email}?subject=${encodeURIComponent(`Hello ${profile.firstName}`)}`

  useLazyGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // on arrival, in real time: the outlined headline fills word by word, then the directory rises
        const [r, g, b] = gsap.utils.splitColor(getComputedStyle(document.documentElement).getPropertyValue('--color-fg').trim())
        const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-outline]')[0], start: 'top 80%', toggleActions: 'play none none none' } })
        q('[data-fill]').forEach((w, i) =>
          tl.fromTo(
            w,
            { color: `rgba(${r},${g},${b},0)`, yPercent: 18 },
            { color: `rgba(${r},${g},${b},1)`, yPercent: 0, duration: 0.9, ease: 'power2.out' },
            i * 0.16,
          ),
        )
        tl.fromTo(q('[data-after]'), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.4, ease: EASE.rise }, 0.5)
        tl.fromTo(q('[data-link]'), { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.1, ease: EASE.rise }, 0.7)
      })
      // desktop: this section is one screen, and a resting point for the section stepper
      mm.add(MQ.desktop, () => sectionStops(root.current!))
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="contact" ref={root} aria-labelledby="contact-title" className="relative lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center">
      <div className="px-5 pt-24 pb-24 text-center sm:px-8 md:pt-36 md:pb-32 lg:pt-[max(4.5rem,7svh)] lg:pb-[clamp(1.5rem,7svh,6rem)]">
        <ScriptLabel className="inline-block">Get in touch</ScriptLabel>
        <h2
          id="contact-title"
          data-outline
          className="mx-auto mt-3 max-w-[11em] font-serif text-[clamp(2.9rem,min(1.4rem+6.2vw,11.5svh),7.4rem)] leading-[0.98] tracking-[-0.025em] text-balance text-fg [-webkit-text-stroke:1px_color-mix(in_srgb,var(--color-fg)_42%,transparent)]"
        >
          {/* the space sits between the word boxes: a trailing space inside an inline-block is dropped */}
          {HEADLINE.split(' ').map((w, i, all) => (
            <Fragment key={i}>
              <span className="inline-block">
                <span data-fill className="inline-block">
                  {w}
                </span>
              </span>
              {i < all.length - 1 ? ' ' : ''}
            </Fragment>
          ))}
        </h2>
        <p data-after className="mx-auto mt-6 max-w-[48ch] text-[15.5px] leading-[1.6] text-soft">
          Hiring for a role, shaping a product, or forming a hackathon team? Write to me — I reply within a day.
        </p>

        {/* email is the main way in; the other three sit in one aligned row beneath it */}
        <div className="mx-auto mt-10 grid w-full max-w-[880px] gap-3 text-left sm:grid-cols-3 lg:mt-[clamp(1.5rem,4.5svh,3.25rem)]">
          <div data-link className={`group sm:col-span-3 ${card}`}>
            {/* the whole card opens the mail app; the copy button sits above that link */}
            <a href={mailto} aria-label={`Email ${profile.firstName} at ${profile.email}`} data-track="contact_link" data-track-label="Email" className="absolute inset-0" />
            <div className="pointer-events-none relative flex items-center gap-4 p-5 sm:gap-5 sm:p-6">
              <span className="grid size-12 shrink-0 place-items-center rounded-full text-white shadow-[0_0_22px_-2px_rgb(var(--accent-rgb)/0.7)]" style={{ background: 'var(--glow-grad)' }}>
                <Mail size={20} strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-medium tracking-[0.12em] text-muted uppercase">Email</span>
                <span className="mt-1 block font-serif text-[clamp(1.35rem,1rem+1.25vw,2.15rem)] leading-tight [overflow-wrap:anywhere] text-fg transition-colors duration-500 group-hover:text-ice">
                  {profile.email}
                </span>
              </span>
              <span className="pointer-events-auto relative flex shrink-0 items-center gap-2">
                <CopyEmail email={profile.email} variant="dark" label="contact" />
                <a href={mailto} className="btn btn-glow hidden sm:inline-flex" data-track="contact_click" data-track-label="contact">
                  Write
                  <ArrowUpRight size={15} />
                </a>
              </span>
            </div>
          </div>
          <LinkCard href={profile.linkedin} icon={<BrandIcon slug="linkedin" className="size-[17px]" />} label="LinkedIn" value="in/aswinkumar7" />
          <LinkCard href={profile.github} icon={<BrandIcon slug="github" className="size-[17px]" />} label="GitHub" value="@Aswin-Kumar7" />
          <LinkCard href={profile.resume} download icon={<FileText size={18} strokeWidth={1.6} />} label="Resume" value="Download PDF" />
        </div>
      </div>
    </section>
  )
}
