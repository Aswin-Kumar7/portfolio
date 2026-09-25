import { useEffect } from 'react'
import { Nav } from './components/Nav'
import { ScrollBar } from './components/ScrollBar'
import { ScrollProgress } from './components/ScrollProgress'
import { Hero } from './sections/Hero'
import { About } from './sections/About'
import { Projects } from './sections/Projects'
import { Skills } from './sections/Skills'
import { Achievements } from './sections/Achievements'
import { Journey } from './sections/Journey'
import { OpenToWork } from './sections/OpenToWork'
import { Contact } from './sections/Contact'
import { Footer } from './sections/Footer'
import { MQ, ScrollTrigger, gsap, useGSAP } from './lib/gsap'
import { interceptAnchors } from './lib/scroll'
import { initStepper } from './lib/stepper'
import { initAnalytics } from './lib/analytics'

export function App() {
  useEffect(() => interceptAnchors(), [])
  // after every section has created its pins and registered its stops
  useEffect(() => initStepper(), [])
  useEffect(() => initAnalytics(), [])

  useGSAP(() => {
    // Margin notes drift at their own speed, like the reference's floating notation.
    const mm = gsap.matchMedia()
    mm.add(MQ.motion, () => {
      gsap.utils.toArray<HTMLElement>('[data-speed]').forEach((el) => {
        const speed = Number(el.dataset.speed ?? 0.3)
        gsap.fromTo(
          el,
          { y: () => -speed * 160 },
          {
            y: () => speed * 160,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          },
        )
      })
    })

    // Pins change the page height; re-measure once fonts settle the layout.
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
    return () => mm.revert()
  })

  return (
    <>
      <a
        href="#main"
        className="mono-label fixed top-3 left-3 z-[60] -translate-y-20 rounded-full bg-fg px-4 py-2 text-ink focus:translate-y-0"
      >
        Skip to content
      </a>
      <Nav />
      <ScrollProgress />
      <ScrollBar />
      {/* Full-bleed on every screen: the hero spans the viewport, content sits between fluid rails. */}
      <Hero />
      <main id="main" className="rails">
        <About />
        <Projects />
        <Skills />
        <Achievements />
        <Journey />
        <OpenToWork />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
