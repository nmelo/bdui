export type BeadType = "bug" | "task" | "feature" | "epic" | "chore" | "message"
export type BeadStatus = "open" | "in_progress" | "closed"
export type BeadPriority = "critical" | "high" | "medium" | "low"

export interface Comment {
  id: string
  author: string
  content: string
  timestamp: Date
}

export interface Bead {
  id: string
  type: BeadType
  title: string
  description: string
  acceptanceCriteria?: string
  status: BeadStatus
  priority: BeadPriority
  assignee: string
  labels?: string[]
  comments: Comment[]
  parentId?: string
  createdAt?: Date
  updatedAt?: Date
  children?: Bead[]  // Subtasks (nested parent-child relationships)
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
