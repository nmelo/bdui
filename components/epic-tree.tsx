"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  CircleDot,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  Trash2,
  Archive,
  Inbox,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { BeadTable } from "@/components/bead-table"
import { CopyableId } from "@/components/copyable-id"
import type { Epic, Bead, BeadStatus, BeadPriority } from "@/lib/types"
import { cn } from "@/lib/utils"

// Core status configurations
const coreStatusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  open: {
    label: "Open",
    className: "bg-white/10 text-white border-white/30",
    icon: <Circle className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    icon: <CircleDot className="h-3 w-3" />,
  },
  closed: {
    label: "Closed",
    className: "bg-zinc-600/20 text-zinc-400 border-zinc-500/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  // Well-known custom statuses
  ready_for_qa: {
    label: "Ready for QA",
    className: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    icon: <CircleDot className="h-3 w-3" />,
  },
  ready_to_ship: {
    label: "Ready to Ship",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
}

// Get status config with fallback for unknown custom statuses
function getStatusConfig(status: string): { label: string; className: string; icon: React.ReactNode } {
  if (coreStatusConfig[status]) {
    return coreStatusConfig[status]
  }
  // Fallback for unknown custom statuses
  return {
    label: status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    className: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    icon: <Circle className="h-3 w-3" />,
  }
}

const priorityConfig: Record<BeadPriority, { label: string; className: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    className: "bg-red-500/20 text-red-400 border-red-500/40",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  high: {
    label: "High",
    className: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    icon: <ArrowUp className="h-3 w-3" />,
  },
  medium: {
    label: "Medium",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    icon: <Minus className="h-3 w-3" />,
  },
  low: {
    label: "Low",
    className: "bg-slate-500/20 text-slate-400 border-slate-500/40",
    icon: <ArrowDown className="h-3 w-3" />,
  },
}

const fallbackConfig = {
  label: "Unknown",
  className: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  icon: <Circle className="h-3 w-3" />,
}

function PillBadge({
  config,
}: {
  config: { label: string; className: string; icon: React.ReactNode } | undefined
}) {
  const c = config || fallbackConfig
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        c.className
      )}
    >
      {c.icon}
      {c.label}
    </span>
  )
}

interface EpicTreeProps {
  epics: Epic[]
  archivedEpics?: Epic[]
  backlogEpics?: Epic[]
  backlogBeads?: Bead[]
  expandedEpics: Set<string>
  onToggleEpic: (epicId: string) => void
  onBeadClick: (bead: Bead) => void
  onStatusChange: (beadId: string, status: BeadStatus) => void
  onPriorityChange: (beadId: string, priority: BeadPriority) => void
  onDelete?: (beadId: string) => void
  onBeadMove?: (beadId: string, targetEpicId: string) => void
  canMoveEpic?: (epicId: string, targetEpicId: string) => boolean
  dragOverEpicId?: string | null
  onDragOver?: (epicId: string | null) => void
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
  expandedBeads?: Set<string>
  onToggleBead?: (beadId: string) => void
  focusedItemId?: string | null
  onFocusItem?: (id: string | null) => void
  onArchive?: (id: string, archived: boolean) => void
  onBacklog?: (id: string, inBacklog: boolean) => void
}

// Depth-based left border colors
const depthBorderColors = [
  "border-l-emerald-500",
  "border-l-teal-500",
  "border-l-cyan-500",
  "border-l-sky-500",
  "border-l-blue-500",
]

// Depth-based background styles (progressively darker/inset)
const depthStyles = [
  { bg: "bg-card", shadow: "shadow-lg" },
  { bg: "bg-slate-800/60", shadow: "shadow-inner" },
  { bg: "bg-slate-850/70", shadow: "shadow-inner" },
  { bg: "bg-slate-900/60", shadow: "shadow-inner" },
  { bg: "bg-slate-900/80", shadow: "shadow-inner" },
]

// Recursively count closed and total from a bead and its subtasks
function countBeadAndSubtasks(bead: Bead): { closed: number; total: number } {
  let closed = bead.status === "closed" ? 1 : 0
  let total = 1

  // Recursively count subtasks
  if (bead.children && bead.children.length > 0) {
    for (const child of bead.children) {
      const childCounts = countBeadAndSubtasks(child)
      closed += childCounts.closed
      total += childCounts.total
    }
  }

  return { closed, total }
}

// Recursively calculate closed and total counts from all descendants
function getAggregatedCounts(epic: Epic): { closed: number; total: number } {
  let closed = 0
  let total = 0

  // Count direct child beads and their subtasks
  for (const child of epic.children) {
    const childCounts = countBeadAndSubtasks(child)
    closed += childCounts.closed
    total += childCounts.total
  }

  // Recursively count from child epics
  if (epic.childEpics && epic.childEpics.length > 0) {
    for (const childEpic of epic.childEpics) {
      const childCounts = getAggregatedCounts(childEpic)
      closed += childCounts.closed
      total += childCounts.total
    }
  }

  return { closed, total }
}

export function EpicTree({
  epics,
  archivedEpics = [],
  backlogEpics = [],
  backlogBeads = [],
  expandedEpics,
  onToggleEpic,
  onBeadClick,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onBeadMove,
  canMoveEpic,
  dragOverEpicId,
  onDragOver,
  onDragStart,
  onDragEnd,
  draggedBeadId,
  expandedBeads,
  onToggleBead,
  focusedItemId,
  onFocusItem,
  onArchive,
  onBacklog,
}: EpicTreeProps) {
  const [isDraggingToArchive, setIsDraggingToArchive] = useState(false)
  const [isDraggingToUnarchive, setIsDraggingToUnarchive] = useState(false)
  const [isDraggingToBacklog, setIsDraggingToBacklog] = useState(false)
  const [isDraggingFromBacklog, setIsDraggingFromBacklog] = useState(false)

  // Helper to check if an ID exists anywhere in a bead tree (including subtasks)
  const isInBeadTree = (id: string, beads: Bead[]): boolean => {
    for (const bead of beads) {
      if (bead.id === id) return true
      if (bead.children && isInBeadTree(id, bead.children)) return true
    }
    return false
  }

  // Helper to check if an ID exists anywhere in an epic tree
  const isInEpicTree = (id: string, epicList: Epic[]): boolean => {
    for (const epic of epicList) {
      if (epic.id === id) return true
      if (isInBeadTree(id, epic.children)) return true
      if (epic.childEpics && isInEpicTree(id, epic.childEpics)) return true
    }
    return false
  }

  // Check if the dragged item is from backlog (including nested items)
  const isBacklogItem = draggedBeadId && (
    isInEpicTree(draggedBeadId, backlogEpics) ||
    isInBeadTree(draggedBeadId, backlogBeads)
  )

  // Check if dragged item is from archive (including nested items)
  const isArchivedItem = draggedBeadId && isInEpicTree(draggedBeadId, archivedEpics)

  return (
    <div className="space-y-3">
      {/* Active epics */}
      {epics.map((epic, index) => (
        <EpicRow
          key={`${epic.id}-${index}`}
          epic={epic}
          depth={0}
          expandedEpics={expandedEpics}
          onToggle={onToggleEpic}
          onBeadClick={onBeadClick}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onRequestDelete={onDelete}
          onBeadMove={onBeadMove}
          canMoveEpic={canMoveEpic}
          dragOverEpicId={dragOverEpicId}
          onDragOver={onDragOver}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          draggedBeadId={draggedBeadId}
          expandedBeads={expandedBeads}
          onToggleBead={onToggleBead}
          focusedItemId={focusedItemId}
          onFocusItem={onFocusItem}
        />
      ))}

      {/* Top-level drop zone for making epics top-level */}
      {draggedBeadId && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-3 text-center text-sm text-muted-foreground transition-colors",
            dragOverEpicId === "_toplevel" ? "border-emerald-500 bg-emerald-500/10" : "border-border"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            onDragOver?.("_toplevel")
          }}
          onDragLeave={() => onDragOver?.(null)}
          onDrop={(e) => {
            e.preventDefault()
            try {
              const data = JSON.parse(e.dataTransfer.getData("text/plain"))
              if (data.type === "epic") {
                onBeadMove?.(data.beadId, "_standalone")
              }
            } catch {
              // Invalid drag data
            }
            onDragOver?.(null)
          }}
        >
          Drop here to make top-level epic
        </div>
      )}

      {/* Backlog drop zone - hide when dragging from backlog or archive */}
      {draggedBeadId && onBacklog && !isBacklogItem && !isArchivedItem && (
        <div
          className={cn(
            "mt-4 border-2 border-dashed rounded-lg p-4 transition-colors",
            isDraggingToBacklog ? "border-blue-500 bg-blue-500/10" : "border-muted-foreground/30"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            setIsDraggingToBacklog(true)
          }}
          onDragLeave={() => setIsDraggingToBacklog(false)}
          onDrop={(e) => {
            e.preventDefault()
            try {
              const data = JSON.parse(e.dataTransfer.getData("text/plain"))
              if (data.beadId) {
                onBacklog(data.beadId, true)
              }
            } catch {
              // Invalid drag data
            }
            setIsDraggingToBacklog(false)
          }}
        >
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Inbox className="h-4 w-4" />
            <span className="text-sm">Drop here to move to backlog</span>
          </div>
        </div>
      )}

      {/* Archive drop zone - hide when dragging from archive */}
      {draggedBeadId && onArchive && !isArchivedItem && (
        <div
          className={cn(
            "mt-4 border-2 border-dashed rounded-lg p-4 transition-colors",
            isDraggingToArchive ? "border-amber-500 bg-amber-500/10" : "border-muted-foreground/30"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            setIsDraggingToArchive(true)
          }}
          onDragLeave={() => setIsDraggingToArchive(false)}
          onDrop={(e) => {
            e.preventDefault()
            try {
              const data = JSON.parse(e.dataTransfer.getData("text/plain"))
              if (data.beadId) {
                onArchive(data.beadId, true)
              }
            } catch {
              // Invalid drag data
            }
            setIsDraggingToArchive(false)
          }}
        >
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Archive className="h-4 w-4" />
            <span className="text-sm">Drop here to archive</span>
          </div>
        </div>
      )}

      {/* Backlog section */}
      {(backlogEpics.length > 0 || backlogBeads.length > 0) && (
        <div className="mt-8">
          {/* Restore from backlog drop zone */}
          {draggedBeadId && onBacklog && isBacklogItem && (
            <div
              className={cn(
                "mb-4 border-2 border-dashed rounded-lg p-4 transition-colors",
                isDraggingFromBacklog ? "border-emerald-500 bg-emerald-500/10" : "border-muted-foreground/30"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                setIsDraggingFromBacklog(true)
              }}
              onDragLeave={() => setIsDraggingFromBacklog(false)}
              onDrop={(e) => {
                e.preventDefault()
                try {
                  const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                  if (data.beadId) {
                    onBacklog(data.beadId, false)
                  }
                } catch {
                  // Invalid drag data
                }
                setIsDraggingFromBacklog(false)
              }}
            >
              <div className="flex items-center justify-center gap-2 text-emerald-500">
                <Inbox className="h-4 w-4" />
                <span className="text-sm font-medium">Drop here to restore from backlog</span>
              </div>
            </div>
          )}

          <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Backlog ({backlogEpics.length + backlogBeads.length})
          </div>
          <div className="space-y-3 opacity-60">
            {/* Backlog epics */}
            {backlogEpics.map((epic, index) => (
              <EpicRow
                key={`backlog-${epic.id}-${index}`}
                epic={epic}
                depth={0}
                expandedEpics={expandedEpics}
                onToggle={onToggleEpic}
                onBeadClick={onBeadClick}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
                onRequestDelete={onDelete}
                onBeadMove={onBeadMove}
                canMoveEpic={canMoveEpic}
                dragOverEpicId={dragOverEpicId}
                onDragOver={onDragOver}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                draggedBeadId={draggedBeadId}
                expandedBeads={expandedBeads}
                onToggleBead={onToggleBead}
                focusedItemId={focusedItemId}
                onFocusItem={onFocusItem}
                isBacklog
              />
            ))}
            {/* Backlog loose beads */}
            {backlogBeads.length > 0 && (
              <Card className="overflow-hidden border-l-4 border-border/50 border-l-blue-400 bg-card shadow-lg !py-0 !gap-0">
                <BeadTable
                  beads={backlogBeads}
                  onBeadClick={onBeadClick}
                  onStatusChange={onStatusChange}
                  onPriorityChange={onPriorityChange}
                  onDelete={onDelete}
                  epicId="_standalone"
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  draggedBeadId={draggedBeadId}
                  expandedBeads={expandedBeads}
                  onToggleBead={onToggleBead}
                  focusedItemId={focusedItemId}
                  onFocusItem={onFocusItem}
                />
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Archived epics section */}
      {archivedEpics.length > 0 && (
        <div className="mt-8">
          {/* Restore from archive drop zone */}
          {draggedBeadId && onArchive && isArchivedItem && (
            <div
              className={cn(
                "mb-4 border-2 border-dashed rounded-lg p-4 transition-colors",
                isDraggingToUnarchive ? "border-emerald-500 bg-emerald-500/10" : "border-muted-foreground/30"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = "move"
                setIsDraggingToUnarchive(true)
              }}
              onDragLeave={() => setIsDraggingToUnarchive(false)}
              onDrop={(e) => {
                e.preventDefault()
                try {
                  const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                  if (data.beadId) {
                    onArchive(data.beadId, false)
                  }
                } catch {
                  // Invalid drag data
                }
                setIsDraggingToUnarchive(false)
              }}
            >
              <div className="flex items-center justify-center gap-2 text-emerald-500">
                <Archive className="h-4 w-4" />
                <span className="text-sm font-medium">Drop here to restore from archive</span>
              </div>
            </div>
          )}

          <div className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Archived ({archivedEpics.length})
          </div>
          <div className="space-y-3 opacity-50">
            {archivedEpics.map((epic, index) => (
              <EpicRow
                key={`archived-${epic.id}-${index}`}
                epic={epic}
                depth={0}
                expandedEpics={expandedEpics}
                onToggle={onToggleEpic}
                onBeadClick={onBeadClick}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
                onRequestDelete={onDelete}
                onBeadMove={onBeadMove}
                canMoveEpic={canMoveEpic}
                dragOverEpicId={dragOverEpicId}
                onDragOver={onDragOver}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                draggedBeadId={draggedBeadId}
                expandedBeads={expandedBeads}
                onToggleBead={onToggleBead}
                focusedItemId={focusedItemId}
                onFocusItem={onFocusItem}
                isArchived
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface EpicRowProps {
  epic: Epic
  depth: number
  expandedEpics: Set<string>
  onToggle: (epicId: string) => void
  onBeadClick: (bead: Bead) => void
  onStatusChange: (beadId: string, status: BeadStatus) => void
  onPriorityChange: (beadId: string, priority: BeadPriority) => void
  onRequestDelete?: (beadId: string) => void
  onBeadMove?: (beadId: string, targetEpicId: string) => void
  canMoveEpic?: (epicId: string, targetEpicId: string) => boolean
  dragOverEpicId?: string | null
  onDragOver?: (epicId: string | null) => void
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
  expandedBeads?: Set<string>
  onToggleBead?: (beadId: string) => void
  focusedItemId?: string | null
  onFocusItem?: (id: string | null) => void
  isArchived?: boolean
  isBacklog?: boolean
}

function EpicRow({
  epic,
  depth,
  expandedEpics,
  onToggle,
  onBeadClick,
  onStatusChange,
  onPriorityChange,
  onRequestDelete,
  onBeadMove,
  canMoveEpic,
  dragOverEpicId,
  onDragOver,
  onDragStart,
  onDragEnd,
  draggedBeadId,
  expandedBeads,
  onToggleBead,
  focusedItemId,
  onFocusItem,
  isArchived = false,
  isBacklog = false,
}: EpicRowProps) {
  const isExpanded = expandedEpics.has(epic.id)
  const { closed: closedCount, total: totalCount } = getAggregatedCounts(epic)
  const progress = totalCount > 0 ? (closedCount / totalCount) * 100 : 0

  const hasChildEpics = epic.childEpics && epic.childEpics.length > 0
  const hasChildBeads = epic.children.length > 0
  const hasContent = hasChildEpics || hasChildBeads
  const isEmpty = !hasContent

  // Calculate left margin based on depth (for nested epics)
  const depthMargin = depth * 12
  const isStandalone = epic.id === "_standalone"
  const borderColor = isStandalone ? "border-l-blue-400" : depthBorderColors[Math.min(depth, depthBorderColors.length - 1)]
  const { bg, shadow } = depthStyles[Math.min(depth, depthStyles.length - 1)]

  // All epics are draggable (except the special _standalone pseudo-epic)
  // - Nested epics can be moved to other parents
  // - Top-level epics can be archived
  // - Archived epics can be unarchived
  const isDraggable = !isStandalone

  return (
    <Card
      data-item-id={epic.id}
      className={cn(
        "overflow-hidden border-l-4 border-border/50 !py-0 !gap-0",
        borderColor,
        bg,
        shadow,
        focusedItemId === epic.id && "ring-2 ring-primary"
      )}
      style={{ marginLeft: depthMargin }}
    >
      <div
        draggable={isDraggable}
        className={cn(
          "w-full px-4 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors",
          dragOverEpicId === epic.id && "ring-2 ring-emerald-500 ring-inset bg-emerald-500/10",
          draggedBeadId === epic.id && "opacity-50"
        )}
        onDragStart={(e) => {
          if (isDraggable) {
            e.dataTransfer.setData("text/plain", JSON.stringify({ beadId: epic.id, sourceEpicId: epic.parentId, type: "epic" }))
            e.dataTransfer.effectAllowed = "move"
            onDragStart?.(epic.id)
          }
        }}
        onDragEnd={() => onDragEnd?.()}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          onDragOver?.(epic.id)
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the container entirely (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onDragOver?.(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"))
            if (data.sourceEpicId !== epic.id) {
              if (data.type === "epic") {
                // Validate epic move: can't drop on self or create cycles
                if (data.beadId === epic.id) return
                if (canMoveEpic && !canMoveEpic(data.beadId, epic.id)) return
              }
              onBeadMove?.(data.beadId, epic.id)
            }
          } catch {
            // Invalid drag data
          }
          onDragOver?.(null)
        }}
      >
        {/* Chevron button - expand/collapse only */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(epic.id)
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )
          ) : (
            <div className="w-5" />
          )}
        </button>

        {/* Clickable row area for viewing epic details */}
        <div
          className={cn(
            "flex-1 flex items-center gap-3 min-w-0",
            !isStandalone && "cursor-pointer"
          )}
          onClick={() => !isStandalone && onBeadClick(epic)}
        >
          {!isStandalone && <CopyableId id={epic.id} className="w-28 shrink-0" />}

          <span className="font-medium text-foreground flex-1 truncate">
            {epic.title}
          </span>
        </div>

        {!isStandalone && (
          <>
            <PillBadge config={getStatusConfig(epic.status)} />
            <PillBadge config={priorityConfig[epic.priority]} />
          </>
        )}

        {/* Delete button for empty epics */}
        {onRequestDelete && isEmpty && !isStandalone && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onRequestDelete(epic.id)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation()
                e.preventDefault()
                onRequestDelete(epic.id)
              }
            }}
            className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
            title="Delete empty epic"
          >
            <Trash2 className="h-4 w-4" />
          </div>
        )}

        {/* Enhanced Progress Bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-36 group">
            <div className="relative h-3 bg-slate-700/60 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 rounded-full transition-all duration-500 ease-out group-hover:brightness-125 group-hover:shadow-[0_0_12px_rgba(34,197,94,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className={cn(
            "text-sm font-mono min-w-[90px] text-right",
            closedCount === totalCount && totalCount > 0 ? "text-emerald-400" : "text-muted-foreground"
          )}>
            {closedCount}/{totalCount} ({Math.round(progress)}%)
          </span>
        </div>
      </div>

      {isExpanded && hasContent && (
        <div className="border-t border-border/30">
          {/* Render child epics first */}
          {hasChildEpics && (
            <div className="py-3 pr-3 space-y-3 bg-black/20">
              {epic.childEpics!.map((childEpic, index) => (
                <EpicRow
                  key={`${childEpic.id}-${depth}-${index}`}
                  epic={childEpic}
                  depth={depth + 1}
                  expandedEpics={expandedEpics}
                  onToggle={onToggle}
                  onBeadClick={onBeadClick}
                  onStatusChange={onStatusChange}
                  onPriorityChange={onPriorityChange}
                  onRequestDelete={onRequestDelete}
                  onBeadMove={onBeadMove}
                  canMoveEpic={canMoveEpic}
                  dragOverEpicId={dragOverEpicId}
                  onDragOver={onDragOver}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  draggedBeadId={draggedBeadId}
                  expandedBeads={expandedBeads}
                  onToggleBead={onToggleBead}
                  focusedItemId={focusedItemId}
                  onFocusItem={onFocusItem}
                />
              ))}
            </div>
          )}

          {/* Render child beads */}
          {hasChildBeads && (
            <div className={cn(hasChildEpics && "border-t border-border/30")}>
              <BeadTable
                beads={epic.children}
                onBeadClick={onBeadClick}
                onStatusChange={onStatusChange}
                onPriorityChange={onPriorityChange}
                onDelete={onRequestDelete}
                epicId={epic.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                draggedBeadId={draggedBeadId}
                expandedBeads={expandedBeads}
                onToggleBead={onToggleBead}
                focusedItemId={focusedItemId}
                onFocusItem={onFocusItem}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
