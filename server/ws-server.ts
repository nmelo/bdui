import { WebSocketServer, WebSocket } from "ws"
import { watch, FSWatcher } from "fs"
import { dirname, resolve, relative } from "path"
import { homedir } from "os"

const PORT = parseInt(process.env.WS_PORT || "3001", 10)
const DEBOUNCE_MS = 250
const COOLDOWN_MS = 1000

interface WatcherEntry {
  watcher: FSWatcher
  clients: Set<WebSocket>
  debounceTimer: NodeJS.Timeout | null
  lastNotify: number
}

const watchers = new Map<string, WatcherEntry>()

function isValidDbPath(dbPath: string): boolean {
  if (dbPath.includes("\0")) return false
  const dbDir = dirname(resolve(dbPath))
  if (!dbDir.endsWith(".beads")) return false
  const allowed = [homedir(), process.cwd(), "/tmp"]
  return allowed.some((base) => {
    const rel = relative(resolve(base), dbDir)
    return !rel.startsWith("..") && !rel.startsWith("/")
  })
}

function broadcast(dbPath: string, msg: object) {
  const entry = watchers.get(dbPath)
  if (!entry) return
  const data = JSON.stringify(msg)
  entry.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.send(data))
}

const wss = new WebSocketServer({ port: PORT })

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`)
  const dbPath = url.searchParams.get("db")

  if (!dbPath || !isValidDbPath(dbPath)) {
    ws.close(4000, "Invalid db path")
    return
  }

  let entry = watchers.get(dbPath)
  if (!entry) {
    const fsWatcher = watch(dirname(dbPath), (_, filename) => {
      if (!filename?.endsWith(".db")) return
      const e = watchers.get(dbPath)
      if (!e) return
      if (e.debounceTimer) clearTimeout(e.debounceTimer)
      e.debounceTimer = setTimeout(() => {
        const now = Date.now()
        if (now - e.lastNotify < COOLDOWN_MS) return
        e.lastNotify = now
        broadcast(dbPath, { type: "change", timestamp: now })
      }, DEBOUNCE_MS)
    })
    entry = { watcher: fsWatcher, clients: new Set(), debounceTimer: null, lastNotify: 0 }
    watchers.set(dbPath, entry)
  }

  entry.clients.add(ws)
  ws.send(JSON.stringify({ type: "connected", db: dbPath }))

  const heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.ping(), 30000)

  ws.on("close", () => {
    clearInterval(heartbeat)
    const e = watchers.get(dbPath)
    if (e) {
      e.clients.delete(ws)
      if (e.clients.size === 0) {
        if (e.debounceTimer) clearTimeout(e.debounceTimer)
        e.watcher.close()
        watchers.delete(dbPath)
      }
    }
  })
})

console.log(`WebSocket server running on ws://localhost:${PORT}`)
