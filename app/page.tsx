"use client"

import { useState, useEffect, useMemo, useTransition, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { EpicTree } from "@/components/epic-tree"
import { BeadDetailModal } from "@/components/bead-detail-modal"
import { FilterBar, type Filters, type SortOption } from "@/components/filter-bar"
import { getEpics } from "@/actions/epics"
import { getWorkspaces } from "@/actions/workspaces"
import { updateBeadStatus, updateBeadPriority, addComment as addCommentAction } from "@/actions/beads"
import { useSSE } from "@/hooks/use-sse"
import { getWorkspaceCookie, setWorkspaceCookie } from "@/lib/workspace-cookie"
import type { Workspace, Epic, Bead, BeadStatus, BeadPriority, Comment } from "@/lib/types"

// Extract all unique assignees from epics recursively
function extractAssignees(epics: Epic[]): string[] {
  const assignees = new Set<string>()

  function traverse(bead: Bead) {
    if (bead.assignee) {
      assignees.add(bead.assignee)
    }
  }

  function traverseEpic(epic: Epic) {
    traverse(epic)
    epic.children.forEach(traverse)
    epic.childEpics?.forEach(traverseEpic)
  }

  epics.forEach(traverseEpic)
  return Array.from(assignees).sort()
}

// Filter beads based on criteria
function matchesBead(bead: Bead, filters: Filters): boolean {
  if (filters.status !== "all" && bead.status !== filters.status) {
    return false
  }
  if (filters.priority !== "all" && bead.priority !== filters.priority) {
    return false
  }
  if (filters.assignee !== "all" && bead.assignee !== filters.assignee) {
    return false
  }
  if (filters.search && !bead.title.toLowerCase().includes(filters.search.toLowerCase())) {
    return false
  }
  return true
}

// Recursively filter epics - keep epic if it or any descendant matches
function filterEpic(epic: Epic, filters: Filters): Epic | null {
  // Filter child beads
  const filteredChildren = epic.children.filter((child) => matchesBead(child, filters))

  // Recursively filter child epics
  const filteredChildEpics = epic.childEpics
    ?.map((childEpic) => filterEpic(childEpic, filters))
    .filter((e): e is Epic => e !== null) ?? []

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
    !filters.search
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

function sortEpics(epics: Epic[], sort: SortOption): Epic[] {
  return [...epics].sort((a, b) => {
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
  })
}

// Build parent path for a bead
function findParentPath(epics: Epic[], beadId: string, path: { id: string; title: string }[] = []): { id: string; title: string }[] | null {
  for (const epic of epics) {
    const currentPath = [...path, { id: epic.id, title: epic.title }]

    // Check direct children
    if (epic.children.some(child => child.id === beadId)) {
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

// Find a bead by ID in the epic tree
function findBeadById(epics: Epic[], beadId: string): Bead | null {
  for (const epic of epics) {
    if (epic.id === beadId) return epic
    for (const child of epic.children) {
      if (child.id === beadId) return child
    }
    if (epic.childEpics) {
      const found = findBeadById(epic.childEpics, beadId)
      if (found) return found
    }
  }
  return null
}

export default function BeadsEpicsViewer() {
  const [isDark, setIsDark] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [epics, setEpics] = useState<Epic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [, startTransition] = useTransition()
  const [filters, setFilters] = useState<Filters>({
    status: "all",
    assignee: "all",
    priority: "all",
    search: "",
  })
  const [sort, setSort] = useState<SortOption>({ field: "updated", direction: "desc" })

  // URL-based expanded state
  const searchParams = useSearchParams()
  const router = useRouter()
  const expandedEpics = useMemo(() => {
    const expandedParam = searchParams.get("expanded") || ""
    return new Set(expandedParam ? expandedParam.split(",") : [])
  }, [searchParams])

  // URL-based modal state
  const beadIdParam = searchParams.get("bead")
  const selectedBead = useMemo(() => {
    if (!beadIdParam || epics.length === 0) return null
    return findBeadById(epics, beadIdParam)
  }, [beadIdParam, epics])
  const modalOpen = !!selectedBead
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

  const assignees = useMemo(() => extractAssignees(epics), [epics])
  const filteredEpics = useMemo(() => filterEpics(epics, filters), [epics, filters])
  const sortedEpics = useMemo(() => sortEpics(filteredEpics, sort), [filteredEpics, sort])

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
    }
  }, [currentWorkspace?.databasePath])

  useEffect(() => {
    if (currentWorkspace) {
      loadEpics()
    }
  }, [currentWorkspace, loadEpics])

  // Subscribe to real-time database changes
  useSSE({
    dbPath: currentWorkspace?.databasePath,
    onChange: loadEpics,
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

  const handleModalOpenChange = useCallback((open: boolean) => {
    if (!open) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("bead")
      router.replace(`?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, router])

  const updateBeadInEpics = (beadId: string, updateFn: (bead: Bead) => Bead) => {
    const updateEpic = (epic: Epic): Epic => {
      if (epic.id === beadId) {
        return updateFn(epic) as Epic
      }
      return {
        ...epic,
        children: epic.children.map((child) =>
          child.id === beadId ? updateFn(child) : child
        ),
        childEpics: epic.childEpics?.map(updateEpic),
      }
    }

    setEpics((prevEpics) => prevEpics.map(updateEpic))
  }

  const handleStatusChange = (beadId: string, status: BeadStatus) => {
    // Optimistic update
    updateBeadInEpics(beadId, (bead) => ({ ...bead, status }))
    // Server update
    startTransition(async () => {
      const result = await updateBeadStatus(beadId, status, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to update status:", result.error)
        // Reload to revert optimistic update
        loadEpics()
      }
    })
  }

  const handlePriorityChange = (beadId: string, priority: BeadPriority) => {
    // Optimistic update
    updateBeadInEpics(beadId, (bead) => ({ ...bead, priority }))
    // Server update
    startTransition(async () => {
      const result = await updateBeadPriority(beadId, priority, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to update priority:", result.error)
        // Reload to revert optimistic update
        loadEpics()
      }
    })
  }

  const handleBeadUpdate = (updatedBead: Bead) => {
    updateBeadInEpics(updatedBead.id, () => updatedBead)
  }

  const handleAddComment = (beadId: string, comment: Comment) => {
    // Optimistic update
    updateBeadInEpics(beadId, (bead) => ({
      ...bead,
      comments: [...bead.comments, comment],
    }))
    // Server update
    startTransition(async () => {
      const result = await addCommentAction(beadId, comment.content, currentWorkspace?.databasePath)
      if (!result.success) {
        console.error("Failed to add comment:", result.error)
        // Reload to revert optimistic update
        loadEpics()
      }
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        workspaces={workspaces}
        currentWorkspace={currentWorkspace || { id: "", name: "Loading..." }}
        onWorkspaceChange={handleWorkspaceChange}
        isDark={isDark}
        onThemeToggle={handleThemeToggle}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Epics</h1>
          <p className="text-muted-foreground mt-1">
            Track progress across your project epics and their child beads
          </p>
        </div>

        <div className="mb-6">
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            assignees={assignees}
            sort={sort}
            onSortChange={setSort}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading epics...
          </div>
        ) : sortedEpics.length > 0 ? (
          <EpicTree
            epics={sortedEpics}
            expandedEpics={expandedEpics}
            onToggleEpic={handleToggleEpic}
            onBeadClick={handleBeadClick}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
          />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            {epics.length === 0 ? "No epics found in this workspace" : "No epics or beads match your filters"}
          </div>
        )}
      </main>

      <BeadDetailModal
        bead={selectedBead}
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        onUpdate={handleBeadUpdate}
        onAddComment={handleAddComment}
        parentPath={parentPath}
        dbPath={currentWorkspace?.databasePath}
      />
    </div>
  )
}
