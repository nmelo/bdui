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
  ChevronRight,
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
  parentPath?: { id: string; title: string }[]
  dbPath?: string
  assignees?: string[]
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
  parentPath = [],
  dbPath,
  assignees = [],
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
  }, [bead])

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
      <div className="pb-4 border-b border-border shrink-0">
        <TooltipProvider>
          {/* Breadcrumb */}
          {parentPath.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 flex-wrap">
              {parentPath.map((parent, index) => (
                <span key={parent.id} className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="max-w-32 truncate cursor-default hover:text-foreground transition-colors">{parent.title}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-mono text-xs mb-1">{parent.id}</p>
                      <p>{parent.title}</p>
                    </TooltipContent>
                  </Tooltip>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                </span>
              ))}
            </div>
          )}

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
          <div className="space-y-3">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Status</span>
              <Select value={status} onValueChange={(value: BeadStatus) => handleStatusChange(value)}>
                <SelectTrigger
                  disabled={fieldStates.status.isSaving}
                  className={cn(
                    "flex-1 h-7 px-2 rounded border-border/40 text-xs font-medium bg-transparent",
                    status === "open" && "text-emerald-400",
                    status === "in_progress" && "text-blue-400",
                    status === "closed" && "text-slate-400",
                    fieldStates.status.hasError && "ring-1 ring-destructive"
                  )}
                >
                  {fieldStates.status.isSaving ? <Spinner className="h-3 w-3" /> : <SelectValue />}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Open</span></SelectItem>
                  <SelectItem value="in_progress"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />In Progress</span></SelectItem>
                  <SelectItem value="closed"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />Closed</span></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Priority</span>
              <Select value={priority} onValueChange={(value: BeadPriority) => handlePriorityChange(value)}>
                <SelectTrigger
                  disabled={fieldStates.priority.isSaving}
                  className={cn(
                    "flex-1 h-7 px-2 rounded border-border/40 text-xs font-medium bg-transparent",
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
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0">Assignee</span>
              {isAddingAssignee ? (
                <div className="flex items-center gap-1 flex-1">
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
                    className="flex-1 h-7 bg-transparent border-border/40 text-foreground text-xs focus:border-primary"
                  />
                  <Button
                    onClick={handleAddNewAssignee}
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
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
                      "flex-1 h-7 px-2 rounded border-border/40 text-xs font-medium bg-transparent text-foreground",
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
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1.5">Labels</span>
              <div className="flex-1">
                <div className="flex flex-wrap gap-1 mb-2">
                  {labels.length > 0 ? labels.map((label) => (
                    <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 rounded bg-muted/40">
                      {label}
                      <button onClick={() => handleRemoveLabel(label)} className="ml-1 hover:text-red-400">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )) : (
                    <span className="text-[10px] text-muted-foreground/50">No labels</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                    placeholder="Add label..."
                    className="h-6 text-xs bg-transparent border-border/40 focus:border-primary"
                  />
                  <Button onClick={handleAddLabel} size="sm" variant="ghost" className="h-6 w-6 p-0">
                    <Plus className="h-3 w-3" />
                  </Button>
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

          {/* Activity/Comments section */}
          <div className="pt-4 border-t border-border/30">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Activity {bead.comments.length > 0 && `(${bead.comments.length})`}
            </h3>

            {bead.comments.length > 0 && (
              <div className="space-y-3 mb-4">
                {bead.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2.5">
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium bg-primary/20 text-primary">
                      {comment.author.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-xs text-foreground">{comment.author}</span>
                        <span className="text-xs text-muted-foreground/70">{formatDateTime(comment.timestamp)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        <SimpleMarkdown content={comment.content} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New comment input */}
            <div className="flex gap-2.5">
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
    </div>
  )
}
