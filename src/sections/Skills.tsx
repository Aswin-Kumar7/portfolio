import { useRef } from 'react'
import { Notes } from '../components/Notes'
import { SectionHeader } from '../components/SectionHeader'
import { Starfield } from '../components/Starfield'
import { MQ, gsap, useLazyGSAP } from '../lib/gsap'
import { sectionStops } from '../lib/stepper'
import { languages, profile, skills } from '../data/resume'

/*
 * Geometry measured from the design: four r=92 circles around a 62px avatar,
 * inside a 466 × 368 box. The hexagon is drawn in the SAME coordinate space
 * (centred on the avatar), so the diagram and its frame can never drift apart
 * at any screen size.
 */
const W = 466
const H = 368
const R = 92
const centers = [
  { x: 233, y: 92 }, // top
  { x: 374, y: 184 }, // right
  { x: 233, y: 276 }, // bottom
  { x: 92, y: 184 }, // left
]
const HEX = 318 // hexagon circumradius, in diagram units
const pct = (v: number, of: number) => `${(v / of) * 100}%`

function hexPoints(r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

function Hexagon() {
  const pad = HEX * 1.02
  return (
    <svg
      aria-hidden
      viewBox={`${-pad} ${-pad} ${pad * 2} ${pad * 2}`}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      style={{ width: pct(pad * 2, W) }}
    >
      <g fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
        <polygon data-hex points={hexPoints(HEX)} pathLength={1} />
        <polygon data-hex points={hexPoints(HEX * 0.955)} pathLength={1} />
      </g>
    </svg>
  )
}

export function Skills() {
  const root = useRef<HTMLElement>(null)

  useLazyGSAP(
    () => {
      const q = gsap.utils.selector(root)
      const circles = q('[data-circle]')
      const mm = gsap.matchMedia()

      // Centred with xPercent/yPercent so x/y stay free for motion.
      gsap.set([...circles, ...q('[data-avatar]')], { xPercent: -50, yPercent: -50 })

      const build = (scrollTrigger: ScrollTrigger.Vars) => {
        const flower = q('[data-flower]')[0]!
        const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' }, scrollTrigger })
        tl.fromTo(q('[data-hex]'), { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.4, stagger: 0.3, ease: 'none' }, 0)
          .fromTo(q('[data-spine]'), { scaleY: 0 }, { scaleY: 1, duration: 2, ease: 'none' }, 0)
          .fromTo(q('[data-avatar]'), { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(50% at 50% 50%)', duration: 1.4 }, 0.3)
        circles.forEach((c, i) => {
          const pos = centers[i]!
          // start stacked on the avatar, then glide out to their place
          tl.fromTo(
            c,
            {
              x: () => ((W / 2 - pos.x) / W) * flower.offsetWidth,
              y: () => ((H / 2 - pos.y) / H) * flower.offsetHeight,
              rotate: i % 2 ? 9 : -9,
              autoAlpha: 0,
            },
            { x: 0, y: 0, rotate: 0, autoAlpha: 1, duration: 1.8 },
            0.7 + i * 0.22,
          )
        })
        tl.fromTo(q('[data-tools]'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.1 }, 2.1).fromTo(
          q('[data-langs]'),
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 1 },
          2.4,
        )
        return tl
      }

      // Desktop: one screen, one stop — the diagram builds itself in real time as the page
      // arrives (a ~3s sequence), so however fast the glide, the build is seen in full.
      mm.add(MQ.desktop, () => {
        build({ trigger: q('[data-stage]')[0], start: 'top 55%', toggleActions: 'play none none none' }).timeScale(1.05)
        return sectionStops(root.current!)
      })
      mm.add(MQ.compact, () => {
        build({ trigger: q('[data-stage]')[0], start: 'top 80%', end: 'center 45%', scrub: 1, invalidateOnRefresh: true })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section id="skills" ref={root} aria-labelledby="skills-title" className="relative border-b border-line">
      {/* title and diagram share one pinned screen, so every resting point shows both */}
      <div
        data-stage
        className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden py-20 lg:max-h-[1400px] lg:pt-[max(4.5rem,6svh)] lg:pb-[clamp(1.5rem,5.5svh,6.5rem)]"
      >
        <Starfield density={0.22} sparkles={3} maxY={1} seed={21} />
        <Notes
          items={[
            { text: 'fig. 03 — stack', className: 'left-[6%] top-[10%]', speed: 0.2 },
            { text: 'git push origin main', className: 'right-[7%] top-[48%]', speed: -0.3 },
            { text: 'docker compose up -d', className: 'left-[8%] bottom-[26%]', speed: 0.35, accent: true },
          ]}
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]" style={{ background: 'var(--stage-glow)' }} />
        <div className="relative z-10 px-5 sm:px-8 tight:[zoom:0.9] tighter:[zoom:0.82]">
          <SectionHeader
            id="skills-title"
            label="What I do"
            title={
              <>
                Skills that cover the <br className="hidden sm:block" />
                whole product, end to end
              </>
            }
          />
        </div>

        {/* The diagram: hexagon, circles and avatar all share this box and its centre.
            On desktop it takes the height the title leaves (the flower is 0.79× its width). */}
        <div className="@container relative mt-12 w-[min(88vw,620px)] lg:mt-[clamp(1.25rem,3svh,3rem)] lg:w-[min(46vw,max(28rem,calc((100svh-28rem)*1.27)),760px)] tight:[zoom:0.9] tighter:[zoom:0.82]">
          {/* the guide line runs through the diagram, behind the circles — not through the title */}
          <div data-spine aria-hidden className="absolute -top-[6%] -bottom-[40%] left-1/2 w-px origin-top bg-white/[0.06]" />
          <div data-flower className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
            <Hexagon />
            {skills.map((s, i) => {
              const c = centers[i]!
              return (
                <div
                  key={s.title}
                  data-circle
                  className="group absolute flex aspect-square flex-col items-center justify-center rounded-full border border-white/[0.07] bg-[var(--circle-bg)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,background-color,box-shadow] duration-700 hover:z-10 hover:border-accent/60 hover:bg-[var(--circle-bg-hover)] hover:shadow-[0_0_40px_-6px_rgb(var(--accent-rgb)/0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{ left: pct(c.x, W), top: pct(c.y, H), width: pct(2 * R, W) }}
                >
                  <span className="font-mono text-[max(9px,2.2cqw)] tracking-[0.08em] text-muted">[{s.index}]</span>
                  <span className="mt-[0.5cqw] px-[3cqw] font-serif text-[max(13px,4.1cqw)] leading-[1.1] text-fg">{s.title}</span>
                  <span
                    data-tools
                    className="mt-[1.2cqw] hidden max-w-[80%] font-mono text-[2cqw] leading-[1.5] tracking-[0.02em] text-muted transition-colors group-hover:text-soft @md:block"
                  >
                    {s.tools.join(' · ')}
                  </span>
                </div>
              )
            })}
            <img
              data-avatar
              src={profile.avatar}
              alt=""
              className="absolute top-1/2 left-1/2 z-20 aspect-square rounded-full object-cover shadow-[0_0_0_3px_var(--color-ink),0_0_0_4px_rgba(255,255,255,0.14),0_0_40px_rgb(var(--accent-rgb)/0.45)]"
              style={{ width: pct(62, W) }}
            />
          </div>

          {/* Compact list for small screens where the circles can't hold the tools. */}
          <dl className="relative mt-14 grid grid-cols-2 gap-x-4 gap-y-5 @md:hidden lg:hidden">
            {skills.map((s) => (
              <div key={s.title}>
                <dt className="font-serif text-[1.05rem] text-fg">{s.title}</dt>
                <dd className="mt-1 font-mono text-[10.5px] leading-[1.6] tracking-[0.02em] text-muted">{s.tools.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p data-langs className="mono-label relative mt-16 px-5 text-center text-[10.5px] leading-[1.9] text-muted lg:mt-[clamp(1rem,3svh,3rem)]">
          <span className="text-soft">Languages</span>
          <span className="mx-2 text-dim">—</span>
          {languages.join(' · ')}
        </p>
      </div>
    </section>
  )
}
