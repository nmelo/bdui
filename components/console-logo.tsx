"use client"

import { useEffect } from "react"

const LOGO = `
%c██████╗ ███████╗ █████╗ ██████╗ ███████╗    ██╗   ██╗██╗
%c██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝    ██║   ██║██║
%c██████╔╝█████╗  ███████║██║  ██║███████╗    ██║   ██║██║
%c██╔══██╗██╔══╝  ██╔══██║██║  ██║╚════██║    ██║   ██║██║
%c██████╔╝███████╗██║  ██║██████╔╝███████║    ╚██████╔╝██║
%c╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝     ╚═════╝ ╚═╝
`

declare global {
  interface Window {
    bd: (command: string) => Promise<string>
    __BEADS_DB__?: string
  }
}

async function runBdCommand(command: string): Promise<string> {
  const args = command.split(/\s+/).filter(Boolean)

  if (args.length === 0) {
    const help = "Usage: await bd('show <id>')\nAllowed: show, list, comments, dep, search, config"
    console.log("%c" + help, "color: #fbbf24")
    return help
  }

  const params = new URLSearchParams(window.location.search)
  const db = params.get("db") || window.__BEADS_DB__

  try {
    const res = await fetch("/api/bd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args, db }),
    })

    const data = await res.json()
    const output = data.error || data.output || "No output"

    console.log("%c" + output, data.error ? "color: #ef4444" : "color: #a5b4fc; white-space: pre")
    return output
  } catch (err) {
    const msg = "Failed to execute command"
    console.log("%c" + msg, "color: #ef4444")
    return msg
  }
}

export function ConsoleLogo() {
  useEffect(() => {
    console.log(
      LOGO,
      "color: #6366f1",
      "color: #818cf8",
      "color: #a5b4fc",
      "color: #818cf8",
      "color: #6366f1",
      "color: #4f46e5"
    )
    console.log("%cType bd('help') for console commands", "color: #9ca3af; font-style: italic")

    window.bd = runBdCommand
  }, [])

  return null
}
