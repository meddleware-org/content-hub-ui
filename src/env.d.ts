/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The name shown in the header (default "Content hub"). */
  readonly VITE_BRAND_NAME?: string
  /** Optional documentation link in the footer. */
  readonly VITE_DOCS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
