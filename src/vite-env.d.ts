/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Microsoft Clarity project ID. Set it for Vercel's Production environment only. */
  readonly VITE_CLARITY_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
