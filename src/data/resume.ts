import type { Achievement, Highlight, Milestone, OpenToWork, Profile, Project, SkillGroup } from './types'

/**
 * Everything on the site is driven from this file.
 * Edit copy here — components never hard-code resume content.
 */

export const profile: Profile = {
  name: 'Aswin Kumar B S',
  firstName: 'Aswin',
  roles: ['Full-Stack Developer', 'DevOps Engineer'],
  email: 'aswin.aswin5640@gmail.com',
  github: 'https://github.com/Aswin-Kumar7',
  linkedin: 'https://www.linkedin.com/in/aswinkumar7/',
  avatar: 'https://avatars.githubusercontent.com/u/84719302?v=4&s=240',
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
  text: 'I turn ideas into products people genuinely enjoy using. I design, build {code} and launch web apps from start to finish — and keep them running smoothly long after launch. Winning hackathons {avatar} taught me to move fast, stay calm under pressure and always ship.',
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
    image: {
      name: 'roadsos',
      widths: [640, 879],
      aspect: 1.2504,
      alt: 'The RoadSoS team holding the first-prize cheque at the BIMSTEC AI Road Safety Hackathon, IIT Madras',
    },
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
    image: { name: 'sentinel', widths: [640, 960, 1280], aspect: 1.7778, alt: 'Sentinel landing page: card-testing detection built for merchants' },
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
    badge: 'National finalist · Cognizant',
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
    image: { name: 'kasparro-airo', widths: [640, 960, 1280], aspect: 1.7778, alt: 'Kasparro AIRO landing page: AI store optimization for Shopify' },
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
    result: '1st place',
    rank: 'first',
    event: 'BIMSTEC AI Road Safety Hackathon',
    org: 'IIT Madras · CoERS',
    year: '2026',
    detail: 'Ranked 1st of 6,200+ submissions and one of 21 finalists with RoadSoS — offline-first AI crash detection and emergency dispatch.',
    project: 'RoadSoS',
    // the seal is 64% of the image: 1.58× fills the circle; its maroon ring colour hides the edge
    logo: { src: '/assets/iitm.webp', bg: '#781f19', scale: 1.58 },
    monogram: 'IITM',
  },
  {
    result: '1st place',
    rank: 'first',
    event: 'Innovate & Build Hackathon',
    org: 'Kumaraguru College of Technology',
    year: '2025',
    detail: 'Won both rounds of the two-phase hackathon with FactifyAI — fake-news detection for 10 Indian languages with OCR and reverse-image checks.',
    project: 'FactifyAI',
    // the circle's edge falls inside the navy petal band (radius 122–124 of 158 at every angle)
    logo: { src: '/assets/kct.webp', bg: '#ffffff', scale: 1.36, focus: [0.498, 0.508] },
    monogram: 'KCT',
  },
  {
    result: '2nd place',
    rank: 'second',
    event: 'INFYND 36-Hour AI Hackathon',
    org: 'INFYND',
    year: '2026',
    detail: 'Shipped Aura AI in 36 hours — a real-time call-center copilot using RAG with LangChain, Groq and Pinecone.',
    project: 'Aura AI',
    logo: { src: '/assets/infynd.webp', bg: '#ffffff', scale: 0.96, focus: [0.5, 0.53] },
    monogram: 'IN',
  },
  {
    result: 'National finalist · Top 23',
    rank: 'finalist',
    event: 'Cognizant Technoverse',
    org: 'Cognizant · National GenAI hackathon',
    year: '2026',
    detail: 'One of the top 23 teams in the national finals with SupplySense — multi-agent prediction of retail supply disruptions.',
    project: 'SupplySense',
    logo: { src: '/assets/cognizant.webp', bg: '#ffffff', scale: 1.14 },
    monogram: 'CTS',
  },
]

export const highlights: [Highlight, Highlight] = [
  {
    kicker: 'Ministry of Road Transport & Highways · Government of India',
    title: 'RoadSoS recognized by MoRTH',
    href: 'https://x.com/MORTHIndia/status/2084919840222114297',
    cta: { label: 'View the post on X', brand: 'x' },
    preset: 'tileViolet',
    // centred on the emblem (rows 58–117 of 200); at 3× the caption below it falls outside the circle
    logo: { src: '/assets/morth.jpg', bg: '#fcde7c', scale: 2.8, focus: [0.4975, 0.4415] },
  },
  {
    kicker: 'IEEE · ICAECA 2025',
    title: 'Published research on UAV trajectory planning',
    body: 'Precision agriculture with wireless sensor networks',
    preset: 'tileRose',
    // the diamond touches the image edges: pad it so the circle doesn't clip its points
    logo: { src: '/assets/ieee.webp', bg: '#ffffff', scale: 0.82 },
  },
]

export const milestones: Milestone[] = [
  {
    kind: 'internship',
    when: 'Oct 2025 – Feb 2026',
    org: 'Erthaloka · Remote',
    title: 'Full Stack Development Intern',
    body: 'Built MERN apps with REST APIs, Google OAuth, secure auth flows, payment gateway integration and a TypeScript-first architecture.',
    icon: 'code',
  },
  {
    kind: 'education',
    when: '2024 – 2027',
    org: 'Kumaraguru College of Technology',
    title: 'B.E. Computer Science & Engineering',
    body: 'Studying CSE while shipping hackathon-winning products and publishing IEEE research.',
    icon: 'graduation',
  },
  {
    kind: 'internship',
    when: 'May 2023',
    org: 'UBX Cloud · On-site',
    title: 'Cloud Computing Intern',
    body: 'Ran Veeam Backup & Replication and VSPC — backup policies, agents, monitoring and disaster recovery for high availability.',
    icon: 'cloud',
  },
  {
    kind: 'work',
    when: 'Feb 2023 – Dec 2024',
    org: 'Information Data Systems · Remote',
    title: 'Community Manager',
    body: 'Scaled Discord, LinkedIn and Instagram communities, lifting engagement by 40% with content and event-driven growth.',
    icon: 'users',
  },
  {
    kind: 'education',
    when: '2021 – 2024',
    org: 'PSG Polytechnic College',
    title: 'Diploma in Computer Networking',
    body: 'Foundations in computer networks, operating systems and infrastructure that still shape how I deploy.',
    icon: 'network',
  },
]

export const openToWork: OpenToWork = {
  status: 'Available now',
  pitch: 'Ready to join your team now — as an intern, full-time, or on a freelance build.',
  roles: ['Software Engineer (SDE)', 'Mobile Developer', 'AI Engineer', 'DevOps Engineer'],
  note: 'Remote, hybrid or on-site · replies within 24 hours',
  opportunities: [
    {
      when: 'Now',
      title: 'Internships',
      detail: 'Can start immediately — full-time, or part-time alongside my degree.',
      cta: { label: 'Start a conversation', href: `mailto:${profile.email}?subject=${encodeURIComponent('Internship opportunity')}` },
    },
    {
      when: 'Now',
      title: 'Full-time roles',
      detail: 'SDE, mobile, AI or DevOps — open to offers now (B.E. CSE, 2027).',
      cta: { label: 'Download resume', href: profile.resume, download: true },
    },
    {
      when: 'Now',
      title: 'Freelance projects',
      detail: 'MVPs, AI features and cloud deployments — scoped, shipped and handed over cleanly.',
      cta: { label: 'Discuss a project', href: `mailto:${profile.email}?subject=${encodeURIComponent('Freelance project')}` },
    },
  ],
}
