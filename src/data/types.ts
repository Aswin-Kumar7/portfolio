import type { AuroraPresetName } from '../webgl/presets'

export type IconKey =
  | 'code'
  | 'graduation'
  | 'cloud'
  | 'users'
  | 'network'
  | 'brain'
  | 'smartphone'
  | 'server'

export interface Profile {
  name: string
  firstName: string
  roles: string[]
  location: string
  email: string
  github: string
  linkedin: string
  avatar: string
  /** Transparent-background cut-out of you (PNG/WebP). Shown in the hero like the design. */
  portrait: string | null
  resume: string
  graduation: string
}

export interface Project {
  slug: string
  title: string
  year: string
  tags: string[]
  summary: string
  href: string
  hrefLabel: string
  cover: AuroraPresetName
  badge?: string
}

export interface SkillGroup {
  index: string
  title: string
  tools: string[]
}

export interface Achievement {
  badge: string
  lead: string
  rest: string
  event: string
  meta: string
  monogram: string
  href?: string
}

export interface Highlight {
  kicker: string
  title: string
  body: string
  href?: string
  preset: AuroraPresetName
}

export interface Milestone {
  when: string
  org: string
  title: string
  body: string
  icon: IconKey
}

/** One opening on the "Open to work" invitation. */
export interface Opportunity {
  /** When it starts: "Now", "2027"… */
  when: string
  title: string
  detail: string
  cta: { label: string; href: string; download?: boolean }
}

export interface OpenToWork {
  status: string
  pitch: string
  note: string
  opportunities: Opportunity[]
}
