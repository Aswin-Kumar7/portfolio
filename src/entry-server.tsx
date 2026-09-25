import { renderToString } from 'react-dom/server'
import { App } from './App'

/**
 * Build-time prerender (scripts/prerender.mjs): the page's full text goes into index.html,
 * so crawlers that don't run JavaScript (AI answer engines, link previews, Bing at first
 * pass) read the same content visitors see. In the browser the app then renders over it.
 */
export function render() {
  return renderToString(<App />)
}

export * as data from './data/resume'
