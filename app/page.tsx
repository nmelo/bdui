"use client"

declare global {
  interface Window {
    __BEADS_DB__?: string
  }
}

import { useState, useEffect, useMemo, useTransition, useCallback, Suspense, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { EpicTree } from "@/components/epic-tree"
import { BeadDetailPanel } from "@/components/bead-detail-panel"
import { FilterBar, type Filters, type SortOption } from "@/components/filter-bar"
import { getEpics, getBeadDetail } from "@/actions/epics"
import { getWorkspaces } from "@/actions/workspaces"
import { updateBeadStatus, updateBeadPriority, updateBeadParent, addComment as addCommentAction, deleteBead, archiveBead, backlogBead, getAvailableStatuses } from "@/actions/beads"
import { useWebSocket } from "@/hooks/use-websocket"
import { getWorkspaceCookie, setWorkspaceCookie } from "@/lib/workspace-cookie"
import { getSortPreference, setSortPreference, getFiltersPreference, setFiltersPreference } from "@/lib/local-storage"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import type { Workspace, Epic, Bead, BeadStatus, BeadPriority, Comment } from "@/lib/types"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Extract all unique assignees from epics recursively
function extractAssignees(epics: Epic[]): string[] {
  const assignees = new Set<string>()

  function traverseBead(bead: Bead) {
    if (bead.assignee) {
      assignees.add(bead.assignee)
    }
    // Traverse subtasks
    bead.children?.forEach(traverseBead)
  }

  function traverseEpic(epic: Epic) {
    traverseBead(epic)
    epic.children.forEach(traverseBead)
    epic.childEpics?.forEach(traverseEpic)
  }

  epics.forEach(traverseEpic)
  return Array.from(assignees).sort()
}

// Filter beads based on criteria
function matchesBead(bead: Bead, filters: Filters): boolean {
  // Hide messages unless explicitly shown
  if (!filters.showMessages && bead.type === "message") {
    return false
  }
  if (filters.status !== "all" && bead.status !== filters.status) {
    return false
  }
  if (filters.priority !== "all" && bead.priority !== filters.priority) {
    return false
  }
  if (filters.assignee !== "all" && bead.assignee !== filters.assignee) {
    return false
  }
  if (filters.search) {
    const searchLower = filters.search.toLowerCase()
    const matchesTitle = bead.title.toLowerCase().includes(searchLower)
    const matchesId = bead.id.toLowerCase().includes(searchLower)
    if (!matchesTitle && !matchesId) {
      return false
    }
  }
  return true
}

// Recursively filter a bead and its children
function filterBead(bead: Bead, filters: Filters): Bead | null {
  // Recursively filter children first
  const filteredChildren = bead.children
    ?.map((child) => filterBead(child, filters))
    .filter((b): b is Bead => b !== null)

  // Check if bead itself matches
  const beadMatches = matchesBead(bead, filters)

  // Keep bead if it matches or has matching children
  if (beadMatches || (filteredChildren && filteredChildren.length > 0)) {
    return {
      ...bead,
      children: filteredChildren,
    }
  }

  return null
}

// Recursively filter epics - keep epic if it or any descendant matches
function filterEpic(epic: Epic, filters: Filters): Epic | null {
  // Filter child beads (including their subtasks)
  const filteredChildren = epic.children
    .map((child) => filterBead(child, filters))
    .filter((b): b is Bead => b !== null)

  // Recursively filter child epics
  const filteredChildEpics = epic.childEpics
    ?.map((childEpic) => filterEpic(childEpic, filters))
    .filter((e): e is Epic => e !== null) ?? []

  // The _standalone pseudo-epic should only show if it has matching children
  // (it's not a real epic, just a container for orphan beads)
  if (epic.id === "_standalone") {
    if (filteredChildren.length === 0) {
      return null
    }
    return { ...epic, children: filteredChildren, childEpics: [] }
  }

  // Check if epic itself matches
  const epicMatches = matchesBead(epic, filters)

  // Keep epic if it matches, or has matching descendants
  if (epicMatches || filteredChildren.length > 0 || filteredChildEpics.length > 0) {
    return {
      ...epic,
      children: filteredChildren,
      childEpics: filteredChildEpics,
    }
  }

  return null
}

function filterEpics(epics: Epic[], filters: Filters): Epic[] {
  // If no filters applied, return all
  if (
    filters.status === "all" &&
    filters.priority === "all" &&
    filters.assignee === "all" &&
    !filters.search &&
    filters.showMessages
  ) {
    return epics
  }

  return epics
    .map((epic) => filterEpic(epic, filters))
    .filter((e): e is Epic => e !== null)
}

// Priority order for sorting (lower = higher priority)
const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const statusOrder: Record<string, number> = { open: 0, in_progress: 1, closed: 2 }

function compareBead(a: Bead, b: Bead, sort: SortOption): number {
  let cmp = 0
  switch (sort.field) {
    case "title":
      cmp = a.title.localeCompare(b.title)
      break
    case "priority":
      cmp = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)
      break
    case "status":
      cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
      break
    case "updated":
      cmp = (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0)
      break
  }
  return sort.direction === "asc" ? cmp : -cmp
}

function sortBeads(beads: Bead[], sort: SortOption): Bead[] {
  return [...beads]
    .map((bead) => ({
      ...bead,
      children: bead.children ? sortBeads(bead.children, sort) : undefined,
    }))
    .sort((a, b) => compareBead(a, b, sort))
}

function sortEpics(epics: Epic[], sort: SortOption): Epic[] {
  return [...epics]
    .map((epic) => ({
      ...epic,
      children: sortBeads(epic.children, sort),
      childEpics: epic.childEpics ? sortEpics(epic.childEpics, sort) : undefined,
    }))
    .sort((a, b) => compareBead(a, b, sort))
}

// Build parent path for a bead
function findParentPath(epics: Epic[], beadId: string, path: { id: string; title: string }[] = []): { id: string; title: string }[] | null {
  for (const epic of epics) {
    const currentPath = [...path, { id: epic.id, title: epic.title }]

    // Check direct children
    if (epic.children?.some(child => child.id === beadId)) {
      return currentPath
    }

    // Check child epics
    if (epic.childEpics) {
      const result = findParentPath(epic.childEpics, beadId, currentPath)
      if (result) return result
    }
  }
  return null
}

// Recursively find a bead by ID in a bead and its children
function findInBead(bead: Bead, beadId: string): Bead | null {
  if (bead.id === beadId) return bead
  if (bead.children) {
    for (const child of bead.children) {
      const found = findInBead(child, beadId)
      if (found) return found
    }
  }
  return null
}

// Find a bead by ID in the epic tree
function findBeadById(epics: Epic[], beadId: string): Bead | null {
  for (const epic of epics) {
    if (epic.id === beadId) return epic
    for (const child of epic.children ?? []) {
      const found = findInBead(child, beadId)
      if (found) return found
    }
    if (epic.childEpics) {
      const found = findBeadById(epic.childEpics, beadId)
      if (found) return found
    }
  }
  return null
}

// Check if childId is a descendant of the epic with parentId (to prevent circular references)
function isDescendantOf(parentId: string, childId: string, epics: Epic[]): boolean {
  function checkEpic(epic: Epic): boolean {
    if (epic.id === childId) return true
    return epic.childEpics?.some(checkEpic) ?? false
  }
  function findAndCheck(epicList: Epic[]): boolean {
    for (const epic of epicList) {
      if (epic.id === parentId) return checkEpic(epic)
      if (epic.childEpics && findAndCheck(epic.childEpics)) return true
    }
    return false
  }
  return findAndCheck(epics)
}

function BeadsEpicsViewer() {
  const [isDark, setIsDark] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [epics, setEpics] = useState<Epic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingWorkspaceId, setLoadingWorkspaceId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [filters, setFiltersState] = useState<Filters>({
    status: "all",
    assignee: "all",
    priority: "all",
    showMessages: false,
    search: "",
  })

  // Load filters preference from localStorage on mount
  useEffect(() => {
    setFiltersState(getFiltersPreference())
  }, [])

  // Wrap setFilters to persist to localStorage
  const setFilters = useCallback((newFilters: Filters) => {
    setFiltersState(newFilters)
    setFiltersPreference(newFilters)
  }, [])
  const [sort, setSortState] = useState<SortOption>({ field: "updated", direction: "desc" })

  // Load sort preference from localStorage on mount
  useEffect(() => {
    setSortState(getSortPreference())
  }, [])

  // Wrap setSort to persist to localStorage
  const setSort = useCallback((newSort: SortOption) => {
    setSortState(newSort)
    setSortPreference(newSort)
  }, [])

  // Drag and drop state
  const [draggedBeadId, setDraggedBeadId] = useState<string | null>(null)
  const [dragOverEpicId, setDragOverEpicId] = useState<string | null>(null)

  // Track last load time to debounce SSE events
  // (SQLite WAL checkpoint from reads can trigger file watcher)
  const lastLoadTime = useRef(0)

  // URL-based expanded state for epics
  const searchParams = useSearchParams()
  const router = useRouter()
  const expandedEpics = useMemo(() => {
    const expandedParam = searchParams.get("expanded") || ""
    return new Set(expandedParam ? expandedParam.split(",") : [])
  }, [searchParams])

  // Local state for expanded beads (subtasks) - kept separate from URL to avoid clutter
  const [expandedBeads, setExpandedBeads] = useState<Set<string>>(new Set())

  // URL-based bead selection state
  const beadIdParam = searchParams.get("bead")
  const [selectedBead, setSelectedBead] = useState<Bead | null>(null)
  const [isLoadingBead, setIsLoadingBead] = useState(false)

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Keyboard navigation focus state (separate from URL-based selection)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)

  // Available statuses for the current workspace (core + custom)
  const [availableStatuses, setAvailableStatuses] = useState<string[]>(["open", "in_progress", "closed"])

  // Ref for scrolling focused items into view
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // Fetch full bead details (including comments) when modal opens
  useEffect(() => {
    if (!beadIdParam || epics.length === 0) {
      setSelectedBead(null)
      return
    }

    // First check if bead exists in cached data
    const cachedBead = findBeadById(epics, beadIdParam)
    if (!cachedBead) {
      setSelectedBead(null)
      return
    }

    // Show cached data immediately, then fetch full details with comments
    setSelectedBead(cachedBead)
    setIsLoadingBead(true)

    getBeadDetail(beadIdParam, currentWorkspace?.databasePath)
      .then((fullBead) => {
        if (fullBead) {
          setSelectedBead(fullBead)
        }
      })
      .finally(() => {
        setIsLoadingBead(false)
      })
  }, [beadIdParam, epics, currentWorkspace?.databasePath])
  const parentPath = useMemo(() => {
    if (!beadIdParam) return []
    return findParentPath(epics, beadIdParam) || []
  }, [beadIdParam, epics])

  const handleToggleEpic = useCallback((epicId: string) => {
    const next = new Set(expandedEpics)
    if (next.has(epicId)) {
      next.delete(epicId)
    } else {
      next.add(epicId)
    }

    const expanded = Array.from(next).join(",")
    const params = new URLSearchParams(searchParams.toString())
    if (expanded) {
      params.set("expanded", expanded)
    } else {
      params.delete("expanded")
    }

    router.replace(`?${params.toString()}`, { scroll: false })
  }, [expandedEpics, searchParams, router])

  const handleToggleBead = useCallback((beadId: string) => {
    setExpandedBeads((prev) => {
      const next = new Set(prev)
      if (next.has(beadId)) {
        next.delete(beadId)
      } else {
        next.add(beadId)
      }
      return next
    })
  }, [])

  const assignees = useMemo(() => extractAssignees(epics), [epics])
  const filteredEpics = useMemo(() => filterEpics(epics, filters), [epics, filters])
  const sortedEpics = useMemo(() => sortEpics(filteredEpics, sort), [filteredEpics, sort])

  // Helper to check if a bead is backlogged
  const isBacklogged = useCallback((b: Bead) => b.labels?.includes("backlog"), [])

  // Split epics into active, backlog, and archived
  // Archived takes precedence over backlog (if both labels exist, show in archived)
  const activeEpics = useMemo(
    () => sortedEpics.filter(e => !e.labels?.includes("archived") && !isBacklogged(e)),
    [sortedEpics, isBacklogged]
  )
  const backlogEpics = useMemo(
    () => sortedEpics.filter(e => isBacklogged(e) && !e.labels?.includes("archived")),
    [sortedEpics, isBacklogged]
  )
  const archivedEpics = useMemo(
    () => sortedEpics.filter(e => e.labels?.includes("archived")),
    [sortedEpics]
  )

  // Extract backlogged loose beads from _standalone epic
  const backlogBeads = useMemo(() => {
    const standaloneEpic = sortedEpics.find(e => e.id === "_standalone")
    return standaloneEpic?.children.filter(isBacklogged) || []
  }, [sortedEpics, isBacklogged])

  // Filter out backlogged beads from _standalone children in active view
  const activeEpicsWithFilteredStandalone = useMemo(() => {
    return activeEpics.map(epic => {
      if (epic.id === "_standalone") {
        return {
          ...epic,
          children: epic.children.filter(b => !isBacklogged(b))
        }
      }
      return epic
    })
  }, [activeEpics, isBacklogged])

  // Computed flat list of navigable items (respects expand/collapse state)
  // Includes bead reference and builds id→index map to avoid O(n) lookups on each keypress
  const { navigableItems, itemIndexMap } = useMemo(() => {
    const items: { id: string; type: "epic" | "bead"; bead: Bead }[] = []
    const indexMap = new Map<string, number>()

    function addBead(bead: Bead) {
      indexMap.set(bead.id, items.length)
      items.push({ id: bead.id, type: "bead", bead })
      if (expandedBeads.has(bead.id) && bead.children) {
        bead.children.forEach(addBead)
      }
    }

    function addEpic(epic: Epic) {
      indexMap.set(epic.id, items.length)
      items.push({ id: epic.id, type: "epic", bead: epic })
      if (expandedEpics.has(epic.id)) {
        epic.childEpics?.forEach(addEpic)
        epic.children.forEach(addBead)
      }
    }

    // Include active, backlog, and archived epics in navigation
    activeEpicsWithFilteredStandalone.forEach(addEpic)
    // Add backlog beads
    backlogBeads.forEach(addBead)
    backlogEpics.forEach(addEpic)
    archivedEpics.forEach(addEpic)
    return { navigableItems: items, itemIndexMap: indexMap }
  }, [activeEpicsWithFilteredStandalone, backlogBeads, backlogEpics, archivedEpics, expandedEpics, expandedBeads])

  // Fetch workspaces on mount and restore saved selection
  useEffect(() => {
    async function loadWorkspaces() {
      const ws = await getWorkspaces()
      setWorkspaces(ws)

      if (ws.length > 0 && !currentWorkspace) {
        // Try to restore saved workspace from cookie
        const savedWorkspaceId = getWorkspaceCookie()
        const savedWorkspace = savedWorkspaceId
          ? ws.find((w) => w.id === savedWorkspaceId)
          : null

        setCurrentWorkspace(savedWorkspace || ws[0])
      }
    }
    loadWorkspaces()
  }, [])

  // Handle workspace change and persist to cookie
  const handleWorkspaceChange = useCallback((workspace: Workspace) => {
    setLoadingWorkspaceId(workspace.id)
    setCurrentWorkspace(workspace)
    setWorkspaceCookie(workspace.id)
  }, [])

  // Fetch epics when workspace changes
  const loadEpics = useCallback(async () => {
    setIsLoading(true)
    try {
      const dbPath = currentWorkspace?.databasePath
      const epicData = await getEpics(dbPath)
      setEpics(epicData)
    } catch (error) {
      console.error("Failed to load epics:", error)
      setEpics([])
    } finally {
      setIsLoading(false)
      setLoadingWorkspaceId(null)
      // Record load time to ignore SSE events triggered by our own read
      // (SQLite WAL checkpoint can modify db file timestamp)
      lastLoadTime.current = Date.now()
    }
  }, [currentWorkspace?.databasePath])

  useEffect(() => {
    if (currentWorkspace) {
      loadEpics()
      // Fetch available statuses for this workspace
      getAvailableStatuses(currentWorkspace.databasePath).then(setAvailableStatuses)
      // Expose db path for console commands
      if (typeof window !== "undefined") {
        window.__BEADS_DB__ = currentWorkspace.databasePath
      }
    }
  }, [currentWorkspace, loadEpics])

  // Subscribe to real-time database changes
  // Debounce to avoid rapid reloads from SQLite WAL checkpoints
  const handleSSEChange = useCallback(() => {
    if (Date.now() - lastLoadTime.current < 2000) {
      return
    }
    loadEpics()
  }, [loadEpics])

  useWebSocket({
    dbPath: currentWorkspace?.databasePath,
    onChange: handleSSEChange,
    enabled: !!currentWorkspace,
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
  }, [isDark])

  const handleThemeToggle = () => {
    setIsDark(!isDark)
  }

  const handleBeadClick = useCallback((bead: Bead) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("bead", bead.id)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const handleBeadNavigate = useCallback((beadId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("bead", beadId)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const handleCloseDetail = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("bead")
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // O(1) lookup instead of O(n) findIndex
      const currentIndex = focusedItemId ? (itemIndexMap.get(focusedItemId) ?? -1) : -1

      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault()
          if (currentIndex < navigableItems.length - 1) {
            setFocusedItemId(navigableItems[currentIndex + 1].id)
          } else if (currentIndex === -1 && navigableItems.length > 0) {
            setFocusedItemId(navigableItems[0].id)
          }
          break

        case "ArrowUp":
        case "k":
          e.preventDefault()
          if (currentIndex > 0) {
            setFocusedItemId(navigableItems[currentIndex - 1].id)
          }
          break

        case "ArrowRight":
        case "l":
          e.preventDefault()
          if (focusedItemId) {
            const item = navigableItems[currentIndex]
            if (item?.type === "epic" && !expandedEpics.has(focusedItemId)) {
              handleToggleEpic(focusedItemId)
            } else if (item?.type === "bead" && !expandedBeads.has(focusedItemId)) {
              handleToggleBead(focusedItemId)
            }
          }
          break

        case "ArrowLeft":
        case "h":
          e.preventDefault()
          if (focusedItemId) {
            const item = navigableItems[currentIndex]
            if (item?.type === "epic" && expandedEpics.has(focusedItemId)) {
              handleToggleEpic(focusedItemId)
            } else if (item?.type === "bead" && expandedBeads.has(focusedItemId)) {
              handleToggleBead(focusedItemId)
            }
          }
          break

        case "Enter":
        case " ":
          e.preventDefault()
          if (focusedItemId && currentIndex >= 0) {
            // Use bead from navigableItems instead of O(n) findBeadById
            handleBeadClick(navigableItems[currentIndex].bead)
          }
          break

        case "Escape":
          e.preventDefault()
          if (beadIdParam) {
            handleCloseDetail()
          } else {
            setFocusedItemId(null)
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [focusedItemId, navigableItems, itemIndexMap, expandedEpics, expandedBeads, beadIdParam, handleToggleEpic, handleToggleBead, handleBeadClick, handleCloseDetail])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedItemId && treeContainerRef.current) {
      const element = treeContainerRef.current.querySelector(`[data-item-id="${focusedItemId}"]`)
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [focusedItemId])

  const updateBeadInEpics = (beadId: string, updateFn: (bead: Bead) => Bead) => {
    // Recursively update a bead and its children
    const updateBead = (bead: Bead): Bead => {
      if (bead.id === beadId) {
        return updateFn(bead)
      }
      if (bead.children) {
        return {
          ...bead,
          children: bead.children.map(updateBead),
        }
      }
      return bead
    }

    const updateEpic = (epic: Epic): Epic => {
      if (epic.id === beadId) {
        return updateFn(epic) as Epic
      }
      return {
        ...epic,
        children: epic.children.map(updateBead),
        childEpics: epic.childEpics?.map(updateEpic),
      }
    }

    setEpics((prevEpics) => prevEpics.map(updateEpic))
  }

  const handleStatusChange = (beadId: string, status: BeadStatus) => {
    // Optimistic update for instant feedback
    updateBeadInEpics(beadId, (bead) => ({ ...bead, status }))
    // Server update
    startTransition(async () => {
      const result = await updateBeadStatus(beadId, status, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to update status:", result.error)
      }
      // Always reload to ensure consistency
      loadEpics()
    })
  }

  const handlePriorityChange = (beadId: string, priority: BeadPriority) => {
    // Optimistic update for instant feedback
    updateBeadInEpics(beadId, (bead) => ({ ...bead, priority }))
    // Server update
    startTransition(async () => {
      const result = await updateBeadPriority(beadId, priority, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to update priority:", result.error)
      }
      // Always reload to ensure consistency
      loadEpics()
    })
  }

  const handleBeadUpdate = (updatedBead: Bead) => {
    updateBeadInEpics(updatedBead.id, () => updatedBead)
  }

  const handleAddComment = (beadId: string, comment: Comment) => {
    // Optimistic update for instant feedback
    updateBeadInEpics(beadId, (bead) => ({
      ...bead,
      comments: [...bead.comments, comment],
    }))
    // Server update
    startTransition(async () => {
      const result = await addCommentAction(beadId, comment.content, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to add comment:", result.error)
      }
      // Always reload to ensure consistency
      loadEpics()
    })
  }

  const handleDelete = useCallback((beadId: string) => {
    // Close the detail panel first
    handleCloseDetail()
    // Delete on server and reload
    startTransition(async () => {
      const result = await deleteBead(beadId, currentWorkspace?.databasePath)
      if (result.success) {
        toast.success("Bead deleted")
      } else {
        console.error("Failed to delete bead:", result.error)
        toast.error("Failed to delete bead", { description: result.error })
      }
      loadEpics()
    })
  }, [handleCloseDetail, currentWorkspace?.databasePath, loadEpics])

  // Drag and drop handlers
  const handleDragStart = useCallback((beadId: string) => {
    setDraggedBeadId(beadId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedBeadId(null)
    setDragOverEpicId(null)
  }, [])

  const handleDragOver = useCallback((epicId: string | null) => {
    setDragOverEpicId(epicId)
  }, [])

  const handleBeadMove = useCallback(async (beadId: string, targetEpicId: string) => {
    // "_standalone" means remove parent (set to null)
    // "_toplevel" also means remove parent
    const newParentId = (targetEpicId === "_standalone" || targetEpicId === "_toplevel") ? null : targetEpicId

    // Helper to find a bead/epic by ID in any tree
    const findBead = (id: string, items: (Bead | Epic)[]): Bead | Epic | null => {
      for (const item of items) {
        if (item.id === id) return item
        if (item.children) {
          const found = findBead(id, item.children)
          if (found) return found
        }
        if ("childEpics" in item && item.childEpics) {
          const found = findBead(id, item.childEpics)
          if (found) return found
        }
      }
      return null
    }

    // Check if the bead is in backlog or archive
    const bead = findBead(beadId, [...epics, ...backlogEpics, ...archivedEpics])
    const isInBacklog = bead?.labels?.includes("backlog")
    const isInArchive = bead?.labels?.includes("archived")

    startTransition(async () => {
      // Update parent
      const result = await updateBeadParent(beadId, newParentId, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to move bead:", result.error)
      }

      // If moving from backlog or archive, remove those labels
      if (isInBacklog) {
        await backlogBead(beadId, false, currentWorkspace?.databasePath)
      }
      if (isInArchive) {
        await archiveBead(beadId, false, currentWorkspace?.databasePath)
      }

      // Reload to show the moved bead in its new location
      loadEpics()
    })
  }, [currentWorkspace?.databasePath, loadEpics, epics, backlogEpics, archivedEpics])

  // Validate if an epic can be moved to a target (prevents circular references)
  const canMoveEpic = useCallback((epicId: string, targetEpicId: string): boolean => {
    if (epicId === targetEpicId) return false
    if (targetEpicId === "_standalone") return true
    return !isDescendantOf(epicId, targetEpicId, epics)
  }, [epics])

  // Archive/unarchive handler
  const handleArchive = useCallback(async (id: string, archived: boolean) => {
    startTransition(async () => {
      const result = await archiveBead(id, archived, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to archive bead:", result.error)
        toast.error(archived ? "Failed to archive" : "Failed to unarchive", { description: result.error })
      }
      loadEpics()
    })
  }, [currentWorkspace?.databasePath, loadEpics])

  // Backlog handler
  const handleBacklog = useCallback(async (id: string, inBacklog: boolean) => {
    startTransition(async () => {
      const result = await backlogBead(id, inBacklog, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to update backlog status:", result.error)
        toast.error(inBacklog ? "Failed to move to backlog" : "Failed to remove from backlog", { description: result.error })
      }
      loadEpics()
    })
  }, [currentWorkspace?.databasePath, loadEpics])

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header
        workspaces={workspaces}
        currentWorkspace={currentWorkspace || { id: "", name: "Loading..." }}
        onWorkspaceChange={handleWorkspaceChange}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
        loadingWorkspaceId={loadingWorkspaceId}
        isPending={isPending}
      />

      <main className="flex-1 flex flex-col px-6 py-4 min-h-0">
        <div className="mb-4">
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            assignees={assignees}
            sort={sort}
            onSortChange={setSort}
          />
        </div>

        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 min-h-0"
          autoSaveId="beads-panel-layout"
        >
          {/* Epic Tree - Left Panel */}
          <ResizablePanel defaultSize={55} minSize={30}>
            <div ref={treeContainerRef} className="h-full overflow-y-auto pr-4">
              {isLoading && epics.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading epics...
                </div>
              ) : activeEpicsWithFilteredStandalone.length > 0 || backlogEpics.length > 0 || backlogBeads.length > 0 || archivedEpics.length > 0 ? (
                <EpicTree
                  epics={activeEpicsWithFilteredStandalone}
                  archivedEpics={archivedEpics}
                  backlogEpics={backlogEpics}
                  backlogBeads={backlogBeads}
                  expandedEpics={expandedEpics}
                  onToggleEpic={handleToggleEpic}
                  onBeadClick={handleBeadClick}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onDelete={setDeleteConfirmId}
                  onBeadMove={handleBeadMove}
                  canMoveEpic={canMoveEpic}
                  dragOverEpicId={dragOverEpicId}
                  onDragOver={handleDragOver}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  draggedBeadId={draggedBeadId}
                  expandedBeads={expandedBeads}
                  onToggleBead={handleToggleBead}
                  focusedItemId={focusedItemId}
                  onFocusItem={setFocusedItemId}
                  onArchive={handleArchive}
                  onBacklog={handleBacklog}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {epics.length === 0 ? "No epics found in this workspace" : "No epics or beads match your filters"}
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Detail Panel - Right Panel */}
          <ResizablePanel defaultSize={45} minSize={20}>
            <div className="h-full overflow-hidden pl-4">
              <BeadDetailPanel
                bead={selectedBead}
                onClose={handleCloseDetail}
                onUpdate={handleBeadUpdate}
                onAddComment={handleAddComment}
                onDelete={handleDelete}
                onBeadNavigate={handleBeadNavigate}
                parentPath={parentPath}
                dbPath={currentWorkspace?.databasePath}
                assignees={assignees}
                availableStatuses={availableStatuses}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The item will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirmId) {
                  handleDelete(deleteConfirmId)
                  setDeleteConfirmId(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <BeadsEpicsViewer />
    </Suspense>
  )
}
