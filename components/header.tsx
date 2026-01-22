"use client"

import { Moon, Sun, Circle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Workspace } from "@/lib/types"

interface HeaderProps {
  workspaces: Workspace[]
  currentWorkspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
  isDark: boolean
  onThemeToggle: () => void
  loadingWorkspaceId?: string | null
  isPending?: boolean
}

export function Header({
  workspaces,
  currentWorkspace,
  onWorkspaceChange,
  isDark,
  onThemeToggle,
  loadingWorkspaceId,
  isPending,
}: HeaderProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Circle className="h-3 w-3 fill-primary text-primary" />
              <Circle className="h-2 w-2 fill-primary/70 text-primary/70" />
              <Circle className="h-1.5 w-1.5 fill-primary/50 text-primary/50" />
            </div>
            <span className="text-xl font-semibold text-foreground">Beads</span>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-background/50 border border-border">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => onWorkspaceChange(workspace)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  workspace.id === currentWorkspace.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {workspace.name}
                {loadingWorkspaceId === workspace.id && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className="text-muted-foreground hover:text-foreground"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
