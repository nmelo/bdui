"use client"

import { ChevronRight, ChevronDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { BeadTable } from "@/components/bead-table"
import { CopyableId } from "@/components/copyable-id"
import type { Epic, Bead, BeadStatus, BeadPriority } from "@/lib/types"
import { cn } from "@/lib/utils"

interface EpicTreeProps {
  epics: Epic[]
  expandedEpics: Set<string>
  onToggleEpic: (epicId: string) => void
  onBeadClick: (bead: Bead) => void
  onStatusChange: (beadId: string, status: BeadStatus) => void
  onPriorityChange: (beadId: string, priority: BeadPriority) => void
  onBeadMove?: (beadId: string, targetEpicId: string) => void
  dragOverEpicId?: string | null
  onDragOver?: (epicId: string | null) => void
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
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

// Recursively calculate closed and total counts from all descendants
function getAggregatedCounts(epic: Epic): { closed: number; total: number } {
  let closed = 0
  let total = 0

  // Count direct child beads
  for (const child of epic.children) {
    total++
    if (child.status === "closed") {
      closed++
    }
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
  expandedEpics,
  onToggleEpic,
  onBeadClick,
  onStatusChange,
  onPriorityChange,
  onBeadMove,
  dragOverEpicId,
  onDragOver,
  onDragStart,
  onDragEnd,
  draggedBeadId,
}: EpicTreeProps) {
  return (
    <div className="space-y-3">
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
          onBeadMove={onBeadMove}
          dragOverEpicId={dragOverEpicId}
          onDragOver={onDragOver}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          draggedBeadId={draggedBeadId}
        />
      ))}
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
  onBeadMove?: (beadId: string, targetEpicId: string) => void
  dragOverEpicId?: string | null
  onDragOver?: (epicId: string | null) => void
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
}

function EpicRow({
  epic,
  depth,
  expandedEpics,
  onToggle,
  onBeadClick,
  onStatusChange,
  onPriorityChange,
  onBeadMove,
  dragOverEpicId,
  onDragOver,
  onDragStart,
  onDragEnd,
  draggedBeadId,
}: EpicRowProps) {
  const isExpanded = expandedEpics.has(epic.id)
  const { closed: closedCount, total: totalCount } = getAggregatedCounts(epic)
  const progress = totalCount > 0 ? (closedCount / totalCount) * 100 : 0

  const hasChildEpics = epic.childEpics && epic.childEpics.length > 0
  const hasChildBeads = epic.children.length > 0
  const hasContent = hasChildEpics || hasChildBeads

  // Calculate left margin based on depth (for nested epics)
  const depthMargin = depth * 12
  const isStandalone = epic.id === "_standalone"
  const borderColor = isStandalone ? "border-l-blue-400" : depthBorderColors[Math.min(depth, depthBorderColors.length - 1)]
  const { bg, shadow } = depthStyles[Math.min(depth, depthStyles.length - 1)]

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 border-border/50 !py-0 !gap-0",
        borderColor,
        bg,
        shadow
      )}
      style={{ marginLeft: depthMargin }}
    >
      <button
        type="button"
        className={cn(
          "w-full px-4 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors text-left",
          dragOverEpicId === epic.id && "ring-2 ring-emerald-500 ring-inset bg-emerald-500/10"
        )}
        onClick={() => onToggle(epic.id)}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          onDragOver?.(epic.id)
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the button entirely (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onDragOver?.(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"))
            if (data.sourceEpicId !== epic.id) {
              onBeadMove?.(data.beadId, epic.id)
            }
          } catch {
            // Invalid drag data
          }
          onDragOver?.(null)
        }}
      >
        <div className="text-muted-foreground">
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )
          ) : (
            <div className="w-5" />
          )}
        </div>

        {!isStandalone && <CopyableId id={epic.id} className="w-28 shrink-0" />}

        <span className="font-medium text-foreground flex-1 truncate">
          {epic.title}
        </span>

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
      </button>

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
                  onBeadMove={onBeadMove}
                  dragOverEpicId={dragOverEpicId}
                  onDragOver={onDragOver}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  draggedBeadId={draggedBeadId}
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
                epicId={epic.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                draggedBeadId={draggedBeadId}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
