import { NextRequest } from "next/server"
import { watch, type FSWatcher } from "fs"
import { resolveDbPath } from "@/lib/db"
import { dirname, resolve, normalize } from "path"

// Additional validation for the database directory path
function isValidDbDir(dbDir: string): boolean {
  const normalizedPath = normalize(resolve(dbDir))

  // Check for null bytes
  if (dbDir.includes("\0")) {
    return false
  }

  // Must be absolute
  if (!normalizedPath.startsWith("/")) {
    return false
  }

  // Must be a .beads directory (common pattern for beads databases)
  if (!normalizedPath.includes(".beads") && !normalizedPath.includes("beads")) {
    return false
  }

  return true
}

// Keep track of active watchers per database path
const watchers = new Map<string, { watcher: FSWatcher; clients: Set<ReadableStreamDefaultController> }>()

// Debounce settings
const DEBOUNCE_MS = 250
const COOLDOWN_MS = 1000

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const dbPath = searchParams.get("db") || undefined

  // Resolve the database path
  const resolvedDbPath = await resolveDbPath(dbPath)
  if (!resolvedDbPath) {
    return new Response("No database found", { status: 404 })
  }

  const dbDir = dirname(resolvedDbPath)

  // Validate the database directory before watching
  if (!isValidDbDir(dbDir)) {
    return new Response("Invalid database path", { status: 400 })
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Add this client to the watcher
      let watcherEntry = watchers.get(resolvedDbPath)

      if (!watcherEntry) {
        // Create a new watcher for this database
        let debounceTimer: NodeJS.Timeout | null = null
        let lastNotify = 0

        const fsWatcher = watch(dbDir, (eventType, filename) => {
          // Only react to database file changes
          if (!filename?.endsWith(".db")) return

          const now = Date.now()

          // Debounce rapid changes
          if (debounceTimer) {
            clearTimeout(debounceTimer)
          }

          debounceTimer = setTimeout(() => {
            // Apply cooldown
            if (now - lastNotify < COOLDOWN_MS) return
            lastNotify = now

            // Notify all clients
            const entry = watchers.get(resolvedDbPath)
            if (entry) {
              const message = `data: ${JSON.stringify({ type: "change", timestamp: now })}\n\n`
              entry.clients.forEach((client) => {
                try {
                  client.enqueue(new TextEncoder().encode(message))
                } catch {
                  // Client disconnected, will be cleaned up
                }
              })
            }
          }, DEBOUNCE_MS)
        })

        watcherEntry = { watcher: fsWatcher, clients: new Set() }
        watchers.set(resolvedDbPath, watcherEntry)
      }

      watcherEntry.clients.add(controller)

      // Send initial connection message
      const connectMessage = `data: ${JSON.stringify({ type: "connected", db: resolvedDbPath })}\n\n`
      controller.enqueue(new TextEncoder().encode(connectMessage))

      // Keep connection alive with periodic heartbeats
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      // Cleanup when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat)

        const entry = watchers.get(resolvedDbPath)
        if (entry) {
          entry.clients.delete(controller)

          // If no more clients, close the watcher
          if (entry.clients.size === 0) {
            entry.watcher.close()
            watchers.delete(resolvedDbPath)
          }
        }

        try {
          controller.close()
        } catch {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
