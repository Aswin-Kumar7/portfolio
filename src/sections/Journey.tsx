import { useRef } from 'react'
import { Cloud, CodeXml, GraduationCap, Network, Users, type LucideIcon } from 'lucide-react'
import { Notes } from '../components/Notes'
import { SectionHeader } from '../components/SectionHeader'
import { EASE, MQ, gsap, useLazyGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { milestones } from '../data/resume'
import type { IconKey, Milestone } from '../data/types'
import { cn } from '../lib/cn'

const icons: Record<IconKey, LucideIcon> = {
  code: CodeXml,
  graduation: GraduationCap,
  cloud: Cloud,
  users: Users,
  network: Network,
}

/** How each kind is drawn: its tag colour, the small marker beside the tag, and the timeline node. */
const kinds = {
  work: {
    label: 'Work',
    text: 'text-ice',
    marker: 'rounded-full bg-ice',
    node: 'rounded-full bg-ice',
    latest: 'rounded-full bg-ice shadow-[0_0_0_4px_var(--color-ink),0_0_18px_3px_rgb(var(--accent-rgb)/0.75)]',
    hover: 'group-hover:text-ice',
  },
  // internships: a hollow ring in violet
  internship: {
    label: 'Internship',
    text: 'text-[var(--intern)]',
    marker: 'rounded-full ring-[1.5px] ring-[var(--intern)] ring-inset',
    node: 'rounded-full border-2 border-[var(--intern)] bg-ink',
    latest: 'rounded-full border-2 border-[var(--intern)] bg-ink shadow-[0_0_0_4px_var(--color-ink),0_0_18px_3px_rgb(var(--intern-rgb)/0.6)]',
    hover: 'group-hover:text-[var(--intern)]',
  },
  // education: a gold diamond
  education: {
    label: 'Education',
    text: 'text-[var(--edu)]',
    marker: 'rotate-45 rounded-[1px] bg-[var(--edu)]',
    node: 'rotate-45 rounded-[2px] bg-[var(--edu)] shadow-[0_0_14px_1px_rgb(var(--edu-rgb)/0.45)]',
    latest: 'rotate-45 rounded-[2px] bg-[var(--edu)] shadow-[0_0_14px_1px_rgb(var(--edu-rgb)/0.45)]',
    hover: 'group-hover:text-[var(--edu)]',
  },
} satisfies Record<Milestone['kind'], Record<string, string>>

function Kind({ kind, className }: { kind: Milestone['kind']; className?: string }) {
  const k = kinds[kind]
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] uppercase', k.text, className)}>
      <span aria-hidden className={cn('size-[6px]', k.marker)} />
      {k.label}
    </span>
  )
}

/** One line of the ledger: when · node · what, where and a sentence about it. */
function Entry({ m, latest }: { m: Milestone; latest: boolean }) {
  const Icon = icons[m.icon]
  const k = kinds[m.kind]
  // "Oct 2025 – Feb 2026" is too wide for the date column: a month range breaks after its dash
  const [from, to] = m.when.length > 12 ? m.when.split(' – ') : [m.when]
  return (
    <li data-entry className="group relative grid grid-cols-[24px_1fr] gap-x-4 md:grid-cols-[124px_24px_1fr] md:gap-x-6">
      <div data-rise className="hidden pt-[0.4rem] text-right md:block">
        <p className="mono-label text-[11px] leading-[1.5] text-muted">
          {to ? (
            <>
              {from} –<br />
              {to}
            </>
          ) : (
            m.when
          )}
        </p>
        <Kind kind={m.kind} className="mt-1.5 justify-end" />
      </div>
      <div className="relative flex justify-center pt-[0.62rem]">
        <span data-node className={cn('relative z-10 size-[11px] ring-4 ring-ink transition-shadow duration-500', latest ? k.latest : k.node)} />
      </div>
      <div data-rise className="min-w-0 pb-[clamp(1.1rem,2.6svh,2rem)] short:pb-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
          <p className="mono-label text-[11px] text-muted">{m.when}</p>
          <Kind kind={m.kind} />
        </div>
        <h3 className={cn('font-serif text-[clamp(1.3rem,1.05rem+0.5vw,1.6rem)] leading-[1.15] text-fg transition-colors duration-500', k.hover)}>
          {m.title}
        </h3>
        <p className="mt-1 flex items-center gap-2 text-[13.5px] font-medium text-soft">
          <Icon size={14} strokeWidth={1.8} className={cn('shrink-0', k.text)} aria-hidden />
          {m.org}
        </p>
        <p className="mt-1.5 max-w-[68ch] text-[14px] leading-[1.6] text-muted short:leading-[1.5]">{m.body}</p>
      </div>
    </li>
  )
}

export function Journey() {
  const root = useRef<HTMLElement>(null)

  useLazyGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const mm = gsap.matchMedia()
      mm.add(MQ.motion, () => {
        // on arrival, in real time: the spine draws down, each entry settles in behind it
        const tl = gsap.timeline({
          defaults: { ease: EASE.rise },
          scrollTrigger: { trigger: q('[data-ledger]')[0], start: 'top 70%', toggleActions: 'play none none none' },
        })
        tl.fromTo(q('[data-spine]'), { scaleY: 0 }, { scaleY: 1, duration: 1.8, ease: 'power2.inOut' }, 0)
        q('[data-entry]').forEach((entry, i) => {
          const at = 0.2 + i * 0.22
          tl.fromTo(entry.querySelector('[data-node]'), { scale: 0 }, { scale: 1, duration: 0.7, ease: 'back.out(2)' }, at)
          tl.fromTo(entry.querySelectorAll('[data-rise]'), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.06 }, at)
        })
      })
      // desktop: one screen, one resting point for the section stepper
      mm.add(MQ.desktop, () => sectionStops(root.current!))
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="journey" ref={root} aria-labelledby="journey-title" className="relative border-b border-line px-4 py-24 sm:px-8 md:py-32 lg:py-0">
      <Notes
        items={[
          { text: 'fig. 05 — timeline', className: 'left-[5%] top-[8%]', speed: 0.2 },
          { text: 'v2021 → v2027', className: 'right-[6%] top-[16%]', speed: -0.25, accent: true },
        ]}
      />
      {/* desktop: one screen — the title on the left, the ledger on the right */}
      <div className="lg:grid lg:min-h-[100svh] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.5fr)] lg:items-center lg:gap-[4vw] lg:px-6 lg:pt-[max(4.5rem,6svh)] lg:pb-[clamp(1.5rem,5svh,5rem)] 3xl:px-12">
        <SectionHeader
          id="journey-title"
          label="My journey"
          className="lg:mx-0 lg:text-left tight:[zoom:0.9] tighter:[zoom:0.82]"
          title={
            <>
              Where I’ve worked, <br />
              studied & grown
            </>
          }
        />

        <div data-ledger className="relative mx-auto mt-14 w-full max-w-[880px] md:mt-16 lg:mt-0 3xl:max-w-[1000px] tight:[zoom:0.9] tighter:[zoom:0.82]">
          {/* the spine runs through the nodes' column */}
          <span aria-hidden className="absolute top-3 bottom-6 left-[11.5px] w-px bg-white/10 md:left-[159.5px]" />
          <span
            data-spine
            aria-hidden
            className="absolute top-3 bottom-6 left-[11.5px] w-px origin-top bg-gradient-to-b from-ice via-accent to-accent/10 md:left-[159.5px]"
          />
          <ol className="relative">
            {milestones.map((m, i) => (
              <Entry key={m.title} m={m} latest={i === 0} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
