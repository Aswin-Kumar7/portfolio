import { useRef } from 'react'
import {
  BrainCircuit,
  Cloud,
  CodeXml,
  GraduationCap,
  Network,
  Server,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Aurora } from '../components/Aurora'
import { Notes } from '../components/Notes'
import { SectionHeader } from '../components/SectionHeader'
import { MQ, ScrollTrigger, gsap, useGSAP } from '../lib/gsap'
import { addStops } from '../lib/stepper'
import { milestones } from '../data/resume'
import type { IconKey, Milestone } from '../data/types'
import { cn } from '../lib/cn'

const icons: Record<IconKey, LucideIcon> = {
  code: CodeXml,
  graduation: GraduationCap,
  cloud: Cloud,
  users: Users,
  network: Network,
  brain: BrainCircuit,
  smartphone: Smartphone,
  server: Server,
}

function IconBubble({ icon }: { icon: IconKey }) {
  const Icon = icons[icon]
  return (
    <span
      data-icon
      className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full bg-[var(--bubble-bg)] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.09),0_10px_24px_-14px_rgb(var(--accent-rgb)/0.5)] md:size-[58px]"
    >
      <Icon size={20} strokeWidth={1.6} />
    </span>
  )
}

function Text({ m, align }: { m: Milestone; align: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' ? 'md:text-right' : 'text-left')}>
      <p data-meta className="mono-label text-[10px] text-muted">
        {m.when} · {m.org}
      </p>
      <h3 className="text-lift mt-1.5 font-serif text-[1.3rem] leading-[1.15] text-fg md:text-[1.4rem] 3xl:text-[1.6rem]">{m.title}</h3>
      <p data-body className={cn('mt-1.5 max-w-[40ch] text-[13px] leading-[1.55] text-muted lg:max-w-none 3xl:text-[14px]', align === 'right' && 'md:ml-auto')}>
        {m.body}
      </p>
    </div>
  )
}

export function Journey() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const rows = q('[data-row]')
      const card = q('[data-glow-card]')[0]!
      const orb = q('[data-orb]')[0]!
      const ring = q('[data-ring]')[0]!
      const wrap = q('[data-wrap]')[0]!
      const css = getComputedStyle(document.documentElement)
      const ACTIVE = css.getPropertyValue('--active-text').trim()
      const MUTED = css.getPropertyValue('--color-muted').trim()
      const n = rows.length
      // centre the orb and ring on their x/y (GSAP owns their transforms)
      gsap.set([orb, ring], { xPercent: -50, yPercent: -50 })

      // Everything that marks "the current milestone" is measured relative to the wrap…
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        const w = wrap.getBoundingClientRect()
        return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2, top: r.top - w.top, h: r.height }
      }
      const rowBox = (i: number) => box(rows[i]!)
      const iconBox = (i: number) => {
        const icon = [...rows[i]!.querySelectorAll('[data-icon]')].find((el) => (el as HTMLElement).offsetParent)
        return icon ? box(icon) : null
      }
      const nodeBox = (i: number) => box(rows[i]!.querySelector('[data-node]')!)

      const place = (i: number) => {
        const r = rowBox(i)
        const ic = iconBox(i)
        const nd = nodeBox(i)
        gsap.set(card, { y: r.top, height: r.h })
        gsap.set(ring, { x: nd.x, y: nd.y })
        if (ic) gsap.set(orb, { x: ic.x, y: ic.y, autoAlpha: 1 })
        else gsap.set(orb, { autoAlpha: 0 })
        rows.forEach((row, j) => {
          gsap.set(row.querySelectorAll('[data-body]'), { color: j === i ? ACTIVE : MUTED })
          gsap.set(row.querySelectorAll('[data-meta]'), { color: j === i ? 'rgba(255,255,255,0.82)' : MUTED })
        })
      }

      /**
       * …and moved by ONE scrubbed timeline: the aurora card, the glowing icon orb,
       * the node ring and the text colours all travel together, so nothing can
       * arrive before anything else.
       */
      const build = (scrollTrigger: ScrollTrigger.Vars) => {
        place(0)
        const tl = gsap.timeline({ defaults: { ease: 'power2.inOut', duration: 1 }, scrollTrigger })
        // the resting state is part of the timeline too, so it re-measures on refresh (fonts, resize)
        tl.set(card, { y: () => rowBox(0).top, height: () => rowBox(0).h }, 0)
          .set(ring, { x: () => nodeBox(0).x, y: () => nodeBox(0).y }, 0)
          .set(orb, { x: () => iconBox(0)?.x ?? 0, y: () => iconBox(0)?.y ?? 0 }, 0)
          .addLabel('m0', 0)
        for (let i = 1; i < n; i++) {
          const at = tl.duration()
          tl.to(card, { y: () => rowBox(i).top, height: () => rowBox(i).h }, at)
            .to(ring, { x: () => nodeBox(i).x, y: () => nodeBox(i).y }, at)
            .to(orb, { x: () => iconBox(i)?.x ?? 0, y: () => iconBox(i)?.y ?? 0 }, at)
            .to(rows[i - 1]!.querySelectorAll('[data-body]'), { color: MUTED }, at)
            .to(rows[i - 1]!.querySelectorAll('[data-meta]'), { color: MUTED }, at)
            .to(rows[i]!.querySelectorAll('[data-body]'), { color: ACTIVE }, at)
            .to(rows[i]!.querySelectorAll('[data-meta]'), { color: 'rgba(255,255,255,0.82)' }, at)
            .addLabel(`m${i}`, at + 1)
        }
        tl.to({}, { duration: 0.35 }) // a short tail so the last milestone rests before the pin releases
        tl.fromTo(q('[data-spine-fill]'), { scaleY: 0 }, { scaleY: 1, ease: 'none', duration: tl.duration() }, 0)
        return tl
      }

      const mm = gsap.matchMedia()
      mm.add(MQ.desktop, () => {
        // title and timeline pin together as one screen; every milestone is a resting point
        const tl = build({ trigger: q('[data-pin]')[0], start: 'top top', end: `+=${n * 32}%`, pin: true, scrub: 0.45, invalidateOnRefresh: true })
        return addStops(() => {
          const st = tl.scrollTrigger
          if (!st) return []
          return rows.map((_, i) => st.start + (st.end - st.start) * ((tl.labels[`m${i}`] ?? 0) / tl.duration()))
        })
      })
      mm.add(MQ.compact, () => {
        build({ trigger: wrap, start: 'top 62%', end: 'bottom 62%', scrub: 1, invalidateOnRefresh: true })
      })
      mm.add(MQ.reduce, () => {
        place(0)
        gsap.set(q('[data-spine-fill]'), { scaleY: 1 })
        rows.forEach((row, i) =>
          ScrollTrigger.create({ trigger: row, start: 'top 60%', end: 'bottom 60%', onToggle: (self) => self.isActive && place(i) }),
        )
      })

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
      {/* desktop: one pinned screen — the title on the left, the timeline on the right */}
      <div
        data-pin
        className="lg:grid lg:min-h-[100svh] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.5fr)] lg:items-center lg:gap-[4vw] lg:px-6 lg:py-[clamp(2.5rem,6svh,5rem)] 3xl:px-12"
      >
        <SectionHeader
          id="journey-title"
          label="My journey"
          className="lg:mx-0 lg:text-left"
          title={
            <>
              Where I’ve worked, <br />
              studied & grown
            </>
          }
        />

        <div className="mx-auto mt-14 w-full max-w-[860px] md:mt-16 lg:mt-0 3xl:max-w-[1040px]">
          <div data-wrap className="relative">
            {/* the travelling highlight: aurora card */}
            <div data-glow-card aria-hidden className="absolute inset-x-0 top-0 overflow-hidden rounded-[12px] ring-1 ring-white/15">
              <Aurora preset="clouds" seed={4} />
              {/* shade so white type stays legible on the brightest clouds */}
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--scrim-rgb)/0.55),rgb(var(--scrim-rgb)/0.25)_45%,rgb(var(--scrim-rgb)/0.55))]" />
            </div>

            <div aria-hidden className="absolute top-8 bottom-8 left-[33px] w-px bg-white/[0.08] md:left-1/2 short:left-[33px]" />
            <div
              data-spine-fill
              aria-hidden
              className="absolute top-8 bottom-8 left-[33px] w-px origin-top bg-gradient-to-b from-ice via-accent to-accent/0 md:left-1/2 short:left-[33px]"
            />

            <ol className="relative">
              {milestones.map((m, i) => {
                const flip = i % 2 === 1
                return (
                  <li
                    key={m.title}
                    data-row
                    className="grid grid-cols-[44px_1fr] items-center gap-x-3 px-3 py-5 md:grid-cols-[1fr_64px_1fr] md:gap-x-6 md:px-7 lg:py-[clamp(0.45rem,1.3svh,1.5rem)] short:grid-cols-[44px_1fr] short:gap-x-4 short:px-3"
                  >
                    <div className="hidden justify-end md:flex short:hidden">{flip ? <Text m={m} align="right" /> : <IconBubble icon={m.icon} />}</div>
                    <div className="flex justify-center">
                      <span data-node className="relative z-10 grid size-[22px] place-items-center rounded-full bg-ink shadow-[0_0_0_1px_rgba(255,255,255,0.22)]">
                        <span className="size-2 rounded-full bg-white" />
                      </span>
                    </div>
                    <div className="hidden md:flex short:hidden">{flip ? <IconBubble icon={m.icon} /> : <Text m={m} align="left" />}</div>
                    <div className="md:hidden short:block">
                      <Text m={m} align="left" />
                    </div>
                  </li>
                )
              })}
            </ol>

            {/* the travelling highlight: glowing icon orb + node ring, above the rows */}
            <span
              data-orb
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-20 hidden size-12 rounded-full md:block md:size-[58px] short:hidden"
              style={{
                background: 'var(--orb-grad)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -4px 10px rgb(var(--tint-rgb) / 0.3), 0 0 34px 2px rgb(var(--accent-rgb) / 0.65)',
                mixBlendMode: 'screen',
              }}
            />
            <span
              data-ring
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-20 size-[22px] rounded-full"
              style={{ boxShadow: '0 0 0 1.5px rgb(var(--ice-rgb) / 0.95), 0 0 18px 3px rgb(var(--accent-rgb) / 0.7)' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
