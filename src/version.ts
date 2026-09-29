export const APP_VERSION = __APP_VERSION__
export const GIT_SHA = __GIT_SHA__
export const BUILD_TIME = __BUILD_TIME__

export const versionLabel = (version = APP_VERSION, sha = GIT_SHA) => `v${version} · ${sha}`

/** 公開中の版（version.json）。オフラインなどで取れなければ null */
export async function fetchLatestVersion(): Promise<{ version: string; sha: string; builtAt: string } | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
