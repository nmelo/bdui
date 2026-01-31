"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import type { Bead, BeadType, BeadStatus, BeadPriority, Comment } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  X,
  Plus,
  Trash2,
} from "lucide-react"
import { CopyableId } from "@/components/copyable-id"
import { SimpleMarkdown } from "@/components/simple-markdown"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  updateBeadTitle,
  updateBeadType,
  updateBeadStatus,
  updateBeadPriority,
  updateBeadAssignee,
} from "@/actions/beads"

interface BeadDetailPanelProps {
  bead: Bead | null
  onClose: () => void
  onUpdate: (bead: Bead) => void
  onAddComment: (beadId: string, comment: Comment) => void
  onDelete?: (beadId: string) => void
  onBeadNavigate?: (beadId: string) => void
  parentPath?: { id: string; title: string }[]
  dbPath?: string
  assignees?: string[]
  availableStatuses?: string[]
}

// Core status configurations for styling
const coreStatusConfig: Record<string, { label: string; colorClass: string; dotClass: string }> = {
  open: { label: "Open", colorClass: "text-white", dotClass: "bg-white" },
  in_progress: { label: "In Progress", colorClass: "text-amber-400", dotClass: "bg-amber-500" },
  closed: { label: "Closed", colorClass: "text-zinc-500", dotClass: "bg-zinc-600" },
  ready_for_qa: { label: "Ready for QA", colorClass: "text-purple-400", dotClass: "bg-purple-500" },
  ready_to_ship: { label: "Ready to Ship", colorClass: "text-emerald-400", dotClass: "bg-emerald-500" },
}

// Get status display config with fallback for unknown custom statuses
function getStatusDisplayConfig(status: string): { label: string; colorClass: string; dotClass: string } {
  if (coreStatusConfig[status]) {
    return coreStatusConfig[status]
  }
  // Fallback for unknown custom statuses
  return {
    label: status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    colorClass: "text-cyan-400",
    dotClass: "bg-cyan-500",
  }
}

type FieldName = 'title' | 'type' | 'status' | 'priority' | 'assignee'

interface FieldState {
  isSaving: boolean
  hasError: boolean
}

const initialFieldStates: Record<FieldName, FieldState> = {
  title: { isSaving: false, hasError: false },
  type: { isSaving: false, hasError: false },
  status: { isSaving: false, hasError: false },
  priority: { isSaving: false, hasError: false },
  assignee: { isSaving: false, hasError: false },
}

const typeColors: Record<string, string> = {
  bug: "bg-red-500/20 text-red-400 border-red-500/30",
  task: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  feature: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  epic: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  chore: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  message: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
}


export function BeadDetailPanel({
  bead,
  onClose,
  onUpdate,
  onAddComment,
  onDelete,
  onBeadNavigate,
  parentPath = [],
  dbPath,
  assignees = [],
  availableStatuses = ["open", "in_progress", "closed"],
}: BeadDetailPanelProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("")
  const [type, setType] = useState<BeadType>("task")
  const [status, setStatus] = useState<BeadStatus>("open")
  const [priority, setPriority] = useState<BeadPriority>("medium")
  const [assignee, setAssignee] = useState("")
  const [labels, setLabels] = useState<string[]>([])
  const [newLabel, setNewLabel] = useState("")
  const [newComment, setNewComment] = useState("")
  const [fieldStates, setFieldStates] = useState<Record<FieldName, FieldState>>(initialFieldStates)
  const [isAddingAssignee, setIsAddingAssignee] = useState(false)
  const [newAssigneeName, setNewAssigneeName] = useState("")

  // Refs for debounced saves
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper functions for field state management
  const setFieldSaving = useCallback((field: FieldName) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: { isSaving: true, hasError: false }
    }))
  }, [])

  const setFieldSuccess = useCallback((field: FieldName) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: { isSaving: false, hasError: false }
    }))
  }, [])

  const setFieldError = useCallback((field: FieldName) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: { isSaving: false, hasError: true }
    }))
  }, [])

  const clearFieldError = useCallback((field: FieldName) => {
    setFieldStates(prev => ({
      ...prev,
      [field]: { ...prev[field], hasError: false }
    }))
  }, [])

  // Sync state when bead changes
  // Use specific fields as dependencies to ensure updates when content changes
  // (React compares objects by reference, so [bead] alone may miss updates)
  useEffect(() => {
    if (bead) {
      setTitle(bead.title)
      setDescription(bead.description)
      setAcceptanceCriteria(bead.acceptanceCriteria || "")
      setType(bead.type)
      setStatus(bead.status)
      setPriority(bead.priority)
      setAssignee(bead.assignee)
      setLabels(bead.labels || [])
      setFieldStates(initialFieldStates)
      setIsAddingAssignee(false)
      setNewAssigneeName("")
    }
  }, [bead?.id, bead?.title, bead?.description, bead?.acceptanceCriteria, bead?.type, bead?.status, bead?.priority, bead?.assignee, bead?.updatedAt, JSON.stringify(bead?.labels)])

  // Cleanup debounce timeouts on unmount
  useEffect(() => {
    return () => {
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current)
    }
  }, [])

  // Autosave: Title (debounced 500ms)
  const saveTitle = useCallback(async (newTitle: string) => {
    if (!bead || newTitle === bead.title) return
    setFieldSaving('title')
    const result = await updateBeadTitle(bead.id, newTitle, dbPath)
    if (result.success) {
      setFieldSuccess('title')
      onUpdate({ ...bead, title: newTitle, updatedAt: new Date() })
    } else {
      setFieldError('title')
      setTitle(bead.title) // revert
      toast.error("Failed to save title", { description: result.error })
      setTimeout(() => clearFieldError('title'), 2000)
    }
  }, [bead, dbPath, onUpdate, setFieldSaving, setFieldSuccess, setFieldError, clearFieldError])

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle)
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current)
    titleTimeoutRef.current = setTimeout(() => saveTitle(newTitle), 500)
  }, [saveTitle])

  // Autosave: Type (immediate)
  const handleTypeChange = useCallback(async (newType: BeadType) => {
    if (!bead || newType === type) return
    const prevType = type
    setFieldSaving('type')
    setType(newType)
    const result = await updateBeadType(bead.id, newType, dbPath)
    if (result.success) {
      setFieldSuccess('type')
      onUpdate({ ...bead, type: newType, updatedAt: new Date() })
    } else {
      setFieldError('type')
      setType(prevType) // revert
      toast.error("Failed to save type", { description: result.error })
      setTimeout(() => clearFieldError('type'), 2000)
    }
  }, [bead, type, dbPath, onUpdate, setFieldSaving, setFieldSuccess, setFieldError, clearFieldError])

  // Autosave: Status (immediate)
  const handleStatusChange = useCallback(async (newStatus: BeadStatus) => {
    if (!bead || newStatus === status) return
    const prevStatus = status
    setFieldSaving('status')
    setStatus(newStatus)
    const result = await updateBeadStatus(bead.id, newStatus, dbPath)
    if (result.success) {
      setFieldSuccess('status')
      onUpdate({ ...bead, status: newStatus, updatedAt: new Date() })
    } else {
      setFieldError('status')
      setStatus(prevStatus) // revert
      toast.error("Failed to save status", { description: result.error })
      setTimeout(() => clearFieldError('status'), 2000)
    }
  }, [bead, status, dbPath, onUpdate, setFieldSaving, setFieldSuccess, setFieldError, clearFieldError])

  // Autosave: Priority (immediate)
  const handlePriorityChange = useCallback(async (newPriority: BeadPriority) => {
    if (!bead || newPriority === priority) return
    const prevPriority = priority
    setFieldSaving('priority')
    setPriority(newPriority)
    const result = await updateBeadPriority(bead.id, newPriority, dbPath)
    if (result.success) {
      setFieldSuccess('priority')
      onUpdate({ ...bead, priority: newPriority, updatedAt: new Date() })
    } else {
      setFieldError('priority')
      setPriority(prevPriority) // revert
      toast.error("Failed to save priority", { description: result.error })
      setTimeout(() => clearFieldError('priority'), 2000)
    }
  }, [bead, priority, dbPath, onUpdate, setFieldSaving, setFieldSuccess, setFieldError, clearFieldError])

  // Autosave: Assignee (immediate)
  const saveAssignee = useCallback(async (newAssignee: string) => {
    if (!bead || newAssignee === bead.assignee) return
    setFieldSaving('assignee')
    const result = await updateBeadAssignee(bead.id, newAssignee, dbPath)
    if (result.success) {
      setFieldSuccess('assignee')
      onUpdate({ ...bead, assignee: newAssignee, updatedAt: new Date() })
    } else {
      setFieldError('assignee')
      setAssignee(bead.assignee) // revert
      toast.error("Failed to save assignee", { description: result.error })
      setTimeout(() => clearFieldError('assignee'), 2000)
    }
  }, [bead, dbPath, onUpdate, setFieldSaving, setFieldSuccess, setFieldError, clearFieldError])

  const handleAssigneeChange = useCallback((newAssignee: string) => {
    setAssignee(newAssignee)
    saveAssignee(newAssignee)
  }, [saveAssignee])

  const handleAddNewAssignee = useCallback(() => {
    if (!newAssigneeName.trim()) return
    const trimmed = newAssigneeName.trim()
    setIsAddingAssignee(false)
    setNewAssigneeName("")
    handleAssigneeChange(trimmed)
  }, [newAssigneeName, handleAssigneeChange])

  const handleAddComment = () => {
    if (!bead || !newComment.trim()) return
    const comment: Comment = {
      id: `c-${Date.now()}`,
      author: "Current User",
      content: newComment.trim(),
      timestamp: new Date(),
    }
    onAddComment(bead.id, comment)
    setNewComment("")
  }

  const handleCloseBead = () => {
    handleStatusChange("closed")
  }

  const handleAddLabel = () => {
    if (newLabel.trim() && !labels.includes(newLabel.trim())) {
      setLabels([...labels, newLabel.trim()])
      setNewLabel("")
    }
  }

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label))
  }


  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const d = new Date(date)
    const diffMs = now.getTime() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    const diffWeek = Math.floor(diffDay / 7)
    const diffMonth = Math.floor(diffDay / 30)
    const diffYear = Math.floor(diffDay / 365)

    if (diffSec < 60) return "just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    if (diffWeek < 4) return `${diffWeek}w ago`
    if (diffMonth < 12) return `${diffMonth}mo ago`
    return `${diffYear}y ago`
  }

  // Empty state when no bead selected
  if (!bead) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a bead to view details</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="-mx-4 px-6 pt-4 pb-4 bg-card border-b border-border shrink-0">
        <TooltipProvider>
          {/* Title row with Type badge and actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Type Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "px-2 py-1 text-xs font-medium rounded border capitalize cursor-pointer hover:opacity-80 transition-opacity shrink-0 flex items-center gap-1.5",
                      typeColors[type],
                      fieldStates.type.hasError && "ring-2 ring-destructive"
                    )}
                    disabled={fieldStates.type.isSaving}
                  >
                    {fieldStates.type.isSaving ? <Spinner className="h-3 w-3" /> : null}
                    {type}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(["bug", "task", "feature", "chore", "epic", "message"] as BeadType[]).map((t) => (
                    <DropdownMenuItem key={t} onClick={() => handleTypeChange(t)} className="capitalize">
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Title */}
              <h2 className="text-base font-semibold text-foreground truncate">
                {bead.title}
              </h2>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCloseBead}
                    disabled={status === "closed"}
                    className="h-7 w-7"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close Bead</TooltipContent>
              </Tooltip>
              {onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(bead.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete Bead</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-7 w-7"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close Panel</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ID and Timestamps */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
            <CopyableId id={bead.id} className="text-xs" />
            <span>Created: {formatDate(bead.createdAt || new Date("2026-01-15"))}</span>
            <span>Updated: {formatDate(bead.updatedAt || new Date("2026-01-17"))}</span>
          </div>
        </TooltipProvider>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="py-4 space-y-4">
          {/* Properties section */}
          <div className="-mx-4 px-6 py-4 bg-muted/10 border-y border-border/20 space-y-3">
            {/* Status, Priority, Assignee, Labels - 4 column grid */}
            <div className="grid grid-cols-4 gap-3">
              {/* Status */}
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Status</span>
                <Select value={status} onValueChange={(value: BeadStatus) => handleStatusChange(value)}>
                  <SelectTrigger
                    disabled={fieldStates.status.isSaving}
                    className={cn(
                      "w-full h-8 px-2 rounded border-border/40 text-xs font-medium bg-transparent",
                      getStatusDisplayConfig(status).colorClass,
                      fieldStates.status.hasError && "ring-1 ring-destructive"
                    )}
                  >
                    {fieldStates.status.isSaving ? <Spinner className="h-3 w-3" /> : <SelectValue />}
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((s) => {
                      const config = getStatusDisplayConfig(s)
                      return (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-1.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
                            {config.label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Priority</span>
                <Select value={priority} onValueChange={(value: BeadPriority) => handlePriorityChange(value)}>
                  <SelectTrigger
                    disabled={fieldStates.priority.isSaving}
                    className={cn(
                      "w-full h-8 px-2 rounded border-border/40 text-xs font-medium bg-transparent",
                      priority === "critical" && "text-red-400",
                      priority === "high" && "text-orange-400",
                      priority === "medium" && "text-yellow-400",
                      priority === "low" && "text-slate-400",
                      fieldStates.priority.hasError && "ring-1 ring-destructive"
                    )}
                  >
                    {fieldStates.priority.isSaving ? <Spinner className="h-3 w-3" /> : <SelectValue />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Critical</span></SelectItem>
                    <SelectItem value="high"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />High</span></SelectItem>
                    <SelectItem value="medium"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Medium</span></SelectItem>
                    <SelectItem value="low"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />Low</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Assignee</span>
              {isAddingAssignee ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={newAssigneeName}
                    onChange={(e) => setNewAssigneeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNewAssignee()
                      if (e.key === "Escape") {
                        setIsAddingAssignee(false)
                        setNewAssigneeName("")
                      }
                    }}
                    placeholder="Name..."
                    autoFocus
                    className="flex-1 h-8 bg-transparent border-border/40 text-foreground text-xs focus:border-primary"
                  />
                  <Button
                    onClick={handleAddNewAssignee}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    disabled={!newAssigneeName.trim()}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Select
                  value={assignee || "_none"}
                  onValueChange={(value) => {
                    if (value === "_add_new") {
                      setIsAddingAssignee(true)
                    } else if (value === "_none") {
                      handleAssigneeChange("")
                    } else {
                      handleAssigneeChange(value)
                    }
                  }}
                >
                  <SelectTrigger
                    disabled={fieldStates.assignee.isSaving}
                    className={cn(
                      "w-full h-8 px-2 rounded border-border/40 text-xs font-medium bg-transparent text-foreground",
                      !assignee && "text-muted-foreground",
                      fieldStates.assignee.hasError && "ring-1 ring-destructive"
                    )}
                  >
                    {fieldStates.assignee.isSaving ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <SelectValue placeholder="None" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                    <SelectItem value="_add_new" className="text-primary">
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3 w-3" />
                        Add new...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              </div>

              {/* Labels */}
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Labels</span>
                <div className="flex flex-wrap gap-1 items-center h-8 px-2 rounded border border-border/40 overflow-hidden">
                  {labels.map((label) => (
                    <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 rounded bg-muted/40 shrink-0">
                      {label}
                      <button onClick={() => handleRemoveLabel(label)} className="ml-1 hover:text-red-400">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddLabel()
                      }
                    }}
                    placeholder={labels.length === 0 ? "Add..." : "+"}
                    className="flex-1 min-w-8 h-6 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="pt-4 border-t border-border/30">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
              {description ? (
                <SimpleMarkdown content={description} />
              ) : (
                <p className="text-muted-foreground/50 italic text-sm">No description</p>
              )}
            </div>
          </div>

          {/* Acceptance Criteria */}
          {acceptanceCriteria && (
            <div className="pt-4 border-t border-border/30">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Acceptance Criteria</h3>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                <SimpleMarkdown content={acceptanceCriteria} />
              </div>
            </div>
          )}

          {/* Dependencies */}
          {(bead.blockedBy?.length || bead.blocks?.length) ? (
            <div className="pt-4 border-t border-border/30 space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dependencies</h3>
              {bead.blockedBy && bead.blockedBy.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Blocked by:</span>
                  {bead.blockedBy.map(dep => (
                    <button
                      key={dep.id}
                      onClick={() => onBeadNavigate?.(dep.id)}
                      className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title={dep.title}
                    >
                      {dep.id}
                    </button>
                  ))}
                </div>
              )}
              {bead.blocks && bead.blocks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Blocks:</span>
                  {bead.blocks.map(dep => (
                    <button
                      key={dep.id}
                      onClick={() => onBeadNavigate?.(dep.id)}
                      className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      title={dep.title}
                    >
                      {dep.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Comments */}
          {bead.comments.length > 0 && (
            <TooltipProvider>
              <div className="mt-6 space-y-4">
                {bead.comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl bg-card shadow-md shadow-black/20 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/20">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-primary/20 text-primary">
                        {comment.author.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-sm text-foreground">{comment.author}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground/60 cursor-default ml-auto">{formatRelativeTime(comment.timestamp)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(comment.timestamp)}</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="px-4 py-3 text-sm text-foreground/90">
                      <SimpleMarkdown content={comment.content} />
                    </div>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          )}

          {/* New comment input */}
          <div className="mt-6 flex gap-2.5">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium bg-muted/50 text-muted-foreground">
              U
            </div>
            <div className="flex-1">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                rows={2}
                className="min-h-0 bg-transparent border-border/40 text-foreground text-sm resize-none focus:border-primary py-2"
              />
              {newComment.trim() && (
                <div className="flex justify-end mt-2">
                  <Button onClick={handleAddComment} size="sm" className="h-7 text-xs">
                    Comment
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
