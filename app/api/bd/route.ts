import { NextRequest, NextResponse } from "next/server"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const ALLOWED_COMMANDS = ["show", "list", "comments", "dep", "search", "config", "help"]

export async function POST(request: NextRequest) {
  try {
    const { args, db } = await request.json()

    if (!args || !Array.isArray(args) || args.length === 0) {
      return NextResponse.json({ error: "No command provided" }, { status: 400 })
    }

    // Validate args are strings without shell metacharacters
    for (const arg of args) {
      if (typeof arg !== "string" || /[;&|`$(){}]/.test(arg)) {
        return NextResponse.json({ error: "Invalid argument" }, { status: 400 })
      }
    }

    const command = args[0]
    if (!ALLOWED_COMMANDS.includes(command)) {
      return NextResponse.json(
        { error: `Command '${command}' not allowed. Allowed: ${ALLOWED_COMMANDS.join(", ")}` },
        { status: 403 }
      )
    }

    const bdArgs = ["--no-daemon", "--allow-stale"]
    if (db && typeof db === "string" && !/[;&|`$(){}]/.test(db)) {
      bdArgs.push("--db", db)
    }
    bdArgs.push(...args)

    try {
      const { stdout, stderr } = await execFileAsync("bd", bdArgs, { timeout: 10000 })
      const output = (stdout || stderr).trim()
      return NextResponse.json({ output })
    } catch (execError: unknown) {
      const err = execError as { stdout?: string; stderr?: string; message?: string }
      const output = (err.stdout || err.stderr || err.message || "Command failed").trim()
      return NextResponse.json({ output })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
