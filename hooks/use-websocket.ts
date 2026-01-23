"use client"

import { useEffect, useRef, useCallback } from "react"

interface UseWebSocketOptions {
  dbPath?: string
  onChange?: () => void
  enabled?: boolean
}

export function useWebSocket({ dbPath, onChange, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const onChangeRef = useRef(onChange)
  const reconnectRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const connect = useCallback(() => {
    if (!enabled || !dbPath) return
    wsRef.current?.close()
    if (reconnectRef.current) clearTimeout(reconnectRef.current)

    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001"
    const ws = new WebSocket(`ws://localhost:${wsPort}?db=${encodeURIComponent(dbPath)}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === "change") onChangeRef.current?.()
      } catch {
        // Ignore parse errors
      }
    }

    ws.onclose = () => {
      reconnectRef.current = setTimeout(() => enabled && connect(), 3000)
    }
  }, [dbPath, enabled])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
