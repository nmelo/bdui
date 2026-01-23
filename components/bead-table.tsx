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
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
}

const statusConfig: Record<BeadStatus, { label: string; className: string; icon: React.ReactNode }> = {
  open: {
    label: "Open",
    className: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    icon: <Circle className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    icon: <CircleDot className="h-3 w-3" />,
  },
  closed: {
    label: "Closed",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
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

function PillBadge({
  config,
}: {
  config: { label: string; className: string; icon: React.ReactNode }
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        config.className
      )}
    >
      {config.icon}
      {config.label}
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
}: BeadTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="w-28 text-muted-foreground pl-6">ID</TableHead>
          <TableHead className="w-24 text-muted-foreground">Type</TableHead>
          <TableHead className="text-muted-foreground">Title</TableHead>
          <TableHead className="w-32 text-muted-foreground">Status</TableHead>
          <TableHead className="w-28 text-muted-foreground">Priority</TableHead>
          <TableHead className="w-32 text-muted-foreground">Assignee</TableHead>
          {onDelete && <TableHead className="w-12 text-muted-foreground"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {beads.map((bead, index) => (
          <TableRow
            key={`${bead.id}-${index}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", JSON.stringify({ beadId: bead.id, sourceEpicId: epicId, type: "bead" }))
              e.dataTransfer.effectAllowed = "move"
              onDragStart?.(bead.id)
            }}
            onDragEnd={() => onDragEnd?.()}
            className={cn(
              "border-border/50 hover:bg-white/5 cursor-pointer transition-colors",
              draggedBeadId === bead.id && "opacity-50"
            )}
            onClick={() => onBeadClick(bead)}
          >
            <TableCell className="pl-6">
              <CopyableId id={bead.id} />
            </TableCell>
            <TableCell>
              <PillBadge config={typeConfig[bead.type]} />
            </TableCell>
            <TableCell className="font-medium text-foreground">
              {bead.title}
            </TableCell>
            <TableCell>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const nextStatus: Record<BeadStatus, BeadStatus> = {
                    open: "in_progress",
                    in_progress: "closed",
                    closed: "open",
                  }
                  onStatusChange(bead.id, nextStatus[bead.status])
                }}
                className="hover:opacity-80 transition-opacity"
              >
                <PillBadge config={statusConfig[bead.status]} />
              </button>
            </TableCell>
            <TableCell>
              <PillBadge config={priorityConfig[bead.priority]} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {bead.assignee || <span className="text-muted-foreground/50 italic">Unassigned</span>}
            </TableCell>
            {onDelete && (
              <TableCell className="pr-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(bead.id)
                  }}
                  className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete bead"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
