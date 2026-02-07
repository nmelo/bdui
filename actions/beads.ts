"use server"

import {
  updateStatus as bdUpdateStatus,
  updatePriority as bdUpdatePriority,
  updateAssignee as bdUpdateAssignee,
  updateTitle as bdUpdateTitle,
  updateDescription as bdUpdateDescription,
  updateType as bdUpdateType,
  updateParent as bdUpdateParent,
  closeBead as bdCloseBead,
  deleteBead as bdDeleteBead,
  addComment as bdAddComment,
  deleteComment as bdDeleteComment,
  addLabel as bdAddLabel,
  removeLabel as bdRemoveLabel,
  getCustomStatuses as bdGetCustomStatuses,
  unmapPriority,
  type BdOptions,
} from "@/lib/bd"
import type { BeadPriority, BeadType } from "@/lib/types"

// Update bead status
export async function updateBeadStatus(
  id: string,
  status: string,
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

// Get all available statuses (core + custom)
export async function getAvailableStatuses(dbPath?: string): Promise<string[]> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}
  const coreStatuses = ["open", "in_progress", "closed"]

  try {
    const customStatuses = await bdGetCustomStatuses(options)
    return [...coreStatuses, ...customStatuses]
  } catch {
    return coreStatuses
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

// Delete a comment
export async function deleteCommentAction(
  commentId: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  if (!dbPath) {
    return { success: false, error: "Database path required" }
  }
  const options: BdOptions = { db: dbPath }

  try {
    await bdDeleteComment(commentId, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to delete comment:", error)
    return { success: false, error: String(error) }
  }
}

// Update bead parent (move to different epic or standalone)
export async function updateBeadParent(
  id: string,
  parentId: string | null,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdUpdateParent(id, parentId, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to update parent:", error)
    return { success: false, error: String(error) }
  }
}

// Delete a bead
export async function deleteBead(
  id: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdDeleteBead(id, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to delete bead:", error)
    return { success: false, error: String(error) }
  }
}

// Archive or unarchive a bead
export async function archiveBead(
  id: string,
  archived: boolean,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    if (archived) {
      await bdAddLabel(id, "archived", options)
    } else {
      await bdRemoveLabel(id, "archived", options)
    }
    return { success: true }
  } catch (error) {
    console.error("Failed to archive bead:", error)
    return { success: false, error: String(error) }
  }
}

// Move a bead to or from backlog
export async function backlogBead(
  id: string,
  inBacklog: boolean,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    if (inBacklog) {
      await bdAddLabel(id, "backlog", options)
    } else {
      await bdRemoveLabel(id, "backlog", options)
    }
    return { success: true }
  } catch (error) {
    console.error("Failed to update backlog status:", error)
    return { success: false, error: String(error) }
  }
}

// Add a label to a bead
export async function addLabelAction(
  id: string,
  label: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdAddLabel(id, label, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to add label:", error)
    return { success: false, error: String(error) }
  }
}

// Remove a label from a bead
export async function removeLabelAction(
  id: string,
  label: string,
  dbPath?: string
): Promise<{ success: boolean; error?: string }> {
  const options: BdOptions = dbPath ? { db: dbPath } : {}

  try {
    await bdRemoveLabel(id, label, options)
    return { success: true }
  } catch (error) {
    console.error("Failed to remove label:", error)
    return { success: false, error: String(error) }
  }
}
