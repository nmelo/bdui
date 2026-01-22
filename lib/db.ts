import { readFile, access, stat } from "fs/promises"
import { constants } from "fs"
import { join, dirname, basename, resolve, normalize, relative } from "path"
import { homedir } from "os"

// Get the list of allowed base directories for database paths
function getAllowedBaseDirs(): string[] {
  return [
    homedir(), // User's home directory
    process.cwd(), // Current working directory
    "/tmp", // Temporary directory (for tests)
  ]
}

// Check if a path is safely contained within an allowed base directory
function isPathWithinAllowedDirs(targetPath: string): boolean {
  const normalizedTarget = resolve(targetPath)

  // Check for null bytes (path injection attack vector)
  if (targetPath.includes("\0")) {
    return false
  }

  // Verify the path is within one of the allowed base directories
  for (const baseDir of getAllowedBaseDirs()) {
    const normalizedBase = resolve(baseDir)
    const relativePath = relative(normalizedBase, normalizedTarget)

    // If relative path doesn't start with "..", target is within base
    if (!relativePath.startsWith("..") && !relativePath.startsWith("/")) {
      return true
    }
  }

  return false
}

// Validate that resolved path is a valid .db file path
function isValidDbPath(dbPath: string): boolean {
  // Must end with .db
  if (!dbPath.endsWith(".db")) {
    return false
  }

  return isPathWithinAllowedDirs(dbPath)
}

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
  // Validate the start path is within allowed directories
  if (!isPathWithinAllowedDirs(startPath)) {
    console.error("Start path not within allowed directories:", startPath)
    return null
  }

  let current = resolve(startPath)

  while (current !== "/" && isPathWithinAllowedDirs(current)) {
    const beadsDir = join(current, ".beads")

    // Verify beadsDir is still within allowed directories before accessing
    if (!isPathWithinAllowedDirs(beadsDir)) {
      current = dirname(current)
      continue
    }

    try {
      const stats = await stat(beadsDir)
      if (stats.isDirectory()) {
        // Find the .db file in this directory
        const { readdir } = await import("fs/promises")
        const files = await readdir(beadsDir)
        // Only accept .db files with safe names (no path separators)
        const dbFile = files.find((f) => f.endsWith(".db") && !f.includes("/") && !f.includes("\\"))
        if (dbFile) {
          const dbPath = join(beadsDir, dbFile)
          if (isValidDbPath(dbPath)) {
            return dbPath
          }
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
    const resolvedPath = resolve(explicitPath)
    // Validate the path is within allowed directories
    if (!isValidDbPath(resolvedPath)) {
      console.error("Invalid db path (outside allowed directories):", explicitPath)
      return null
    }
    try {
      await access(resolvedPath, constants.R_OK)
      return resolvedPath
    } catch {
      console.error("Explicit db path not accessible:", resolvedPath)
      return null
    }
  }

  // Check BEADS_DB environment variable
  const envPath = process.env.BEADS_DB
  if (envPath) {
    const resolvedEnvPath = resolve(envPath)
    if (isValidDbPath(resolvedEnvPath)) {
      try {
        await access(resolvedEnvPath, constants.R_OK)
        return resolvedEnvPath
      } catch {
        console.error("BEADS_DB path not accessible:", resolvedEnvPath)
      }
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
