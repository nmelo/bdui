"use client"

import React from "react"

import { useState } from "react"
import { Check } from "lucide-react"

interface CopyableIdProps {
  id: string
  className?: string
}

export function CopyableId({ id, className = "" }: CopyableIdProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)

      setTimeout(() => {
        setCopied(false)
      }, 1000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => e.key === "Enter" && handleCopy(e as unknown as React.MouseEvent)}
      className={`inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-all cursor-pointer min-w-[5rem] ${className}`}
      title={`Click to copy ${id}`}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1 text-primary animate-in fade-in duration-150">
          <Check className="h-3.5 w-3.5" />
          <span className="text-xs">Copied</span>
        </span>
      ) : (
        <span className="transition-opacity">{id}</span>
      )}
    </span>
  )
}
