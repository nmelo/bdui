"use client"

import { Search, ArrowUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { BeadStatus, BeadPriority } from "@/lib/types"

export interface Filters {
  status: BeadStatus | "all"
  assignee: string
  priority: BeadPriority | "all"
  search: string
  showMessages: boolean
}

export type SortField = "title" | "priority" | "status" | "updated"
export type SortDirection = "asc" | "desc"
export interface SortOption {
  field: SortField
  direction: SortDirection
}

interface FilterBarProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
  assignees: string[]
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}

// Encode sort option as string for select value
function encodeSortValue(sort: SortOption): string {
  return `${sort.field}:${sort.direction}`
}

// Decode select value back to sort option
function decodeSortValue(value: string): SortOption {
  const [field, direction] = value.split(":") as [SortField, SortDirection]
  return { field, direction }
}

const sortOptions = [
  { value: "updated:desc", label: "Updated (Newest)" },
  { value: "updated:asc", label: "Updated (Oldest)" },
  { value: "title:asc", label: "Title (A-Z)" },
  { value: "title:desc", label: "Title (Z-A)" },
  { value: "priority:asc", label: "Priority (High-Low)" },
  { value: "priority:desc", label: "Priority (Low-High)" },
  { value: "status:asc", label: "Status (Open first)" },
  { value: "status:desc", label: "Status (Closed first)" },
]

export function FilterBar({ filters, onFiltersChange, assignees, sort, onSortChange }: FilterBarProps) {
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="pl-9 h-9 bg-transparent border-0 rounded-none"
        />
      </div>

      {/* Status Filter */}
      <Select
        value={filters.status}
        onValueChange={(value) => updateFilter("status", value as BeadStatus | "all")}
      >
        <SelectTrigger className="w-[140px] h-9 bg-transparent border-0 rounded-none">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select
        value={filters.priority}
        onValueChange={(value) => updateFilter("priority", value as BeadPriority | "all")}
      >
        <SelectTrigger className="w-[140px] h-9 bg-transparent border-0 rounded-none">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      {/* Assignee Filter */}
      <Select
        value={filters.assignee}
        onValueChange={(value) => updateFilter("assignee", value)}
      >
        <SelectTrigger className="w-[165px] h-9 bg-transparent border-0 rounded-none">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Assignees</SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee} value={assignee}>
              {assignee}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={encodeSortValue(sort)}
        onValueChange={(value) => onSortChange(decodeSortValue(value))}
      >
        <SelectTrigger className="w-[235px] h-9 bg-transparent border-0 rounded-none">
          <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Show Messages Toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-messages"
          checked={filters.showMessages}
          onCheckedChange={(checked) => updateFilter("showMessages", checked === true)}
        />
        <Label htmlFor="show-messages" className="text-sm text-muted-foreground cursor-pointer">
          Show messages
        </Label>
      </div>
    </div>
  )
}
