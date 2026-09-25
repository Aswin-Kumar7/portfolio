import { useRef, type ReactNode } from 'react'
import { ArrowUpRight, FileText, Mail } from 'lucide-react'
import { BrandIcon } from '../components/BrandIcon'
import { ButtonLink, ButtonPair, IconLink } from '../components/Button'
import { ScriptLabel } from '../components/SplitHeading'
import { EASE, MQ, gsap, useGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { profile } from '../data/resume'

const HEADLINE = 'Let’s build something people remember.'

function ContactLink({
  href,
  icon,
  label,
  value,
  download,
}: {
  href: string
  icon: ReactNode
  label: string
  value: string
  download?: boolean
}) {
  const external = /^https?:/.test(href)
  return (
    <li data-link>
      <a
        href={href}
        download={download || undefined}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        data-track="contact_link"
        data-track-label={label}
        className="card group flex h-full items-center gap-3.5 p-4 text-left transition-colors duration-700 hover:border-accent/40 hover:bg-[var(--chip-hover)]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--chip-bg)] text-soft ring-1 ring-white/10 transition-colors duration-700 group-hover:text-white">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mono-label block text-[10px] text-muted">{label}</span>
          <span className="mt-1 block truncate font-serif text-[1.08rem] text-fg">{value}</span>
        </span>
        <ArrowUpRight
          size={15}
          className="shrink-0 text-muted transition-all duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ice"
        />
      </a>
    </li>
  )
}

export function Contact() {
  const root = useRef<HTMLElement>(null)
  const mailto = `mailto:${profile.email}`

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // Outlined display type fills in, word by word, with the scroll.
        const words = q('[data-fill]')
        const [r, g, b] = gsap.utils.splitColor(getComputedStyle(document.documentElement).getPropertyValue('--color-fg').trim())
        const fill = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: q('[data-outline]')[0], start: 'top 80%', end: 'bottom 38%', scrub: 1.2 },
        })
        words.forEach((w, i) =>
          fill.fromTo(w, { color: `rgba(${r},${g},${b},0)`, yPercent: 18 }, { color: `rgba(${r},${g},${b},1)`, yPercent: 0, duration: 1 }, i * 0.45),
        )

        gsap.fromTo(
          q('[data-after]'),
          { y: 40, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 1.8,
            stagger: 0.14,
            ease: EASE.rise,
            scrollTrigger: { trigger: q('[data-after]')[0], start: 'top 90%', once: true },
          },
        )

      })
      // desktop: this section is one screen, and a resting point for the section stepper
      mm.add(MQ.desktop, () => sectionStops(root.current!))
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="contact" ref={root} aria-labelledby="contact-title" className="relative lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center">

      <div className="px-5 pt-24 pb-24 text-center sm:px-8 md:pt-36 md:pb-32 lg:py-[clamp(3rem,7svh,6rem)]">
        <ScriptLabel className="inline-block">Get in touch</ScriptLabel>
        <h2
          id="contact-title"
          data-outline
          className="mx-auto mt-3 max-w-[11em] font-serif text-[clamp(2.9rem,min(1.4rem+6.2vw,11.5svh),7.4rem)] leading-[0.98] tracking-[-0.025em] text-balance text-fg [-webkit-text-stroke:1px_color-mix(in_srgb,var(--color-fg)_42%,transparent)]"
        >
          {HEADLINE.split(' ').map((w, i, all) => (
            <span key={i} className="inline-block">
              <span data-fill className="inline-block">
                {w}
              </span>
              {i < all.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h2>
        <p data-after className="mx-auto mt-7 max-w-[46ch] text-[15px] leading-[1.6] text-muted">
          Hiring for a role, shaping a product, or forming a hackathon team? My inbox is always open.
        </p>
        <div data-after className="mt-9 flex justify-center">
          <ButtonPair>
            <ButtonLink variant="glow" href={mailto} data-track="contact_click" data-track-label="contact">
              Say hello
            </ButtonLink>
            <IconLink variant="glow" href={mailto} label={`Email ${profile.firstName}`}>
              <Mail size={17} strokeWidth={1.8} />
            </IconLink>
          </ButtonPair>
        </div>
        <ul data-after className="mx-auto mt-14 grid max-w-[760px] gap-2.5 sm:grid-cols-2 lg:mt-[clamp(1.75rem,5svh,3.5rem)]">
          <ContactLink href={mailto} icon={<Mail size={17} strokeWidth={1.6} />} label="Email" value={profile.email} />
          <ContactLink href={profile.linkedin} icon={<BrandIcon slug="linkedin" className="size-4" />} label="LinkedIn" value="in/aswinkumar7" />
          <ContactLink href={profile.github} icon={<BrandIcon slug="github" className="size-4" />} label="GitHub" value="@Aswin-Kumar7" />
          <ContactLink href={profile.resume} download icon={<FileText size={17} strokeWidth={1.6} />} label="Resume" value="Download PDF" />
        </ul>
      </div>

    </section>
  )
}
