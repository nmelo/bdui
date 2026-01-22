"use client"

import { useEffect, useCallback, useRef } from "react"

interface SSEEvent {
  type: "connected" | "change"
  timestamp?: number
  db?: string
}

interface UseSSEOptions {
  dbPath?: string
  onChange?: () => void
  enabled?: boolean
}

export function useSSE({ dbPath, onChange, enabled = true }: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onChangeRef = useRef(onChange)

  // Keep callback ref up to date
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const connect = useCallback(() => {
    if (!enabled) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Build URL with optional db path
    const url = new URL("/api/events", window.location.origin)
    if (dbPath) {
      url.searchParams.set("db", dbPath)
    }

    const eventSource = new EventSource(url.toString())
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data)

        if (data.type === "change") {
          onChangeRef.current?.()
        }
      } catch {
        // Ignore parse errors (like heartbeats)
      }
    }

    eventSource.onerror = () => {
      // Reconnect after a delay
      eventSource.close()
      setTimeout(() => {
        if (enabled) {
          connect()
        }
      }, 5000)
    }
  }, [dbPath, enabled])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [connect])
}
