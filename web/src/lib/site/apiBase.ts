/**
 * The arena API origin, resolved once.
 *
 * Reading `import.meta.env.VITE_API_URL` inline produced hrefs like
 * `undefined/skill.md` whenever the variable was unset, which is every local
 * run without a .env. A missing base falls back to the dev server rather than
 * interpolating `undefined` into a link.
 */
const DEV_FALLBACK = 'http://localhost:8787'

export const API_BASE: string =
  (import.meta.env['VITE_API_URL'] as string | undefined)?.replace(/\/+$/, '') || DEV_FALLBACK

/** True when the origin came from configuration rather than the dev fallback. */
export const API_BASE_CONFIGURED = Boolean(import.meta.env['VITE_API_URL'])

export const apiUrl = (path: string): string =>
  `${API_BASE}/${path.replace(/^\/+/, '')}`
