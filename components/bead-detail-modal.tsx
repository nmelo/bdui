"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  CircleDot,
  Flag,
  User,
  Tags
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

interface BeadDetailModalProps {
  bead: Bead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (bead: Bead) => void
  onAddComment: (beadId: string, comment: Comment) => void
  parentPath?: { id: string; title: string }[]
  dbPath?: string
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
}

const authorColors = [
  "border-l-emerald-500",
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-amber-500",
  "border-l-pink-500",
  "border-l-cyan-500",
]

function getAuthorColor(author: string): string {
  let hash = 0
  for (let i = 0; i < author.length; i++) {
    hash = author.charCodeAt(i) + ((hash << 5) - hash)
  }
  return authorColors[Math.abs(hash) % authorColors.length]
}

const MAX_COMMENT_LENGTH = 100 // Declared variable

const MAX_COMMENT_LINES = 3

export function BeadDetailModal({
  bead,
  open,
  onOpenChange,
  onUpdate,
  onAddComment,
  parentPath = [],
  dbPath,
}: BeadDetailModalProps) {
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
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [fieldStates, setFieldStates] = useState<Record<FieldName, FieldState>>(initialFieldStates)

  // Refs for debounced saves
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const assigneeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
      setExpandedComments(new Set())
      setFieldStates(initialFieldStates)
    }
  }, [bead])

  // Cleanup debounce timeouts on unmount
  useEffect(() => {
    return () => {
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current)
      if (assigneeTimeoutRef.current) clearTimeout(assigneeTimeoutRef.current)
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

  // Autosave: Assignee (debounced 500ms)
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
    if (assigneeTimeoutRef.current) clearTimeout(assigneeTimeoutRef.current)
    assigneeTimeoutRef.current = setTimeout(() => saveAssignee(newAssignee), 500)
  }, [saveAssignee])

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

  const toggleCommentExpanded = (commentId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
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

  if (!bead) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-6xl h-[85vh] overflow-hidden flex flex-col bg-card border-border p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <TooltipProvider>
            {/* Breadcrumb - titles only */}
            {parentPath.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 flex-wrap">
                {parentPath.map((parent, index) => (
                  <span key={parent.id} className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="max-w-48 truncate cursor-default hover:text-foreground transition-colors">{parent.title}</span>
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
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
                  {(["bug", "task", "feature", "chore", "epic"] as BeadType[]).map((t) => (
                    <DropdownMenuItem key={t} onClick={() => handleTypeChange(t)} className="capitalize">
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Title */}
              <DialogTitle className="text-lg font-semibold text-foreground truncate">
                {bead.title}
              </DialogTitle>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCloseBead}
                    disabled={status === "closed"}
                    className="h-8 w-8"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close Bead</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ID and Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <CopyableId id={bead.id} className="text-xs" />
            <span>Created: {formatDate(bead.createdAt || new Date("2026-01-15"))}</span>
            <span>Updated: {formatDate(bead.updatedAt || new Date("2026-01-17"))}</span>
          </div>
          </TooltipProvider>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Main content - scrollable */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <Card className="bg-background border-border">
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-muted-foreground text-xs uppercase tracking-wide">Title</Label>
                    <div className="relative">
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        disabled={fieldStates.title.isSaving}
                        className={cn(
                          "bg-card border-border text-foreground pr-8",
                          fieldStates.title.hasError && "border-destructive ring-2 ring-destructive/20"
                        )}
                      />
                      {fieldStates.title.isSaving && (
                        <Spinner className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Description</Label>
                    <div className="p-4 bg-slate-800/30 rounded-lg border border-border/50 min-h-24">
                      {description ? (
                        <SimpleMarkdown content={description} />
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic">No description</p>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-4" />

                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Acceptance Criteria</Label>
                    <div className="p-4 bg-slate-800/30 rounded-lg border border-border/50 min-h-16">
                      {acceptanceCriteria ? (
                        <SimpleMarkdown content={acceptanceCriteria} />
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic">No acceptance criteria defined</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-background border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Comments ({bead.comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {bead.comments.length > 0 ? (
                    <div className="space-y-3">
                      {bead.comments.map((comment) => {
                        const lines = comment.content.split("\n")
                        const isLong = lines.length > MAX_COMMENT_LINES
                        const isExpanded = expandedComments.has(comment.id)

                        return (
                          <div 
                            key={comment.id} 
                            className={cn(
                              "bg-card rounded-lg p-3 border border-border border-l-4",
                              getAuthorColor(comment.author)
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/50 to-primary/20 flex items-center justify-center text-xs font-medium text-primary-foreground">
                                  {comment.author.charAt(0)}
                                </div>
                                <span className="font-medium text-xs text-foreground">{comment.author}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDateTime(comment.timestamp)}</span>
                            </div>
                            <div className={cn(
                              "text-xs text-muted-foreground overflow-hidden transition-all",
                              !isExpanded && isLong && "max-h-[4.5em]"
                            )}>
                              <SimpleMarkdown content={comment.content} />
                            </div>
                            {isLong && (
                              <button
                                onClick={() => toggleCommentExpanded(comment.id)}
                                className="text-xs text-primary hover:underline mt-2"
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">No comments yet</p>
                  )}

                  <div className="space-y-3 pt-2 border-t border-border">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment..."
                      className="min-h-20 bg-card border-border text-foreground resize-none"
                    />
                    <Button 
                      onClick={handleAddComment}
                      disabled={!newComment.trim()}
                      size="sm"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Add Comment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          {/* Sidebar - sticky properties */}
          <div className="w-72 border-l border-border bg-card p-4 overflow-y-auto">
            <Card className="bg-background border-border">
              <CardContent className="p-0">
                {/* Status */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CircleDot className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Status</span>
                  </div>
                  <Select value={status} onValueChange={(value: BeadStatus) => handleStatusChange(value)}>
                    <SelectTrigger
                      disabled={fieldStates.status.isSaving}
                      className={cn(
                        "w-auto h-8 px-3 rounded-full border-0 text-xs font-medium shadow-sm",
                        status === "open" && "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
                        status === "in_progress" && "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
                        status === "closed" && "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30",
                        fieldStates.status.hasError && "ring-2 ring-destructive"
                      )}
                    >
                      {fieldStates.status.isSaving ? <Spinner className="h-4 w-4" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-lg">
                      <SelectItem value="open" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Open
                        </span>
                      </SelectItem>
                      <SelectItem value="in_progress" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          In Progress
                        </span>
                      </SelectItem>
                      <SelectItem value="closed" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-500" />
                          Closed
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Flag className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Priority</span>
                  </div>
                  <Select value={priority} onValueChange={(value: BeadPriority) => handlePriorityChange(value)}>
                    <SelectTrigger
                      disabled={fieldStates.priority.isSaving}
                      className={cn(
                        "w-auto h-8 px-3 rounded-full border-0 text-xs font-medium shadow-sm",
                        priority === "critical" && "bg-red-500/20 text-red-400 hover:bg-red-500/30",
                        priority === "high" && "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30",
                        priority === "medium" && "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30",
                        priority === "low" && "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30",
                        fieldStates.priority.hasError && "ring-2 ring-destructive"
                      )}
                    >
                      {fieldStates.priority.isSaving ? <Spinner className="h-4 w-4" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-lg">
                      <SelectItem value="critical" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Critical
                        </span>
                      </SelectItem>
                      <SelectItem value="high" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          High
                        </span>
                      </SelectItem>
                      <SelectItem value="medium" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                          Medium
                        </span>
                      </SelectItem>
                      <SelectItem value="low" className="rounded-lg">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-500" />
                          Low
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Assignee */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Assignee</span>
                  </div>
                  <div className="relative">
                    <Input
                      id="assignee"
                      value={assignee}
                      onChange={(e) => handleAssigneeChange(e.target.value)}
                      placeholder="Unassigned"
                      disabled={fieldStates.assignee.isSaving}
                      className={cn(
                        "w-28 h-8 bg-card border-border text-foreground text-xs rounded-lg pr-7",
                        fieldStates.assignee.hasError && "border-destructive ring-2 ring-destructive/20"
                      )}
                    />
                    {fieldStates.assignee.isSaving && (
                      <Spinner className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3" />
                    )}
                  </div>
                </div>

                {/* Labels */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-3">
                    <Tags className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Labels</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {labels.length > 0 ? labels.map((label) => (
                      <Badge
                        key={label}
                        variant="secondary"
                        className="text-xs px-2.5 py-1 rounded-full bg-secondary/50 hover:bg-secondary shadow-sm"
                      >
                        {label}
                        <button
                          onClick={() => handleRemoveLabel(label)}
                          className="ml-1.5 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )) : (
                      <span className="text-xs text-muted-foreground">No labels</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
                      placeholder="Add label..."
                      className="bg-card border-border text-foreground h-8 text-xs rounded-lg"
                    />
                    <Button
                      onClick={handleAddLabel}
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 bg-transparent rounded-lg"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="p-6">
              <p className="text-xs text-muted-foreground text-center">
                Changes save automatically
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
