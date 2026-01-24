import type { SortOption, Filters } from "@/components/filter-bar"

const SORT_KEY = "beads-sort"
const FILTERS_KEY = "beads-filters"

const DEFAULT_SORT: SortOption = { field: "updated", direction: "desc" }

const DEFAULT_FILTERS: Filters = {
  status: "all",
  assignee: "all",
  priority: "all",
  showMessages: false,
  search: "",
}

export function getSortPreference(): SortOption {
  if (typeof window === "undefined") return DEFAULT_SORT

  try {
    const stored = localStorage.getItem(SORT_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.field && parsed.direction) {
        return parsed as SortOption
      }
    }
  } catch {
    // Invalid JSON or other error, use default
  }
  return DEFAULT_SORT
}

export function setSortPreference(sort: SortOption): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort))
  } catch {
    // localStorage might be full or disabled
  }
}

export function getFiltersPreference(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS

  try {
    const stored = localStorage.getItem(FILTERS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_FILTERS, ...parsed }
    }
  } catch {
    // Invalid JSON or other error, use default
  }
  return DEFAULT_FILTERS
}

export function setFiltersPreference(filters: Filters): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // localStorage might be full or disabled
  }
}
