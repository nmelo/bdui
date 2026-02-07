"use client"

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react"
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
  ArrowDown,
  ArrowUp,
  Rocket,
  Maximize2,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  updateBeadTitle,
  updateBeadType,
  updateBeadStatus,
  updateBeadPriority,
  updateBeadAssignee,
  deleteCommentAction,
  removeLabelAction,
  addLabelAction,
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
  isFocused?: boolean
  onFocus?: () => void
}

export interface BeadDetailPanelHandle {
  navigateComments: (direction: "up" | "down") => void
  scrollToLatestComment: () => void
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


export const BeadDetailPanel = forwardRef<BeadDetailPanelHandle, BeadDetailPanelProps>(function BeadDetailPanel({
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
  isFocused = false,
  onFocus,
}, ref) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [design, setDesign] = useState("")
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("")
  const [notes, setNotes] = useState("")
  const [type, setType] = useState<BeadType>("task")
  const [status, setStatus] = useState<BeadStatus>("open")
  const [priority, setPriority] = useState<BeadPriority>("medium")
  const [assignee, setAssignee] = useState("")
  const [labels, setLabels] = useState<string[]>([])
  const [newLabel, setNewLabel] = useState("")
  const [fieldStates, setFieldStates] = useState<Record<FieldName, FieldState>>(initialFieldStates)
  const [isAddingAssignee, setIsAddingAssignee] = useState(false)
  const [newAssigneeName, setNewAssigneeName] = useState("")

  // Refs for debounced saves
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const descriptionRef = useRef<HTMLDivElement | null>(null)
  const firstCommentRef = useRef<HTMLDivElement | null>(null)
  const lastCommentRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [isFirstCommentVisible, setIsFirstCommentVisible] = useState(false)
  const [isLastCommentVisible, setIsLastCommentVisible] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const [focusedCommentIndex, setFocusedCommentIndex] = useState<number | null>(null)
  const [expandedComment, setExpandedComment] = useState<Comment | null>(null)
  const [isExpandedView, setIsExpandedView] = useState(false)
  const commentRefs = useRef<(HTMLDivElement | null)[]>([])

  const scrollToFirstComment = useCallback(() => {
    firstCommentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const scrollToLastComment = useCallback(() => {
    lastCommentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  // Handle keyboard events for focused comments
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && focusedCommentIndex !== null && bead) {
      e.preventDefault()
      setExpandedComment(bead.comments[focusedCommentIndex])
    }
  }, [focusedCommentIndex, bead])

  // Expose comment navigation method to parent via ref
  useImperativeHandle(ref, () => ({
    navigateComments: (direction: "up" | "down") => {
      if (!bead) return

      // If no comments, just scroll the panel
      if (bead.comments.length === 0) {
        const container = scrollContainerRef.current
        if (container) {
          container.scrollBy({
            top: direction === "down" ? 150 : -150,
            behavior: "smooth",
          })
        }
        return
      }

      setFocusedCommentIndex(prev => {
        // At first comment and going up - scroll to top
        if (prev === 0 && direction === "up") {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
          return null
        }

        // At top (no comment focused) and going up - just scroll up, stay at null
        if (prev === null && direction === "up") {
          scrollContainerRef.current?.scrollBy({ top: -150, behavior: "smooth" })
          return null
        }

        let newIndex: number
        if (prev === null) {
          // Going down from top - focus first comment
          newIndex = 0
        } else if (direction === "down") {
          newIndex = Math.min(prev + 1, bead.comments.length - 1)
        } else {
          newIndex = Math.max(prev - 1, 0)
        }

        // Scroll the focused comment into view
        setTimeout(() => {
          commentRefs.current[newIndex]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          })
        }, 0)

        return newIndex
      })
    },
    scrollToLatestComment: () => {
      if (!bead || bead.comments.length === 0) return
      const lastIndex = bead.comments.length - 1
      setFocusedCommentIndex(lastIndex)
      setTimeout(() => {
        commentRefs.current[lastIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        })
      }, 0)
    },
  }), [bead])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!bead || !dbPath) return
    const result = await deleteCommentAction(commentId, dbPath)
    if (result.success) {
      onUpdate({ ...bead, comments: bead.comments.filter(c => c.id !== commentId) })
      toast.success("Comment deleted")
    } else {
      toast.error("Failed to delete comment", { description: result.error })
    }
  }, [bead, dbPath, onUpdate])

  // Track visibility of first and last comments
  useEffect(() => {
    const firstElement = firstCommentRef.current
    const lastElement = lastCommentRef.current
    const container = scrollContainerRef.current
    if (!container) {
      setIsFirstCommentVisible(false)
      setIsLastCommentVisible(false)
      return
    }

    const observers: IntersectionObserver[] = []

    if (firstElement) {
      const firstObserver = new IntersectionObserver(
        ([entry]) => setIsFirstCommentVisible(entry.isIntersecting),
        { root: container, threshold: 0.5 }
      )
      firstObserver.observe(firstElement)
      observers.push(firstObserver)
    }

    if (lastElement) {
      const lastObserver = new IntersectionObserver(
        ([entry]) => setIsLastCommentVisible(entry.isIntersecting),
        { root: container, threshold: 0.5 }
      )
      lastObserver.observe(lastElement)
      observers.push(lastObserver)
    }

    return () => observers.forEach(obs => obs.disconnect())
  }, [bead?.comments.length])

  // Track scroll position to show "back to top" when not at top
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      setIsAtTop(container.scrollTop < 50)
    }
    // Check initial scroll position
    handleScroll()
    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [bead?.id])

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
      setDesign(bead.design || "")
      setAcceptanceCriteria(bead.acceptanceCriteria || "")
      setNotes(bead.notes || "")
      setType(bead.type)
      setStatus(bead.status)
      setPriority(bead.priority)
      setAssignee(bead.assignee)
      setLabels(bead.labels || [])
      setFieldStates(initialFieldStates)
      setIsAddingAssignee(false)
      setNewAssigneeName("")
      setIsAtTop(true)
      setFocusedCommentIndex(null)
      setIsExpandedView(false)
    }
  }, [bead?.id, bead?.title, bead?.description, bead?.design, bead?.acceptanceCriteria, bead?.notes, bead?.type, bead?.status, bead?.priority, bead?.assignee, bead?.updatedAt, JSON.stringify(bead?.labels)])

  // Reset comment focus when panel loses focus
  useEffect(() => {
    if (!isFocused) {
      setFocusedCommentIndex(null)
    }
  }, [isFocused])

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

  const handleCloseBead = () => {
    handleStatusChange("closed")
  }

  const handleAddLabel = useCallback(async () => {
    if (!bead || !newLabel.trim() || labels.includes(newLabel.trim())) return
    const labelToAdd = newLabel.trim()
    setLabels([...labels, labelToAdd])
    setNewLabel("")
    const result = await addLabelAction(bead.id, labelToAdd, dbPath)
    if (result.success) {
      onUpdate({ ...bead, labels: [...labels, labelToAdd], updatedAt: new Date() })
    } else {
      setLabels(labels) // revert
      toast.error("Failed to add label", { description: result.error })
    }
  }, [bead, newLabel, labels, dbPath, onUpdate])

  const handleRemoveLabel = useCallback(async (label: string) => {
    if (!bead) return
    const prevLabels = labels
    setLabels(labels.filter((l) => l !== label))
    const result = await removeLabelAction(bead.id, label, dbPath)
    if (result.success) {
      onUpdate({ ...bead, labels: prevLabels.filter((l) => l !== label), updatedAt: new Date() })
    } else {
      setLabels(prevLabels) // revert
      toast.error("Failed to remove label", { description: result.error })
    }
  }, [bead, labels, dbPath, onUpdate])


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
    <div
      className="h-full flex flex-col relative outline-none"
      onClick={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
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
              <h2 className="text-base font-semibold text-foreground/70 truncate">
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
                    onClick={() => setIsExpandedView(true)}
                    className="h-7 w-7"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expand View</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ID, External Ref, and Timestamps */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
            <CopyableId id={bead.id} className="text-xs" />
            {bead.externalRef && (
              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                {bead.externalRef}
              </span>
            )}
            {bead.createdAt && <span title={formatDate(bead.createdAt)}>Created: {formatRelativeTime(bead.createdAt)}</span>}
            {bead.updatedAt && <span title={formatDate(bead.updatedAt)}>Updated: {formatRelativeTime(bead.updatedAt)}</span>}
          </div>

          {/* Compact Controls Row */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            {/* Status */}
            <Select value={status} onValueChange={(value: BeadStatus) => handleStatusChange(value)}>
              <SelectTrigger
                disabled={fieldStates.status.isSaving}
                className={cn(
                  "h-auto p-0 border-0 bg-transparent dark:bg-transparent dark:hover:bg-transparent shadow-none rounded-none w-auto gap-1 text-[11px]",
                  getStatusDisplayConfig(status).colorClass,
                  fieldStates.status.hasError && "ring-1 ring-destructive"
                )}
              >
                {fieldStates.status.isSaving ? <Spinner className="h-2 w-2" /> : <SelectValue />}
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

            <span className="text-border">|</span>

            {/* Priority */}
            <Select value={priority} onValueChange={(value: BeadPriority) => handlePriorityChange(value)}>
              <SelectTrigger
                disabled={fieldStates.priority.isSaving}
                className={cn(
                  "h-auto p-0 border-0 bg-transparent dark:bg-transparent dark:hover:bg-transparent shadow-none rounded-none w-auto gap-1 text-[11px]",
                  priority === "critical" && "text-red-400",
                  priority === "high" && "text-orange-400",
                  priority === "medium" && "text-yellow-400",
                  priority === "low" && "text-slate-400",
                  fieldStates.priority.hasError && "ring-1 ring-destructive"
                )}
              >
                {fieldStates.priority.isSaving ? <Spinner className="h-2 w-2" /> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Critical</span></SelectItem>
                <SelectItem value="high"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />High</span></SelectItem>
                <SelectItem value="medium"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Medium</span></SelectItem>
                <SelectItem value="low"><span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />Low</span></SelectItem>
              </SelectContent>
            </Select>

            <span className="text-border">|</span>

            {/* Assignee */}
            {isAddingAssignee ? (
              <div className="flex items-center gap-1">
                <input
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
                  className="w-16 bg-transparent border-b border-border text-foreground text-[11px] outline-none"
                />
                <button
                  onClick={handleAddNewAssignee}
                  disabled={!newAssigneeName.trim()}
                  className="text-primary hover:text-primary/80"
                >
                  <Plus className="h-3 w-3" />
                </button>
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
                    "h-auto p-0 border-0 bg-transparent dark:bg-transparent dark:hover:bg-transparent shadow-none rounded-none w-auto gap-1 text-[11px] text-foreground/70",
                    !assignee && "text-muted-foreground",
                    fieldStates.assignee.hasError && "ring-1 ring-destructive"
                  )}
                >
                  {fieldStates.assignee.isSaving ? (
                    <Spinner className="h-2 w-2" />
                  ) : (
                    <SelectValue placeholder="assignee" />
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

            {/* Labels */}
            {labels.length > 0 && (
              <>
                <span className="text-border">|</span>
                <div className="flex items-center gap-1">
                  {labels.map((label) => (
                    <span key={label} className="text-[11px] text-muted-foreground flex items-center">
                      {label}
                      <button onClick={() => handleRemoveLabel(label)} className="ml-0.5 hover:text-red-400">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Scrollable content area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 hide-scrollbar">
        <TooltipProvider>
        <div className="py-4 flex gap-3">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">

          {/* Description */}
          <div ref={descriptionRef} className="pt-4 border-t border-border/30">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
              {description ? (
                <SimpleMarkdown content={description} />
              ) : (
                <p className="text-muted-foreground/50 italic text-sm">No description</p>
              )}
            </div>
          </div>

          {/* Design */}
          {design && (
            <div className="pt-4 border-t border-border/30">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Design</h3>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                <SimpleMarkdown content={design} />
              </div>
            </div>
          )}

          {/* Acceptance Criteria */}
          {acceptanceCriteria && (
            <div className="pt-4 border-t border-border/30">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Acceptance Criteria</h3>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                <SimpleMarkdown content={acceptanceCriteria} />
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="pt-4 border-t border-border/30">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                <SimpleMarkdown content={notes} />
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
            <div className="mt-6 space-y-4">
              {bead.comments.map((comment, index) => (
                <div
                  key={comment.id}
                  ref={el => {
                    commentRefs.current[index] = el
                    if (index === 0) {
                      firstCommentRef.current = el
                    }
                    if (index === bead.comments.length - 1) {
                      lastCommentRef.current = el
                    }
                  }}
                  className={cn(
                    "rounded-xl bg-card shadow-md shadow-black/20 overflow-hidden transition-all cursor-pointer scroll-mt-2",
                    focusedCommentIndex === index && "ring-1 ring-primary/60"
                  )}
                  onClick={() => { onFocus?.(); setFocusedCommentIndex(index) }}
                >
                  <div className="group flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/20">
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-primary/20 text-primary">
                      {comment.author.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm text-foreground/70">{comment.author}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground/60 cursor-default ml-auto">{formatRelativeTime(comment.timestamp)}</span>
                      </TooltipTrigger>
                      <TooltipContent>{formatDateTime(comment.timestamp)}</TooltipContent>
                    </Tooltip>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpandedComment(comment) }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground/40 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                      title="Expand comment"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteComment(comment.id) }}
                      className="p-1 rounded hover:bg-red-500/20 text-muted-foreground/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-4 py-3 text-sm text-foreground/90">
                    <SimpleMarkdown content={comment.content} />
                  </div>
                </div>
              ))}
            </div>
          )}

          </div>

          {/* Content Minimap */}
          <div className="w-8 shrink-0 flex flex-col gap-1 py-1 sticky top-0 self-start">
            {/* Description block */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setFocusedCommentIndex(null)
                    descriptionRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }}
                  className={cn(
                    "w-full rounded-sm transition-all hover:opacity-100",
                    focusedCommentIndex === null
                      ? "bg-blue-500 opacity-100"
                      : "bg-blue-500/30 opacity-60 hover:bg-blue-500/50"
                  )}
                  style={{ height: `${Math.max(16, Math.min(40, Math.floor((description?.length || 0) / 50) + 16))}px` }}
                />
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="font-medium text-xs">Description</p>
              </TooltipContent>
            </Tooltip>

            {/* Comment blocks */}
            {bead.comments.map((comment, index) => {
              const contentLength = comment.content.length
              const height = Math.max(12, Math.min(60, Math.floor(contentLength / 20) + 12))
              return (
                <Tooltip key={comment.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setFocusedCommentIndex(index)
                        commentRefs.current[index]?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        })
                      }}
                      className={cn(
                        "w-full rounded-sm transition-all hover:opacity-100 flex items-center justify-center overflow-hidden",
                        focusedCommentIndex === index
                          ? "bg-primary opacity-100"
                          : "bg-muted-foreground/30 opacity-60 hover:bg-muted-foreground/50"
                      )}
                      style={{ height: `${height}px` }}
                    >
                      <span className="text-[7px] font-medium text-white/80 truncate px-0.5">
                        {comment.author.slice(0, 5)}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="font-medium text-xs">{comment.author}</p>
                    <p className="text-xs text-muted-foreground truncate">{comment.content.slice(0, 50)}{comment.content.length > 50 ? "..." : ""}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

        </div>
        </TooltipProvider>
      </div>

      {/* Footer with Ready to Ship button */}
      {status !== "ready_to_ship" && status !== "closed" && availableStatuses.includes("ready_to_ship") && (
        <div className="-mx-4 px-6 py-3 bg-card border-t border-border shrink-0">
          <Button
            onClick={() => handleStatusChange("ready_to_ship")}
            disabled={fieldStates.status.isSaving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {fieldStates.status.isSaving ? (
              <Spinner className="h-4 w-4 mr-2" />
            ) : (
              <Rocket className="h-4 w-4 mr-2" />
            )}
            Ready to Ship
          </Button>
        </div>
      )}

      {/* Floating navigation buttons */}
      {bead.comments.length > 0 && (isAtTop ? !isFirstCommentVisible : true) && (
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 z-10",
          status !== "ready_to_ship" && status !== "closed" && availableStatuses.includes("ready_to_ship")
            ? "bottom-20"
            : "bottom-4"
        )}>
          {isAtTop && !isFirstCommentVisible ? (
            // At top, comments not visible → go to first comment
            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToFirstComment}
              className="shadow-lg shadow-black/30 hover:shadow-black/40 transition-shadow"
            >
              <ArrowDown className="h-4 w-4 mr-1.5" />
              First comment
            </Button>
          ) : isLastCommentVisible ? (
            // At bottom → go to first comment
            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToFirstComment}
              className="shadow-lg shadow-black/30 hover:shadow-black/40 transition-shadow"
            >
              <ArrowUp className="h-4 w-4 mr-1.5" />
              First comment
            </Button>
          ) : (
            // In middle → go to latest comment
            <Button
              variant="secondary"
              size="sm"
              onClick={scrollToLastComment}
              className="shadow-lg shadow-black/30 hover:shadow-black/40 transition-shadow"
            >
              <ArrowDown className="h-4 w-4 mr-1.5" />
              Latest comment
            </Button>
          )}
        </div>
      )}

      {/* Expanded Comment Modal */}
      <Dialog open={!!expandedComment} onOpenChange={(open) => !open && setExpandedComment(null)}>
        <DialogContent className="!w-[80vw] !max-w-[80vw] max-h-[90vh] h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-primary/20 text-primary">
                {expandedComment?.author.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium">{expandedComment?.author}</span>
              <span className="text-sm text-muted-foreground font-normal">
                {expandedComment && formatDateTime(expandedComment.timestamp)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
              {expandedComment && <SimpleMarkdown content={expandedComment.content} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded Bead Detail Modal */}
      <Dialog open={isExpandedView} onOpenChange={setIsExpandedView}>
        <DialogContent className="!w-[85vw] !max-w-[85vw] max-h-[90vh] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn(
                  "px-2 py-1 text-xs font-medium rounded border capitalize shrink-0",
                  typeColors[type]
                )}>
                  {type}
                </span>
                <DialogTitle className="text-lg font-semibold text-foreground/70 truncate">
                  {bead.title}
                </DialogTitle>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
              <CopyableId id={bead.id} className="text-xs" />
              {bead.externalRef && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                  {bead.externalRef}
                </span>
              )}
              {bead.createdAt && <span title={formatDate(bead.createdAt)}>Created: {formatRelativeTime(bead.createdAt)}</span>}
              {bead.updatedAt && <span title={formatDate(bead.updatedAt)}>Updated: {formatRelativeTime(bead.updatedAt)}</span>}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className={cn(
                getStatusDisplayConfig(status).colorClass,
              )}>
                {getStatusDisplayConfig(status).label}
              </span>
              <span className="text-border">|</span>
              <span className={cn(
                priority === "critical" && "text-red-400",
                priority === "high" && "text-orange-400",
                priority === "medium" && "text-yellow-400",
                priority === "low" && "text-slate-400",
              )}>
                {priority}
              </span>
              {assignee && (
                <>
                  <span className="text-border">|</span>
                  <span>{assignee}</span>
                </>
              )}
              {labels.length > 0 && (
                <>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-1">
                    {labels.map((label) => (
                      <span key={label} className="text-[11px] text-muted-foreground">{label}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                {description ? (
                  <SimpleMarkdown content={description} />
                ) : (
                  <p className="text-muted-foreground/50 italic text-sm">No description</p>
                )}
              </div>
            </div>

            {/* Design */}
            {design && (
              <div className="pt-4 border-t border-border/30">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Design</h3>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                  <SimpleMarkdown content={design} />
                </div>
              </div>
            )}

            {/* Acceptance Criteria */}
            {acceptanceCriteria && (
              <div className="pt-4 border-t border-border/30">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Acceptance Criteria</h3>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                  <SimpleMarkdown content={acceptanceCriteria} />
                </div>
              </div>
            )}

            {/* Notes */}
            {notes && (
              <div className="pt-4 border-t border-border/30">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
                <div className="prose prose-sm prose-invert max-w-none text-foreground/90">
                  <SimpleMarkdown content={notes} />
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
                        onClick={() => { setIsExpandedView(false); onBeadNavigate?.(dep.id) }}
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
                        onClick={() => { setIsExpandedView(false); onBeadNavigate?.(dep.id) }}
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
              <div className="pt-4 border-t border-border/30 space-y-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Comments ({bead.comments.length})
                </h3>
                {bead.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl bg-card shadow-md shadow-black/20 overflow-hidden"
                  >
                    <div className="group flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/20">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-primary/20 text-primary">
                        {comment.author.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-sm text-foreground/70">{comment.author}</span>
                      <span className="text-xs text-muted-foreground/60 ml-auto">{formatRelativeTime(comment.timestamp)}</span>
                    </div>
                    <div className="px-4 py-3 text-sm text-foreground/90">
                      <SimpleMarkdown content={comment.content} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
