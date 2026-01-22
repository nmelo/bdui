"use client"

import React from "react"

interface SimpleMarkdownProps {
  content: string
  className?: string
}

export function SimpleMarkdown({ content, className = "" }: SimpleMarkdownProps) {
  // Simple markdown parser for common patterns
  const parseMarkdown = (text: string) => {
    const lines = text.split("\n")
    const elements: React.ReactNode[] = []
    let currentList: string[] = []
    let listType: "ordered" | "unordered" | null = null

    const flushList = () => {
      if (currentList.length > 0) {
        if (listType === "ordered") {
          elements.push(
            <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 my-2 text-muted-foreground">
              {currentList.map((item, i) => (
                <li key={i}>{parseInline(item)}</li>
              ))}
            </ol>
          )
        } else {
          elements.push(
            <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-muted-foreground">
              {currentList.map((item, i) => (
                <li key={i}>{parseInline(item)}</li>
              ))}
            </ul>
          )
        }
        currentList = []
        listType = null
      }
    }

    const parseInline = (text: string): React.ReactNode => {
      // Code blocks inline
      let result: React.ReactNode[] = []
      const parts = text.split(/(`[^`]+`)/)
      
      parts.forEach((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          result.push(
            <code key={i} className="px-1.5 py-0.5 rounded bg-slate-700 text-emerald-400 text-xs font-mono">
              {part.slice(1, -1)}
            </code>
          )
        } else {
          // Bold
          const boldParts = part.split(/(\*\*[^*]+\*\*)/)
          boldParts.forEach((bp, j) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              result.push(<strong key={`${i}-${j}`} className="font-semibold text-foreground">{bp.slice(2, -2)}</strong>)
            } else {
              result.push(bp)
            }
          })
        }
      })
      
      return result
    }

    lines.forEach((line, index) => {
      const trimmed = line.trim()

      // Headers
      if (trimmed.startsWith("## ")) {
        flushList()
        elements.push(
          <h3 key={index} className="text-sm font-semibold text-foreground mt-4 mb-2">
            {trimmed.slice(3)}
          </h3>
        )
        return
      }

      if (trimmed.startsWith("# ")) {
        flushList()
        elements.push(
          <h2 key={index} className="text-base font-semibold text-foreground mt-4 mb-2">
            {trimmed.slice(2)}
          </h2>
        )
        return
      }

      // Ordered list
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/)
      if (orderedMatch) {
        if (listType !== "ordered") {
          flushList()
          listType = "ordered"
        }
        currentList.push(orderedMatch[2])
        return
      }

      // Unordered list
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (listType !== "unordered") {
          flushList()
          listType = "unordered"
        }
        currentList.push(trimmed.slice(2))
        return
      }

      // Checkbox list
      if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [ ]")) {
        flushList()
        const checked = trimmed.startsWith("- [x]")
        const text = trimmed.slice(6)
        elements.push(
          <div key={index} className="flex items-center gap-2 my-1">
            <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${checked ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "border-slate-500"}`}>
              {checked && "✓"}
            </span>
            <span className="text-muted-foreground">{parseInline(text)}</span>
          </div>
        )
        return
      }

      // Empty line
      if (trimmed === "") {
        flushList()
        return
      }

      // Regular paragraph
      flushList()
      elements.push(
        <p key={index} className="text-sm text-muted-foreground my-2">
          {parseInline(trimmed)}
        </p>
      )
    })

    flushList()
    return elements
  }

  return <div className={className}>{parseMarkdown(content)}</div>
}
