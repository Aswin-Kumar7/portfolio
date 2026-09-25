import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The loader is inline in index.html and covers the page, so the app's stylesheets don't need
 * to block the first paint: they load as `media="print"` and the loader's inline script switches
 * them on (no inline event handlers, so the CSP can stay strict). The app mounts once they're in
 * (see `stylesReady` in src/main.tsx). Without JavaScript, <noscript> links apply them normally.
 */
function nonBlockingStyles(): Plugin {
  return {
    name: 'non-blocking-styles',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const links: string[] = []
        const out = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g, (_, href: string) => {
          links.push(href)
          return `<link rel="stylesheet" crossorigin href="${href}" media="print" data-deferred-style>`
        })
        const fallback = links.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`).join('')
        return out.replace('</head>', `  <noscript>${fallback}</noscript>\n  </head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), nonBlockingStyles()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    cssMinify: true,
    // hashed bundles go to /static (cached forever); /assets stays free for our own images
    assetsDir: 'static',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/gsap') || id.includes('node_modules/@gsap') || id.includes('node_modules/lenis')) return 'gsap'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
