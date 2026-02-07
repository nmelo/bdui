export type BeadType = "bug" | "task" | "feature" | "epic" | "chore" | "message" | "gate"

// Core statuses that always exist
export type CoreStatus = "open" | "in_progress" | "closed"

// BeadStatus can be a core status or any custom string
export type BeadStatus = CoreStatus | (string & {})
export type BeadPriority = "critical" | "high" | "medium" | "low"

export interface Comment {
  id: string
  author: string
  content: string
  timestamp: Date
}

export interface BeadDependency {
  id: string
  title: string
}

export interface Bead {
  id: string
  type: BeadType
  title: string
  description: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  externalRef?: string
  status: BeadStatus
  priority: BeadPriority
  assignee: string
  labels?: string[]
  comments: Comment[]
  parentId?: string
  createdAt?: Date
  updatedAt?: Date
  children?: Bead[]  // Subtasks (nested parent-child relationships)
  blockedBy?: BeadDependency[]  // Beads that must complete before this one
  blocks?: BeadDependency[]     // Beads waiting on this one to complete
}

export interface Epic extends Bead {
  type: "epic"
  children: Bead[]
  childEpics?: Epic[]
}

export interface Workspace {
  id: string
  name: string
  path?: string
  databasePath?: string
}
