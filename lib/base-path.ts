// Next.js `basePath` (see next.config.mjs). `next/link`, `next/image`, and
// `redirect()` from `next/navigation` already prepend this automatically —
// only use this constant for manual `fetch()` calls and raw `<a href>` /
// string-built URLs that Next.js doesn't rewrite for you.
export const BASE_PATH = "/os"

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`
}
