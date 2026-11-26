// Type declarations for the build variables. Vite's client types give `import.meta.env`; this file narrows it to the two variables the console reads
// (see .env.example). Related: src/App.vue reads them.
// Vite's client types: `import.meta.env`, asset imports and the like.
/// <reference types="vite/client" />

/** The build variables this app reads; both are optional and neither is a secret. */
interface ImportMetaEnv {
  /** The name shown in the header (default "Content hub"). */
  readonly VITE_BRAND_NAME?: string
  /** Optional documentation link in the footer. */
  readonly VITE_DOCS_URL?: string
}

/** Types `import.meta.env` with the variables above. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
