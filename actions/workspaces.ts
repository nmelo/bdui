"use server"

import { detectWorkspaces, resolveDbPath, type Workspace as DbWorkspace } from "@/lib/db"
import type { Workspace } from "@/lib/types"

// Get all available workspaces
export async function getWorkspaces(): Promise<Workspace[]> {
  const workspaces = await detectWorkspaces()

  return workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    path: ws.path,
    databasePath: ws.databasePath,
  }))
}

// Resolve the current database path
export async function getCurrentDbPath(cwd?: string): Promise<string | null> {
  return resolveDbPath(undefined, cwd)
}

// Extended workspace type with database path
export interface ExtendedWorkspace extends Workspace {
  path: string
  databasePath: string
}
