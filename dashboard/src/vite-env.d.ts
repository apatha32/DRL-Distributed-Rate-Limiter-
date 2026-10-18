/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the rate limiter API, e.g. https://drl-api.up.railway.app */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
