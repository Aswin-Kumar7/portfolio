import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import '@fontsource-variable/inter'
import '@fontsource/birthstone/400.css'
import './styles/index.css'

import { App } from './App'
import { loadAurora } from './webgl/loader'
import { initSmoothScroll } from './lib/scroll'

// Start fetching three.js immediately; the CSS gradients cover the gap.
void loadAurora()

// Lenis must exist before the first layout effect so the hero intro can hold the scroll.
initSmoothScroll()
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
