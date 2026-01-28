"use server"

import {
  listBeads,
  showBead,
  showBeads,
  getComments,
  listDependencies,
  listDependents,
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
    timestamp: new Date(bdComment.created_at),
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
// Optimized: uses only 2 bd CLI calls instead of N+1
async function buildEpicHierarchy(options: BdOptions = {}): Promise<Epic[]> {
  // Step 1: Get ALL beads in one call (includes parent field)
  const allBeads = await listBeads(options)

  // Separate epics from regular beads
  const epicBeads = allBeads.filter(b => b.issue_type === "epic")
  const nonEpicBeads = allBeads.filter(b => b.issue_type !== "epic")

  // Step 2: Get all epics with their dependents in ONE batched call
  const epicIds = epicBeads.map(e => e.id)
  let epicsWithDependents: BdBead[] = []
  if (epicIds.length > 0) {
    try {
      epicsWithDependents = await showBeads(epicIds, options)
    } catch {
      // Fallback: use basic epic data without dependents
      epicsWithDependents = epicBeads
    }
  }

  // Build lookup maps for O(1) access
  const beadById = new Map<string, BdBead>(allBeads.map(b => [b.id, b]))
  const epicDependentsById = new Map<string, BdBead[]>(
    epicsWithDependents.map(e => [e.id, e.dependents || []])
  )

  // Find non-epic beads that have children (dependent_count > 0)
  // These need their dependents fetched to build subtask hierarchy
  const parentBeadIds = nonEpicBeads
    .filter(b => (b.dependent_count ?? 0) > 0)
    .map(b => b.id)

  // Fetch dependents for parent beads in one batched call
  const childrenByParent = new Map<string, BdBead[]>()
  if (parentBeadIds.length > 0) {
    try {
      const parentBeadsWithDeps = await showBeads(parentBeadIds, options)
      for (const parent of parentBeadsWithDeps) {
        const children = (parent.dependents || [])
          .filter(d => d.dependency_type === "parent-child")
          .filter(d => d.status !== "tombstone" && !d.deleted_at)
        if (children.length > 0) {
          childrenByParent.set(parent.id, children)
        }
      }
    } catch {
      // Ignore errors - subtasks just won't be nested
    }
  }

  // Recursively build bead with children (no network calls - all from memory)
  function buildBeadWithChildren(bdBead: BdBead, depth: number = 0): Bead {
    const baseBead = convertBead(bdBead)
    if (depth >= 5) return baseBead // Max depth

    const children = childrenByParent.get(bdBead.id) || []
    if (children.length === 0) return baseBead

    return {
      ...baseBead,
      children: children.map(child => buildBeadWithChildren(child, depth + 1)),
    }
  }

  // Build Epic objects
  const epicMap = new Map<string, Epic>()
  const childEpicIds = new Set<string>()

  // First pass: create all Epic objects
  for (const bdEpic of epicsWithDependents) {
    const epic: Epic = {
      ...convertBead(bdEpic),
      type: "epic",
      children: [],
      childEpics: [],
    }
    epicMap.set(bdEpic.id, epic)
  }

  // Second pass: populate children and childEpics from dependents
  for (const bdEpic of epicsWithDependents) {
    const epic = epicMap.get(bdEpic.id)!
    const dependents = epicDependentsById.get(bdEpic.id) || []

    for (const dependent of dependents) {
      if (dependent.dependency_type !== "parent-child") continue
      // Skip deleted/tombstoned beads
      if (dependent.status === "tombstone" || dependent.deleted_at) continue

      if (dependent.issue_type === "epic") {
        // Child epic
        const childEpic = epicMap.get(dependent.id)
        if (childEpic) {
          childEpic.parentId = epic.id
          epic.childEpics!.push(childEpic)
          childEpicIds.add(dependent.id)
        }
      } else {
        // Regular bead - build with subtasks from memory
        const fullBead = beadById.get(dependent.id) || dependent
        const childBead = buildBeadWithChildren(fullBead)
        childBead.parentId = epic.id
        epic.children.push(childBead)
      }
    }
  }

  // Get top-level epics
  const topLevelEpics = Array.from(epicMap.values()).filter(e => !childEpicIds.has(e.id))

  // Find orphan beads (not under any epic, not a child of any parent bead)
  const beadsUnderEpics = new Set<string>()
  for (const bdEpic of epicsWithDependents) {
    const dependents = epicDependentsById.get(bdEpic.id) || []
    for (const dep of dependents) {
      beadsUnderEpics.add(dep.id)
    }
  }

  // Also track beads that are children of non-epic parents
  const beadsUnderParents = new Set<string>()
  for (const children of childrenByParent.values()) {
    for (const child of children) {
      beadsUnderParents.add(child.id)
    }
  }

  const orphanBeads = nonEpicBeads.filter(
    bead => !beadsUnderEpics.has(bead.id) && !beadsUnderParents.has(bead.id)
  )

  if (orphanBeads.length > 0) {
    const orphanEpic: Epic = {
      id: "_standalone",
      type: "epic",
      title: "Beads (No Epic)",
      description: "Beads without a parent epic",
      status: "open",
      priority: "low",
      assignee: "",
      labels: [],
      comments: [],
      children: orphanBeads.map(b => buildBeadWithChildren(b)),
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
    const [bdBead, comments, deps, dependents] = await Promise.all([
      showBead(id, options),
      getComments(id, options).catch(() => []),
      listDependencies(id, options).catch(() => []),
      listDependents(id, options).catch(() => []),
    ])

    const bead = convertBead(bdBead, comments.map(convertComment))

    // Add blocking dependencies
    const blockedBy = deps
      .filter(d => d.dependency_type === "blocks")
      .map(d => ({ id: d.id, title: d.title }))
    const blocks = dependents
      .filter(d => d.dependency_type === "blocks")
      .map(d => ({ id: d.id, title: d.title }))

    return {
      ...bead,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      blocks: blocks.length > 0 ? blocks : undefined,
    }
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
