"use client"

import React from "react"

import {
  CheckCircle2,
  Circle,
  CircleDot,
  Bug,
  Wrench,
  Sparkles,
  Layers,
  ListTodo,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  MessageSquare,
  Trash2,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
} from "lucide-react"
import type { Bead, BeadType, BeadStatus, BeadPriority } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CopyableId } from "@/components/copyable-id"

interface BeadTableProps {
  beads: Bead[]
  onBeadClick: (bead: Bead) => void
  onStatusChange: (beadId: string, status: BeadStatus) => void
  onPriorityChange: (beadId: string, priority: BeadPriority) => void
  onDelete?: (beadId: string) => void
  epicId: string
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
  expandedBeads?: Set<string>
  onToggleBead?: (beadId: string) => void
  focusedItemId?: string | null
  onFocusItem?: (id: string | null) => void
  selectedBeadId?: string | null
}

// Depth-based left border colors for nested subtasks
const depthBorderColors = [
  "border-l-transparent",
  "border-l-blue-500/50",
  "border-l-cyan-500/50",
  "border-l-teal-500/50",
  "border-l-emerald-500/50",
]

interface BeadRowProps {
  bead: Bead
  depth: number
  onBeadClick: (bead: Bead) => void
  onStatusChange: (beadId: string, status: BeadStatus) => void
  onDelete?: (beadId: string) => void
  epicId: string
  onDragStart?: (beadId: string) => void
  onDragEnd?: () => void
  draggedBeadId?: string | null
  expandedBeads?: Set<string>
  onToggleBead?: (beadId: string) => void
  focusedItemId?: string | null
  onFocusItem?: (id: string | null) => void
  selectedBeadId?: string | null
}

function BeadRow({
  bead,
  depth,
  onBeadClick,
  onStatusChange,
  onDelete,
  epicId,
  onDragStart,
  onDragEnd,
  draggedBeadId,
  expandedBeads,
  onToggleBead,
  focusedItemId,
  onFocusItem,
  selectedBeadId,
}: BeadRowProps) {
  const hasChildren = bead.children && bead.children.length > 0
  const isExpanded = expandedBeads?.has(bead.id) ?? false
  const borderColor = depthBorderColors[Math.min(depth, depthBorderColors.length - 1)]
  const indentPadding = depth > 0 ? `${depth * 16}px` : undefined

  return (
    <>
      <div
        draggable
        data-item-id={bead.id}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", JSON.stringify({ beadId: bead.id, sourceEpicId: epicId, type: "bead" }))
          e.dataTransfer.effectAllowed = "move"
          onDragStart?.(bead.id)
        }}
        onDragEnd={() => onDragEnd?.()}
        className={cn(
          "bead-row group flex items-center gap-x-2 gap-y-1 px-3 py-2 border-b border-border/50 hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors border-l-2 select-none",
          borderColor,
          draggedBeadId === bead.id && "opacity-50",
          focusedItemId === bead.id && "ring-1 ring-primary/60",
          selectedBeadId === bead.id && "bg-primary/15"
        )}
        style={{ paddingLeft: indentPadding ? `calc(0.75rem + ${indentPadding})` : undefined }}
        onClick={() => { onFocusItem?.(bead.id); onBeadClick(bead) }}
      >
        {/* Row 1: chevron + ID + type */}
        <div className="bead-row-id flex items-center gap-1 shrink-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleBead?.(bead.id)
              }}
              className="p-0.5 -ml-1 mr-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : depth > 0 || hasChildren === false ? (
            <span className="w-5 -ml-1 mr-1" />
          ) : null}
          <CopyableId id={bead.id} />
        </div>
        <div className="bead-row-type shrink-0">
          <PillBadge config={typeConfig[bead.type]} />
        </div>

        {/* Spacer for wide layout */}
        <div className="bead-row-spacer flex-1" />

        {/* Delete button */}
        {onDelete && (
          <div className="bead-row-delete shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(bead.id)
              }}
              className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              title="Delete bead"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Row 2: title + status + priority + assignee */}
        <div className="bead-row-title flex-1 text-left font-medium text-foreground/70 truncate min-w-0">
          {bead.title}
        </div>
        <div className="bead-row-status shrink-0">
          <PillBadge config={getStatusConfig(bead.status)} />
        </div>
        <div className="bead-row-priority shrink-0">
          <PillBadge config={priorityConfig[bead.priority]} />
        </div>
        <div className="bead-row-assignee shrink-0 text-muted-foreground text-sm">
          {bead.assignee || <span className="text-muted-foreground/50 italic">Unassigned</span>}
        </div>
      </div>
      {/* Render children if expanded */}
      {hasChildren && isExpanded && bead.children!.map((child, idx) => (
        <BeadRow
          key={`${child.id}-${idx}`}
          bead={child}
          depth={depth + 1}
          onBeadClick={onBeadClick}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          epicId={epicId}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          draggedBeadId={draggedBeadId}
          expandedBeads={expandedBeads}
          onToggleBead={onToggleBead}
          focusedItemId={focusedItemId}
          onFocusItem={onFocusItem}
          selectedBeadId={selectedBeadId}
        />
      ))}
    </>
  )
}

const typeConfig: Record<BeadType, { label: string; className: string; icon: React.ReactNode }> = {
  bug: {
    label: "Bug",
    className: "bg-red-500/20 text-red-400 border-red-500/40",
    icon: <Bug className="h-3 w-3" />,
  },
  task: {
    label: "Task",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    icon: <ListTodo className="h-3 w-3" />,
  },
  feature: {
    label: "Feature",
    className: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    icon: <Sparkles className="h-3 w-3" />,
  },
  epic: {
    label: "Epic",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    icon: <Layers className="h-3 w-3" />,
  },
  chore: {
    label: "Chore",
    className: "bg-slate-500/20 text-slate-400 border-slate-500/40",
    icon: <Wrench className="h-3 w-3" />,
  },
  message: {
    label: "Message",
    className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    icon: <MessageSquare className="h-3 w-3" />,
  },
  gate: {
    label: "Gate",
    className: "bg-green-500/20 text-green-400 border-green-500/40",
    icon: <ShieldCheck className="h-3 w-3" />,
  },
}

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

export function BeadTable({
  beads,
  onBeadClick,
  onStatusChange,
  onDelete,
  epicId,
  onDragStart,
  onDragEnd,
  draggedBeadId,
  expandedBeads,
  onToggleBead,
  focusedItemId,
  onFocusItem,
  selectedBeadId,
}: BeadTableProps) {
  return (
    <div className="bead-table-container">
      {/* Header row: hidden on narrow, visible on wide */}
      <div className="bead-row-header items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border/50">
        <div className="w-24 shrink-0 pl-5">ID</div>
        <div className="w-20 shrink-0">Type</div>
        <div className="flex-1">Title</div>
        <div className="w-28 shrink-0">Status</div>
        <div className="w-24 shrink-0">Priority</div>
        <div className="w-24 shrink-0">Assignee</div>
        {onDelete && <div className="w-10 shrink-0"></div>}
      </div>
      {/* Bead rows */}
      <div>
        {beads.map((bead, index) => (
          <BeadRow
            key={`${bead.id}-${index}`}
            bead={bead}
            depth={0}
            onBeadClick={onBeadClick}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            epicId={epicId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            draggedBeadId={draggedBeadId}
            expandedBeads={expandedBeads}
            onToggleBead={onToggleBead}
            focusedItemId={focusedItemId}
            onFocusItem={onFocusItem}
            selectedBeadId={selectedBeadId}
          />
        ))}
      </div>
    </div>
  )
}
