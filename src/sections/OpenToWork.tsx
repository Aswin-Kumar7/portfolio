import { useRef } from 'react'
import { ArrowDown, ArrowUpRight, Mail } from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { ButtonLink, ButtonPair } from '../components/Button'
import { CopyEmail } from '../components/CopyEmail'
import { SectionHeader } from '../components/SectionHeader'
import { EASE, MQ, gsap, useLazyGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { openToWork, profile } from '../data/resume'
import type { Opportunity } from '../data/types'

/** One opening, laid out like a line on a departures board: when · what · go. */
function OpeningRow({ opening }: { opening: Opportunity }) {
  const { cta } = opening
  return (
    <li data-row className="flex-1 border-b border-white/[0.08] last:border-b-0">
      <a
        href={cta.href}
        download={cta.download || undefined}
        aria-label={`${opening.title}: ${cta.label}`}
        data-track="offer_cta"
        data-track-label={opening.title}
        className="group relative flex h-full items-center gap-5 px-6 py-7 transition-colors duration-700 hover:bg-white/[0.035] sm:gap-7 sm:px-9 lg:gap-5 lg:px-7 xl:gap-7 xl:px-10 short:py-5"
      >
        {/* a light line draws down the row's edge on hover */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-gradient-to-b from-ice to-accent transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] group-hover:scale-y-100" />
        <span className="mono-label hidden w-11 shrink-0 text-[11px] text-ice sm:block">{opening.when}</span>
        <span className="min-w-0 flex-1">
          {/* phones: the "when" sits above the title so the text gets the full width */}
          <span className="mono-label mb-2 block text-[10px] text-ice sm:hidden">{opening.when}</span>
          <span className="text-lift block font-serif text-[clamp(1.55rem,1.05rem+0.9vw,2.15rem)] leading-[1.05] text-fg">{opening.title}</span>
          <span className="text-lift mt-2.5 block max-w-[40ch] text-[13.5px] leading-[1.55] text-soft">{opening.detail}</span>
          <span className="mono-label mt-3.5 inline-block text-[10px] text-soft transition-colors duration-500 group-hover:text-white">
            {cta.label}
          </span>
        </span>
        <span className="btn btn-dark btn-icon !size-11 shrink-0 group-hover:shadow-[0_0_26px_-2px_rgb(var(--accent-rgb)/0.75)]">
          {/* gradients can't transition, so the glow is a layer that fades in */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            style={{ background: 'var(--glow-grad)' }}
          />
          {cta.download ? (
            <ArrowDown size={17} strokeWidth={1.8} className="relative transition-transform duration-700 group-hover:translate-y-0.5" />
          ) : (
            <ArrowUpRight size={17} strokeWidth={1.8} className="relative transition-transform duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          )}
        </span>
      </a>
    </li>
  )
}

export function OpenToWork() {
  const root = useRef<HTMLElement>(null)
  const mailto = `mailto:${profile.email}?subject=${encodeURIComponent(`Hello ${profile.firstName}, about an opportunity`)}`

  useLazyGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // the panel opens like a window onto the nebula (in real time, on arrival); its contents settle in after it
        gsap
          .timeline({
            defaults: { ease: EASE.cine, duration: 1.5 },
            scrollTrigger: { trigger: q('[data-invite]')[0], start: 'top 85%', toggleActions: 'play none none none' },
          })
          .fromTo(q('[data-invite]'), { y: 90, clipPath: 'inset(10% 5% 10% 5% round 18px)' }, { y: 0, clipPath: 'inset(0% 0% 0% 0% round 18px)' }, 0)
          .fromTo(q('[data-nebula]'), { scale: 1.15, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 2 }, 0.1)
        gsap.fromTo(
          q('[data-rise]'),
          { y: 28, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 1.6,
            stagger: 0.12,
            ease: EASE.rise,
            delay: 0.5,
            scrollTrigger: { trigger: q('[data-invite]')[0], start: 'top 85%', once: true },
          },
        )
        gsap.fromTo(
          q('[data-row]'),
          { x: 36, autoAlpha: 0 },
          {
            x: 0,
            autoAlpha: 1,
            duration: 1.5,
            stagger: 0.16,
            ease: EASE.rise,
            delay: 0.7,
            scrollTrigger: { trigger: q('[data-invite]')[0], start: 'top 85%', once: true },
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
    <section
      id="open-to-work"
      ref={root}
      aria-labelledby="work-title"
      className="relative flex flex-col justify-center border-b border-line px-4 py-24 sm:px-8 md:py-28 lg:min-h-[100svh] lg:pt-[max(4.5rem,6svh)] lg:pb-[clamp(1.5rem,5svh,6rem)]"
    >
      <SectionHeader
        id="work-title"
        label="Open to work"
        // two lines ("Opportunities I’m ready / to take on right now"); one on short screens
        titleClassName="mx-auto max-w-[8.3em] short:max-w-none"
        className="tight:[zoom:0.9] tighter:[zoom:0.82]"
        title="Opportunities I’m ready to take on right now"
      />

      <div
        data-invite
        className="relative mx-auto mt-12 w-full max-w-[1120px] overflow-hidden rounded-[18px] bg-panel ring-1 ring-white/10 md:mt-14 lg:mt-[clamp(1.25rem,3.5svh,3.5rem)] tight:[zoom:0.9] tighter:[zoom:0.82]"
      >
        {/* nebula glowing in from the right, fading out behind the pitch */}
        <div
          data-nebula
          aria-hidden
          className="absolute inset-y-0 right-0 w-full [mask-image:linear-gradient(180deg,#000,transparent_85%)] lg:w-[68%] lg:[mask-image:linear-gradient(90deg,transparent,#000_45%)]"
        >
          {/* dimmed on an inner layer: the outer one's opacity is animated */}
          <div className="absolute inset-0 opacity-55">
            <Aurora preset="card" seed={2} />
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-panel/70 via-transparent to-transparent" />

        <div className="relative grid lg:grid-cols-[1.08fr_1fr]">
          {/* the invitation */}
          <div className="flex flex-col justify-between gap-10 p-6 sm:p-9 lg:p-11 short:gap-7 short:p-8">
            <div>
              <p
                data-rise
                className="mono-label inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[10px] text-soft"
              >
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                {openToWork.status}
              </p>
              <p
                data-rise
                className="text-lift mt-6 max-w-[22ch] font-serif text-[clamp(1.75rem,1.1rem+1.35vw,2.6rem)] leading-[1.1] tracking-[-0.01em] text-fg"
              >
                {openToWork.pitch}
              </p>
              <div data-rise className="mt-6">
                <p className="mono-label text-[10.5px] text-muted">Open to roles as</p>
                <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                  {openToWork.roles.map((role) => (
                    <li key={role} className="flex items-center gap-2 text-[14.5px] font-medium text-fg">
                      <span aria-hidden className="size-1 rounded-full bg-ice" />
                      {role}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div data-rise>
              <div className="flex flex-wrap items-center gap-2.5">
                <ButtonPair>
                  <ButtonLink variant="glow" href={mailto} data-track="contact_click" data-track-label="open-to-work">
                    <Mail size={15} strokeWidth={1.8} className="mr-2" />
                    Let’s talk
                  </ButtonLink>
                  <CopyEmail email={profile.email} label="open-to-work" />
                </ButtonPair>
                <ButtonLink href={profile.resume} download data-track="resume_download" data-track-label="open-to-work">
                  Download resume
                </ButtonLink>
              </div>
              <p className="mono-label mt-5 text-[10px] text-muted">{openToWork.note}</p>
            </div>
          </div>

          {/* the openings */}
          <ul className="flex flex-col border-t border-white/[0.08] lg:border-t-0 lg:border-l">
            {openToWork.opportunities.map((o) => (
              <OpeningRow key={o.title} opening={o} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
