import type { AuroraPresetName } from '../webgl/presets'

export type IconKey = 'code' | 'graduation' | 'cloud' | 'users' | 'network'

export interface Profile {
  name: string
  firstName: string
  roles: string[]
  email: string
  github: string
  linkedin: string
  avatar: string
  /** Transparent-background cut-out of you (PNG/WebP). Shown in the hero like the design. */
  resume: string
  graduation: string
}

/**
 * A project photo or screenshot, published by scripts/project-image.py into public/assets/projects/
 * as `{name}-{width}.bin` for each width, plus `{name}-blur.bin` for the backdrop.
 */
export interface ProjectImage {
  name: string
  widths: number[]
  /** width / height of the original: the cover's frame takes this shape, so nothing is cropped */
  aspect: number
  alt: string
}

export type Project = {
  slug: string
  title: string
  year: string
  tags: string[]
  summary: string
  href: string
  hrefLabel: string
  badge?: string
} & ({ image: ProjectImage; cover?: never } | { /** the nebula sky shown instead of a photo */ cover: AuroraPresetName; image?: never })

export interface SkillGroup {
  index: string
  title: string
  tools: string[]
}

/**
 * A logo in a round crop. Measured per image: `focus` is where the artwork's centre sits in
 * the image (0–1), `scale` zooms until the artwork fills the circle, `bg` fills any padding.
 */
export interface LogoImage {
  src: string
  bg?: string
  scale?: number
  focus?: [number, number]
}

export interface Achievement {
  /** The outcome, stated plainly: "1st place", "2nd place", "National finalist · Top 23". */
  result: string
  rank: 'first' | 'second' | 'finalist'
  event: string
  org: string
  year: string
  /** One sentence: scale + what was built. `project` is emphasised inside it. */
  detail: string
  project: string
  logo?: LogoImage
  /** Initials shown when there's no logo. */
  monogram: string
  href?: string
}

export interface Highlight {
  kicker: string
  title: string
  body?: string
  href?: string
  /** Link call to action, optionally with a brand mark (e.g. an X post). */
  cta?: { label: string; brand?: string }
  preset: AuroraPresetName
  logo?: LogoImage
}

export interface Milestone {
  /** Jobs, internships and education are drawn differently on the timeline. */
  kind: 'work' | 'internship' | 'education'
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
  /** The roles a recruiter can file this profile under. */
  roles: string[]
  note: string
  opportunities: Opportunity[]
}
