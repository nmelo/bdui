"use server"

import {
  updateStatus as bdUpdateStatus,
  updatePriority as bdUpdatePriority,
  updateAssignee as bdUpdateAssignee,
  updateTitle as bdUpdateTitle,
  updateDescription as bdUpdateDescription,
  updateType as bdUpdateType,
  closeBead as bdCloseBead,
  addComment as bdAddComment,
  unmapPriority,
  type BdOptions,
} from "@/lib/bd"
import type { BeadStatus, BeadPriority, BeadType } from "@/lib/types"

// Update bead status
export async function updateBeadStatus(
  id: string,
  status: BeadStatus,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateStatus(id, status, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update status:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead priority
export async function updateBeadPriority(
  id: string,
  priority: BeadPriority,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdatePriority(id, unmapPriority(priority), options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update priority:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead assignee
export async function updateBeadAssignee(
  id: string,
  assignee: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateAssignee(id, assignee, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update assignee:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead title
export async function updateBeadTitle(
  id: string,
  title: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateTitle(id, title, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update title:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead description
export async function updateBeadDescription(
  id: string,
  description: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateDescription(id, description, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update description:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead type
export async function updateBeadType(
  id: string,
  type: BeadType,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateType(id, type, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update type:", error)
    return { success: false, error: String(error) }
  }
}

// Close a bead
export async function closeBead(
  id: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdCloseBead(id, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to close bead:", error)
    return { success: false, error: String(error) }
  }
}

// Add a comment to a bead
export async function addComment(
  id: string,
  text: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdAddComment(id, text, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to add comment:", error)
    return { success: false, error: String(error) }
  }
}
