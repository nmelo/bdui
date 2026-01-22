const WORKSPACE_COOKIE_NAME = "beads-workspace"
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year in seconds

export function getWorkspaceCookie(): string | null {
  if (typeof document === "undefined") return null

  const cookies = document.cookie.split(";")
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=")
    if (name === WORKSPACE_COOKIE_NAME) {
      return decodeURIComponent(value)
    }
  }
  return null
}

export function setWorkspaceCookie(workspaceId: string): void {
  if (typeof document === "undefined") return

  document.cookie = `${WORKSPACE_COOKIE_NAME}=${encodeURIComponent(workspaceId)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function clearWorkspaceCookie(): void {
  if (typeof document === "undefined") return

  document.cookie = `${WORKSPACE_COOKIE_NAME}=; path=/; max-age=0`
}
