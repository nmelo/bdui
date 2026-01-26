import { execFile } from "child_process"
import { promisify } from "util"
import { existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const execFileAsync = promisify(execFile)

// Common paths where bd might be installed
const COMMON_BD_PATHS = [
  "/opt/homebrew/bin/bd",           // Homebrew on Apple Silicon
  "/usr/local/bin/bd",              // Homebrew on Intel / manual install
  join(homedir(), "go/bin/bd"),     // Go install
  join(homedir(), ".local/bin/bd"), // User local bin
  "/usr/bin/bd",                    // System install
]

// Cache the resolved bd path
let resolvedBdPath: string | null = null

// Get bd binary path - checks BD_PATH env, then common locations, then falls back to "bd"
function getBdPath(): string {
  // Use cached path if available
  if (resolvedBdPath) return resolvedBdPath

  // Check BD_PATH environment variable first
  if (process.env.BD_PATH) {
    resolvedBdPath = process.env.BD_PATH
    return resolvedBdPath
  }

  // Search common paths
  for (const path of COMMON_BD_PATHS) {
    if (existsSync(path)) {
      resolvedBdPath = path
      return resolvedBdPath
    }
  }

  // Fall back to "bd" and hope it's in PATH
  resolvedBdPath = "bd"
  return resolvedBdPath
}

export interface BdOptions {
  db?: string // Path to database file
  cwd?: string // Working directory
}

export interface BdBead {
  id: string
  title: string
  description?: string
  status: "open" | "in_progress" | "closed" | "tombstone"
  priority: number // 0-4 (0=critical, 4=low)
  issue_type: "bug" | "feature" | "task" | "epic" | "chore"
  assignee?: string
  labels: string[]
  parent?: string
  created_at: number
  updated_at: number
  closed_at?: number
  deleted_at?: string
  acceptance_criteria?: string
  notes?: string
  // Dependency fields (when this bead is a dependent of another)
  dependency_type?: "parent-child" | "blocks" | "related"
  // Epic/parent-specific
  dependents?: BdBead[]
  total_children?: number
  closed_children?: number
}

export interface BdComment {
  id: string
  author: string
  text: string
  created_at: string  // ISO date string
}

export interface BdEpicStatus {
  id: string
  title: string
  total_children: number
  closed_children: number
}

export interface BdWorkspace {
  workspace_path: string
  socket_path: string
  database_path: string
  pid: number
  version: string
  started_at: string
}

// Build argument array for bd command (prevents command injection)
function buildArgs(args: string[], options: BdOptions, includeJson: boolean): string[] {
  const result: string[] = ["--no-daemon", "--allow-stale"] // Skip daemon and staleness check
  if (options.db) {
    result.push("--db", options.db)
  }
  result.push(...args)
  if (includeJson) {
    result.push("--json")
  }
  return result
}

// Execute a bd command and return parsed JSON
async function bdExec<T>(args: string[], options: BdOptions = {}): Promise<T> {
  const execArgs = buildArgs(args, options, true)

  try {
    const { stdout, stderr } = await execFileAsync(getBdPath(), execArgs, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })

    if (stderr && !stderr.includes("Warning") && !stderr.includes("Staleness check skipped")) {
      console.error("bd stderr:", stderr)
    }

    return JSON.parse(stdout) as T
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    // Suppress "context canceled" errors during shutdown
    if (execError.message?.includes("context canceled") || execError.stderr?.includes("context canceled")) {
      throw error
    }
    console.error("bd command failed: bd", execArgs.join(" "))
    console.error("Error:", execError.message)
    if (execError.stderr) {
      console.error("Stderr:", execError.stderr)
    }
    throw error
  }
}

// Execute a bd command that doesn't return JSON
async function bdExecRaw(args: string[], options: BdOptions = {}): Promise<string> {
  const execArgs = buildArgs(args, options, false)

  const { stdout } = await execFileAsync(getBdPath(), execArgs, {
    cwd: options.cwd,
    maxBuffer: 10 * 1024 * 1024,
  })

  return stdout.trim()
}

// List all epics
export async function listEpics(options: BdOptions = {}): Promise<BdBead[]> {
  return bdExec<BdBead[]>(["list", "--type", "epic", "--status", "all", "--limit", "0"], options)
}

// Get epic status counters (total_children, closed_children for each epic)
export async function getEpicStatuses(options: BdOptions = {}): Promise<BdEpicStatus[]> {
  return bdExec<BdEpicStatus[]>(["epic", "status"], options)
}

// Get a single bead/epic by ID (includes dependents for epics)
export async function showBead(id: string, options: BdOptions = {}): Promise<BdBead> {
  const result = await bdExec<BdBead[]>(["show", id], options)
  // bd show returns an array with a single element
  return result[0]
}

// Get multiple beads by ID in a single call (includes dependents for epics)
export async function showBeads(ids: string[], options: BdOptions = {}): Promise<BdBead[]> {
  if (ids.length === 0) return []
  return bdExec<BdBead[]>(["show", ...ids], options)
}

// Get comments for a bead
export async function getComments(id: string, options: BdOptions = {}): Promise<BdComment[]> {
  return bdExec<BdComment[]>(["comments", id], options)
}

// Add a comment to a bead
export async function addComment(id: string, text: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["comment", id, text], options)
}

// Update bead status
export async function updateStatus(
  id: string,
  status: string,
  options: BdOptions = {}
): Promise<void> {
  await bdExecRaw(["update", id, "--status", status], options)
}

// Get custom statuses from bd config
export async function getCustomStatuses(options: BdOptions = {}): Promise<string[]> {
  try {
    const result = await bdExecRaw(["config", "get", "status.custom"], options)
    // Result may be a comma-separated list or single status
    const trimmed = result.trim()
    if (!trimmed) return []
    return trimmed.split(",").map(s => s.trim()).filter(Boolean)
  } catch {
    // Config key doesn't exist or other error
    return []
  }
}

// Update bead priority (0=critical, 1=high, 2=medium, 3=low, 4=none)
export async function updatePriority(id: string, priority: number, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--priority", priority.toString()], options)
}

// Update bead assignee
export async function updateAssignee(id: string, assignee: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--assignee", assignee], options)
}

// Update bead title
export async function updateTitle(id: string, title: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--title", title], options)
}

// Update bead description
export async function updateDescription(id: string, description: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--description", description], options)
}

// Update bead type
export async function updateType(
  id: string,
  type: "bug" | "feature" | "task" | "epic" | "chore",
  options: BdOptions = {}
): Promise<void> {
  await bdExecRaw(["update", id, "--type", type], options)
}

// Close a bead
export async function closeBead(id: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["close", id], options)
}

// Reopen a bead
export async function reopenBead(id: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--status", "open"], options)
}

// Delete a bead
export async function deleteBead(id: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["delete", id, "--force"], options)
}

// List all beads (not just epics)
export async function listBeads(options: BdOptions = {}): Promise<BdBead[]> {
  return bdExec<BdBead[]>(["list", "--status", "all", "--limit", "0"], options)
}

// Get beads that are ready (no blockers)
export async function listReady(options: BdOptions = {}): Promise<BdBead[]> {
  return bdExec<BdBead[]>(["ready"], options)
}

// Map bd priority number to our priority type
export function mapPriority(priority: number): "critical" | "high" | "medium" | "low" {
  switch (priority) {
    case 0:
      return "critical"
    case 1:
      return "high"
    case 2:
      return "medium"
    case 3:
    case 4:
    default:
      return "low"
  }
}

// Map our priority type to bd priority number
export function unmapPriority(priority: "critical" | "high" | "medium" | "low"): number {
  switch (priority) {
    case "critical":
      return 0
    case "high":
      return 1
    case "medium":
      return 2
    case "low":
      return 3
  }
}

// Update bead parent (move bead to a different epic)
export async function updateParent(
  id: string,
  parentId: string | null,
  options: BdOptions = {}
): Promise<void> {
  const args = parentId
    ? ["update", id, "--parent", parentId]
    : ["update", id, "--parent", ""] // Empty string removes parent
  await bdExecRaw(args, options)
}

// Map bd issue_type to our BeadType
export function mapType(type?: string): "bug" | "task" | "feature" | "epic" | "chore" | "message" | "gate" {
  if (!type) return "task"
  switch (type.toLowerCase()) {
    case "bug":
      return "bug"
    case "feature":
      return "feature"
    case "epic":
      return "epic"
    case "chore":
      return "chore"
    case "message":
      return "message"
    case "gate":
      return "gate"
    case "task":
    default:
      return "task"
  }
}

// Dependency types returned by bd dep list
export interface BdDependency {
  id: string
  title: string
  status: string
  dependency_type: "blocks" | "parent-child" | "related"
}

// List dependencies for a bead (beads that this bead depends on)
export async function listDependencies(id: string, options: BdOptions = {}): Promise<BdDependency[]> {
  return bdExec<BdDependency[]>(["dep", "list", id], options)
}

// List dependents for a bead (beads that depend on this bead)
export async function listDependents(id: string, options: BdOptions = {}): Promise<BdDependency[]> {
  return bdExec<BdDependency[]>(["dep", "list", id, "--direction=up"], options)
}

// Add a label to a bead
export async function addLabel(id: string, label: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--add-label", label], options)
}

// Remove a label from a bead
export async function removeLabel(id: string, label: string, options: BdOptions = {}): Promise<void> {
  await bdExecRaw(["update", id, "--remove-label", label], options)
}
