import { useEffect, useInsertionEffect } from 'react'
import { Nav } from './components/Nav'
import { MailComposer } from './components/MailComposer'
import { ResumeGate } from './components/ResumeGate'
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
import { MQ, ScrollTrigger, gsap, setupsDone, useLazyGSAP } from './lib/gsap'
import { interceptAnchors } from './lib/scroll'
import { initStepper } from './lib/stepper'
import { initAnalytics } from './lib/analytics'
import { progress } from './lib/boot'

/** Images and canvases can't be saved from the context menu or dragged out (with the CSS in index.css). */
function protectImages() {
  const block = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('img, canvas, picture')) e.preventDefault()
  }
  document.addEventListener('contextmenu', block)
  document.addEventListener('dragstart', block)
  return () => {
    document.removeEventListener('contextmenu', block)
    document.removeEventListener('dragstart', block)
  }
}

export function App() {
  // the build prerenders this page for crawlers and keeps that copy out of rendering; the app has
  // replaced it now. An insertion effect runs before any section measures its layout.
  useInsertionEffect(() => document.getElementById('root')?.removeAttribute('data-prerendered'), [])
  useEffect(() => interceptAnchors(), [])
  // sections register their stops and pins as they set up; the stepper reads them when it steps
  useEffect(() => initStepper(), [])
  // the loader holds until the sections below the fold have set up, so the intro never shares frames with that work
  useEffect(() => void setupsDone().then(() => progress('app', 1)), [])
  useEffect(() => initAnalytics(), [])
  useEffect(() => protectImages(), [])

  useLazyGSAP(() => {
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
      <MailComposer />
      <ResumeGate />
    </>
  )
}
