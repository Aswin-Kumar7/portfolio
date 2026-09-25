import {
  siDocker,
  siFastapi,
  siFlutter,
  siGithub,
  siGithubactions,
  siKubernetes,
  siLangchain,
  siMongodb,
  siNextdotjs,
  siNodedotjs,
  siPostgresql,
  siPython,
  siReact,
  siTensorflow,
  siTypescript,
} from 'simple-icons'
import type { SVGProps } from 'react'

type IconDef = { title: string; path: string }

const simple: Record<string, IconDef> = {
  react: siReact,
  nextdotjs: siNextdotjs,
  typescript: siTypescript,
  nodedotjs: siNodedotjs,
  python: siPython,
  fastapi: siFastapi,
  flutter: siFlutter,
  mongodb: siMongodb,
  postgresql: siPostgresql,
  docker: siDocker,
  kubernetes: siKubernetes,
  tensorflow: siTensorflow,
  langchain: siLangchain,
  githubactions: siGithubactions,
  github: siGithub,
}

const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'

/** Marks that aren't shipped by simple-icons, drawn as neutral glyphs. */
const custom: Record<string, IconDef> = {
  aws: { title: 'AWS', path: CLOUD },
  azure: { title: 'Azure', path: CLOUD },
  linkedin: {
    title: 'LinkedIn',
    path: 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z',
  },
}

const strokeIcons = new Set(['aws', 'azure'])

export function brandTitle(slug: string) {
  return (simple[slug] ?? custom[slug])?.title ?? slug
}

export function BrandIcon({ slug, ...props }: { slug: string } & SVGProps<SVGSVGElement>) {
  const def = simple[slug] ?? custom[slug]
  if (!def) return null
  const stroked = strokeIcons.has(slug)
  return (
    <svg viewBox="0 0 24 24" aria-hidden width="1em" height="1em" {...props}>
      <path
        d={def.path}
        fill={stroked ? 'none' : 'currentColor'}
        stroke={stroked ? 'currentColor' : undefined}
        strokeWidth={stroked ? 1.6 : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
