"use server"

import {
  listEpics,
  listBeads,
  showBead,
  getComments,
  getEpicStatuses,
  mapPriority,
  mapType,
  type BdBead,
  type BdComment,
  type BdOptions,
} from "@/lib/bd"
import type { Epic, Bead, Comment, BeadStatus, BeadPriority, BeadType } from "@/lib/types"

// Convert bd timestamp (unix seconds) to Date
function toDate(timestamp?: number): Date | undefined {
  if (!timestamp) return undefined
  return new Date(timestamp * 1000)
}

// Convert BdComment to Comment
function convertComment(bdComment: BdComment): Comment {
  return {
    id: bdComment.id,
    author: bdComment.author,
    content: bdComment.text,
    timestamp: new Date(bdComment.created_at * 1000),
  }
}

// Convert BdBead to Bead (without children/childEpics)
function convertBead(bdBead: BdBead, comments: Comment[] = []): Bead {
  return {
    id: bdBead.id,
    type: mapType(bdBead.issue_type) as BeadType,
    title: bdBead.title,
    description: bdBead.description || "",
    acceptanceCriteria: bdBead.acceptance_criteria,
    status: bdBead.status as BeadStatus,
    priority: mapPriority(bdBead.priority) as BeadPriority,
    assignee: bdBead.assignee || "",
    labels: bdBead.labels || [],
    comments,
    parentId: bdBead.parent,
    createdAt: toDate(bdBead.created_at),
    updatedAt: toDate(bdBead.updated_at),
  }
}

// Build epic hierarchy from flat list of beads
async function buildEpicHierarchy(options: BdOptions = {}): Promise<Epic[]> {
  // Get all epics
  const bdEpics = await listEpics(options)

  // Get epic status counters
  let epicStatuses: Map<string, { total: number; closed: number }> = new Map()
  try {
    const statuses = await getEpicStatuses(options)
    epicStatuses = new Map(
      statuses.map((s) => [s.id, { total: s.total_children, closed: s.closed_children }])
    )
  } catch {
    // Epic status command might not exist in older versions
  }

  // For each epic, get its full details including dependents
  const epicsWithDetails = await Promise.all(
    bdEpics.map(async (epic) => {
      try {
        const fullEpic = await showBead(epic.id, options)
        const comments = await getComments(epic.id, options).catch(() => [])
        return { epic: fullEpic, comments: comments.map(convertComment) }
      } catch {
        return { epic, comments: [] as Comment[] }
      }
    })
  )

  // Build a map of id -> Epic for quick lookup
  const epicMap = new Map<string, Epic>()
  const childEpicIds = new Set<string>() // Track which epics are children

  // First pass: create all Epic objects
  for (const { epic: bdEpic, comments } of epicsWithDetails) {
    const baseBead = convertBead(bdEpic, comments)
    const status = epicStatuses.get(bdEpic.id)

    const epic: Epic = {
      ...baseBead,
      type: "epic",
      children: [],
      childEpics: [],
    }

    epicMap.set(bdEpic.id, epic)

    // Track if this epic has a parent
    if (bdEpic.parent && epicMap.has(bdEpic.parent)) {
      childEpicIds.add(bdEpic.id)
    }
  }

  // Second pass: populate children and childEpics
  for (const { epic: bdEpic } of epicsWithDetails) {
    const epic = epicMap.get(bdEpic.id)!

    // Add dependents as children
    if (bdEpic.dependents) {
      for (const dependent of bdEpic.dependents) {
        if (dependent.issue_type === "epic") {
          // This is a child epic
          const childEpic = epicMap.get(dependent.id)
          if (childEpic) {
            epic.childEpics!.push(childEpic)
            childEpicIds.add(dependent.id)
          }
        } else {
          // Regular bead
          epic.children.push(convertBead(dependent))
        }
      }
    }
  }

  // Get top-level epics (those without parents or whose parents are not epics)
  const topLevelEpics = Array.from(epicMap.values()).filter((epic) => !childEpicIds.has(epic.id))

  // Now fetch all beads to find orphans (beads with no parent that aren't epics)
  const allBeads = await listBeads(options)
  const epicIds = new Set(bdEpics.map((e) => e.id))
  const beadsUnderEpics = new Set<string>()

  // Track all beads that are children of epics
  for (const { epic: bdEpic } of epicsWithDetails) {
    if (bdEpic.dependents) {
      for (const dep of bdEpic.dependents) {
        beadsUnderEpics.add(dep.id)
      }
    }
  }

  // Find orphan beads: not an epic, and not a child of any epic
  const orphanBeads = allBeads.filter(
    (bead) => !epicIds.has(bead.id) && !beadsUnderEpics.has(bead.id) && !bead.parent
  )

  // If there are orphan beads, create a synthetic epic to hold them
  if (orphanBeads.length > 0) {
    const orphanEpic: Epic = {
      id: "__orphans__",
      type: "epic",
      title: "Beads (No Epic)",
      description: "Beads without a parent epic",
      status: "open",
      priority: "low",
      assignee: "",
      labels: [],
      comments: [],
      children: orphanBeads.map((b) => convertBead(b)),
      childEpics: [],
    }
    topLevelEpics.push(orphanEpic)
  }

  return topLevelEpics
}

// Get all epics with their hierarchy
export async function getEpics(dbPath?: string): Promise<Epic[]> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}
  return buildEpicHierarchy(options)
}

// Get a single bead with full details
export async function getBeadDetail(id: string, dbPath?: string): Promise<Bead | null> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    const bdBead = await showBead(id, options)
    const comments = await getComments(id, options).catch(() => [])
    return convertBead(bdBead, comments.map(convertComment))
  } catch {
    return null
  }
}

// Get comments for a bead
export async function getBeadComments(id: string, dbPath?: string): Promise<Comment[]> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    const bdComments = await getComments(id, options)
    return bdComments.map(convertComment)
  } catch {
    return []
  }
}
