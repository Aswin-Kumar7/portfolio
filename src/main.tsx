import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'

// Instrument Serif upright is declared in index.html: the loader and the hero need it at first paint
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@fontsource-variable/inter'
import '@fontsource/birthstone/400.css'
import './styles/index.css'

import { App } from './App'
import { startBoot } from './lib/boot'
import { initSmoothScroll } from './lib/scroll'
import { ScrollTrigger } from './lib/gsap'

// Lenis must exist before the first layout effect so the hero intro can hold the scroll.
initSmoothScroll()
// A reload starts at the top (the intro plays from there). Set through ScrollTrigger: it re-applies
// the browser's restoration mode on every refresh and would otherwise put 'auto' back.
ScrollTrigger.clearScrollMemory('manual')
window.scrollTo(0, 0)

// the loader's counter: the app is in; the fonts and the black hole report as they land
startBoot()

/** In production the stylesheets don't block the first paint (vite.config.ts); the app waits for them. */
function stylesReady() {
  const pending = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((l) => l.media === 'print')
  return Promise.all(
    pending.map(
      (link) =>
        new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true })
          link.addEventListener('error', resolve, { once: true })
        }),
    ),
  )
}

// rendered as a transition, the first render yields to the browser (the loader keeps its frames)
// instead of running as one long task
void stylesReady().then(() =>
  startTransition(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }),
)
