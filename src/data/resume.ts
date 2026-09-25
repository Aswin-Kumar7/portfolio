import type { Achievement, Highlight, Milestone, OpenToWork, Profile, Project, SkillGroup } from './types'

/**
 * Everything on the site is driven from this file.
 * Edit copy here — components never hard-code resume content.
 */

export const profile: Profile = {
  name: 'Aswin Kumar B S',
  firstName: 'Aswin',
  roles: ['Full-Stack Developer', 'AI Engineer', 'Mobile Developer'],
  location: 'Coimbatore, India',
  email: 'aswinkumar@duck.com',
  github: 'https://github.com/Aswin-Kumar7',
  linkedin: 'https://www.linkedin.com/in/aswinkumar7/',
  avatar: 'https://avatars.githubusercontent.com/u/84719302?v=4&s=240',
  // Drop a background-removed photo at /public/portrait.webp and set this to '/portrait.webp'
  // to get the exact "person under the sky" hero from the design.
  portrait: null,
  resume: '/Aswin-Kumar-BS-Resume.pdf',
  graduation: '2027',
}

export const nav = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About me' },
  { id: 'projects', label: 'Projects' },
  { id: 'journey', label: 'Experience' },
] as const

export const about = {
  // `{code}` and `{avatar}` are replaced by the inline image chips from the design.
  text: 'I build full-stack, mobile & AI products that feel effortless, ship fast, and help {code} teams reach their full potential — turning bold hackathon ideas {avatar} into production-ready software for real people who rely on it every day.',
}

export const toolbelt = [
  'react',
  'nextdotjs',
  'typescript',
  'nodedotjs',
  'python',
  'fastapi',
  'flutter',
  'mongodb',
  'postgresql',
  'docker',
  'kubernetes',
  'aws',
  'azure',
  'tensorflow',
  'langchain',
  'githubactions',
] as const

export const projects: Project[] = [
  {
    slug: 'roadsos',
    title: 'RoadSoS',
    year: '2026',
    tags: ['On-device AI', 'Mobile'],
    summary:
      'Offline-first crash detection & emergency dispatch — a TFLite classifier trained on ~190K IMU events hitting 0.9948 ROC-AUC, with offline SMS alerts and a live dispatcher dashboard.',
    href: 'https://x.com/MORTHIndia/status/2084919840222114297',
    hrefLabel: 'Recognized by MoRTH',
    cover: 'coverSunset',
    badge: 'Winner · IIT Madras',
  },
  {
    slug: 'sentinel',
    title: 'Sentinel',
    year: '2026',
    tags: ['Fintech', 'ML'],
    summary:
      'Merchant-side card-testing detection that shows its reasoning — rules produce evidence, explanations compete over it, and no shopper is blocked on a model’s word alone.',
    href: 'https://github.com/Aswin-Kumar7/buildathon',
    hrefLabel: 'View repository',
    cover: 'coverDusk',
    badge: 'Razorpay Buildathon',
  },
  {
    slug: 'aura-ai',
    title: 'Aura AI',
    year: '2026',
    tags: ['LLM', 'Real-time'],
    summary:
      'A real-time copilot for call-center agents — live dual-track transcription, sentiment arcs and RAG-powered reply suggestions over WebSockets with Groq, Twilio & Pinecone.',
    href: 'https://github.com/Aswin-Kumar7/AuraAI',
    hrefLabel: 'View repository',
    cover: 'coverTwilight',
    badge: 'Runner-up · INFYND',
  },
  {
    slug: 'factify-ai',
    title: 'FactifyAI',
    year: '2025',
    tags: ['AI', 'Extension'],
    summary:
      'Fake-news detection for 10 Indian languages — a Manifest V3 sidebar extension backed by FastAPI, Gemini, source cross-referencing and OCR + reverse-image checks.',
    href: 'https://github.com/Aswin-Kumar7/FactifyAI',
    hrefLabel: 'View repository',
    cover: 'coverEmber',
    badge: 'Winner · Innovate & Build',
  },
  {
    slug: 'supplysense',
    title: 'SupplySense',
    year: '2026',
    tags: ['GenAI', 'Multi-agent'],
    summary:
      'Supply-chain disruption prediction for Indian retail — supplier-risk scoring, stockout forecasts and prescriptive mitigations from a LangGraph multi-agent system on AWS Bedrock.',
    href: 'https://github.com/Aswin-Kumar7/Supply-Sense-Cognizant',
    hrefLabel: 'View repository',
    cover: 'coverDawn',
    badge: 'Top 100 · Cognizant',
  },
  {
    slug: 'airo',
    title: 'Kasparro AIRO',
    year: '2026',
    tags: ['AI', 'E-commerce'],
    summary:
      'An AI Representation Optimizer that makes Shopify stores visible to AI shopping agents before competitors are — built on AWS Bedrock (Claude), Gemini and Neon Postgres.',
    href: 'https://kasparro-airo.vercel.app/',
    hrefLabel: 'Live demo',
    cover: 'coverNight',
  },
]

export const skills: SkillGroup[] = [
  { index: '01', title: 'Full-Stack Web', tools: ['React', 'Next.js', 'Node', 'Express', 'Postgres'] },
  { index: '02', title: 'AI & Machine Learning', tools: ['LLMs', 'RAG', 'LangChain', 'TensorFlow'] },
  { index: '03', title: 'Mobile Apps', tools: ['Flutter', 'React Native', 'TFLite'] },
  { index: '04', title: 'Cloud & DevOps', tools: ['AWS', 'Azure', 'Docker', 'Kubernetes'] },
]

export const languages = ['TypeScript', 'JavaScript', 'Python', 'Java', 'Dart', 'C']

export const achievements: Achievement[] = [
  {
    badge: 'Winner',
    lead: 'Ranked 1st of 19,000+ registrations and 6,200+ submissions — one of 21 finalists.',
    rest: 'RoadSoS: an offline-first AI accident detection and emergency-dispatch system built for the golden hour.',
    event: 'BIMSTEC AI Road Safety 2026',
    meta: 'IIT Madras · CoERS',
    monogram: 'IITM',
  },
  {
    badge: 'Winner',
    lead: 'Secured 1st place across a two-phase hackathon with FactifyAI.',
    rest: 'Fake-news detection for Indian vernacular languages with source validation and OCR + reverse-image checks.',
    event: 'Innovate & Build 2025',
    meta: 'Hackathon · 1st place',
    monogram: 'I&B',
  },
  {
    badge: 'Runner-up',
    lead: 'Took 2nd place in a 36-hour AI hackathon building Aura AI.',
    rest: 'A real-time call-center copilot on LangChain, Groq (LLaMA), Pinecone and Next.js — shipped under pressure.',
    event: 'INFYND 36-Hour AI Hackathon',
    meta: 'AI · Full-stack · RAG',
    monogram: 'IN',
  },
  {
    badge: 'Top 100 finalist',
    lead: 'Recognized among the top 100 teams in a nation-level GenAI hackathon.',
    rest: 'SupplySense: a multi-agent platform that predicts retail supply disruptions and prescribes the fix.',
    event: 'Cognizant Technoverse 2026',
    meta: 'National level · GenAI',
    monogram: 'CTS',
  },
]

export const highlights: [Highlight, Highlight] = [
  {
    kicker: 'Govt. of India',
    title: 'RoadSoS recognized by MoRTH',
    body: 'Ministry of Road Transport & Highways',
    href: 'https://x.com/MORTHIndia/status/2084919840222114297',
    preset: 'tileViolet',
  },
  {
    kicker: 'IEEE · ICAECA 2025',
    title: 'Published research on UAV trajectory planning',
    body: 'Precision agriculture with wireless sensor networks',
    preset: 'tileRose',
  },
]

export const milestones: Milestone[] = [
  {
    when: 'Nov 2025',
    org: 'Erthaloka · Remote',
    title: 'Full Stack Development Intern',
    body: 'Built MERN apps with REST APIs, Google OAuth, secure auth flows, payment gateway integration and a TypeScript-first architecture.',
    icon: 'code',
  },
  {
    when: '2024 — 2027',
    org: 'Kumaraguru College of Technology',
    title: 'B.E. Computer Science & Engineering',
    body: 'Studying CSE in Coimbatore while shipping hackathon-winning products and publishing IEEE research.',
    icon: 'graduation',
  },
  {
    when: 'May 2023',
    org: 'UBX Cloud · On-site',
    title: 'Cloud Computing Intern',
    body: 'Ran Veeam Backup & Replication and VSPC — backup policies, agents, monitoring and disaster recovery for high availability.',
    icon: 'cloud',
  },
  {
    when: 'May 2023',
    org: 'Information Data Systems · Remote',
    title: 'Community Manager',
    body: 'Scaled Discord, LinkedIn and Instagram communities, lifting engagement by 40% with content and event-driven growth.',
    icon: 'users',
  },
  {
    when: '2021 — 2024',
    org: 'PSG Polytechnic College',
    title: 'Diploma in Computer Networking',
    body: 'Foundations in computer networks, operating systems and infrastructure that still shape how I deploy.',
    icon: 'network',
  },
]

export const openToWork: OpenToWork = {
  status: 'Available now',
  pitch: 'Hiring for 2027, or need something built this month? I ship full-stack, mobile and AI products end to end.',
  note: 'Remote or on-site · IST (UTC+5:30) · replies within a day',
  opportunities: [
    {
      when: 'Now',
      title: 'Internships & freelance',
      detail: 'MVPs, AI copilots and automation — shipped in days, not months.',
      cta: { label: 'Start a conversation', href: `mailto:${profile.email}` },
    },
    {
      when: profile.graduation,
      title: 'Full-time roles',
      detail: 'SDE, full-stack or AI engineering — owning features end to end.',
      cta: { label: 'Download resume', href: profile.resume, download: true },
    },
  ],
}
