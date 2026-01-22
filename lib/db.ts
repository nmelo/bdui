import { readFile, access, stat } from "fs/promises"
import { constants } from "fs"
import { join, dirname, basename } from "path"
import { homedir } from "os"

export interface Workspace {
  id: string
  name: string
  path: string
  databasePath: string
}

// Global registry path
const REGISTRY_PATH = join(homedir(), ".beads", "registry.json")

// Find nearest .beads directory walking up from cwd
async function findNearestBeadsDir(startPath: string): Promise<string | null> {
  let current = startPath

  while (current !== "/") {
    const beadsDir = join(current, ".beads")
    try {
      const stats = await stat(beadsDir)
      if (stats.isDirectory()) {
        // Find the .db file in this directory
        const { readdir } = await import("fs/promises")
        const files = await readdir(beadsDir)
        const dbFile = files.find((f) => f.endsWith(".db"))
        if (dbFile) {
          return join(beadsDir, dbFile)
        }
      }
    } catch {
      // Directory doesn't exist, continue walking up
    }
    current = dirname(current)
  }

  return null
}

// Get default database path
async function getDefaultDbPath(): Promise<string | null> {
  const defaultPath = join(homedir(), ".beads", "default.db")
  try {
    await access(defaultPath, constants.R_OK)
    return defaultPath
  } catch {
    return null
  }
}

// Resolve database path following bd's precedence:
// 1. Explicit path (--db flag or BEADS_DB env)
// 2. Nearest .beads/*.db walking up from cwd
// 3. ~/.beads/default.db (fallback)
export async function resolveDbPath(
  explicitPath?: string,
  cwd?: string
): Promise<string | null> {
  // 1. Explicit path
  if (explicitPath) {
    try {
      await access(explicitPath, constants.R_OK)
      return explicitPath
    } catch {
      console.error("Explicit db path not accessible:", explicitPath)
      return null
    }
  }

  // Check BEADS_DB environment variable
  const envPath = process.env.BEADS_DB
  if (envPath) {
    try {
      await access(envPath, constants.R_OK)
      return envPath
    } catch {
      console.error("BEADS_DB path not accessible:", envPath)
    }
  }

  // 2. Nearest .beads directory
  const startPath = cwd || process.cwd()
  const nearestDb = await findNearestBeadsDir(startPath)
  if (nearestDb) {
    return nearestDb
  }

  // 3. Default path
  return getDefaultDbPath()
}

// Read the global workspace registry
export async function getRegisteredWorkspaces(): Promise<Workspace[]> {
  try {
    const content = await readFile(REGISTRY_PATH, "utf-8")
    const registry = JSON.parse(content) as Record<
      string,
      {
        workspace_path: string
        database_path: string
        socket_path?: string
        pid?: number
        version?: string
        started_at?: string
      }
    >

    return Object.entries(registry).map(([key, entry]) => ({
      id: key,
      name: basename(entry.workspace_path),
      path: entry.workspace_path,
      databasePath: entry.database_path,
    }))
  } catch {
    // Registry doesn't exist or is invalid
    return []
  }
}

// Detect workspaces from:
// 1. Global registry (~/.beads/registry.json)
// 2. Current working directory's .beads folder
export async function detectWorkspaces(cwd?: string): Promise<Workspace[]> {
  const workspaces: Workspace[] = []
  const seenPaths = new Set<string>()

  // 1. Get registered workspaces
  const registered = await getRegisteredWorkspaces()
  for (const ws of registered) {
    if (!seenPaths.has(ws.databasePath)) {
      workspaces.push(ws)
      seenPaths.add(ws.databasePath)
    }
  }

  // 2. Check current directory
  const startPath = cwd || process.cwd()
  const localDb = await findNearestBeadsDir(startPath)
  if (localDb && !seenPaths.has(localDb)) {
    workspaces.push({
      id: `local-${localDb}`,
      name: basename(dirname(dirname(localDb))), // Get parent folder name
      path: dirname(dirname(localDb)),
      databasePath: localDb,
    })
  }

  // 3. Check default database
  const defaultDb = await getDefaultDbPath()
  if (defaultDb && !seenPaths.has(defaultDb)) {
    workspaces.push({
      id: "default",
      name: "Default",
      path: dirname(defaultDb),
      databasePath: defaultDb,
    })
  }

  return workspaces
}

// Watch registry for changes (returns cleanup function)
export function watchRegistry(callback: () => void): () => void {
  // Import fs synchronously for watch
  const fs = require("fs")

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const cooldownMs = 1000
  let lastCallback = 0

  const watcher = fs.watch(dirname(REGISTRY_PATH), (eventType: string, filename: string) => {
    if (filename === "registry.json") {
      const now = Date.now()
      if (now - lastCallback < cooldownMs) {
        return
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        lastCallback = Date.now()
        callback()
      }, 250)
    }
  })

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    watcher.close()
  }
}
