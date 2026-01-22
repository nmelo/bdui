# CLAUDE.md - bdui

## Project Overview

Web UI for the `bd` (beads) issue tracker CLI. Built with Next.js 16, React 19, Tailwind CSS, and shadcn/ui components.

## Key Commands

```bash
pnpm dev          # Start dev server on port 3000
pnpm build        # Production build
pnpm release      # Build + package standalone tarball
```

## Release Process

1. Bump version: `npm version patch --no-git-tag-version`
2. Commit and tag:
   ```bash
   git add package.json && git commit -m "chore: bump version to X.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```
3. Build release: `pnpm release`
4. Create GitHub release with asset:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes"
   gh release upload vX.Y.Z dist/beads-ui-X.Y.Z-standalone.tar.gz
   ```
5. Push Docker image:
   ```bash
   docker build -t ghcr.io/nmelo/beads-ui:X.Y.Z -t ghcr.io/nmelo/beads-ui:latest .
   docker push ghcr.io/nmelo/beads-ui:X.Y.Z
   docker push ghcr.io/nmelo/beads-ui:latest
   ```
6. Update homebrew tap:
   ```bash
   cd ~/Desktop/Projects/homebrew-tap
   # Edit Formula/beads-ui.rb - update version, url, sha256
   git commit -am "beads-ui: update to X.Y.Z" && git push
   ```

## bd CLI Integration

The app wraps the `bd` CLI tool via `lib/bd.ts`. Key patterns:

- All commands use `--no-daemon --allow-stale` flags
- Database path passed via `--db` flag
- **IMPORTANT**: `bd delete` requires `--force` flag to actually delete (without it, shows preview only)

```typescript
// Example from lib/bd.ts
await bdExecRaw(["delete", id, "--force"], options)
```

## Workspace Detection

Workspaces are detected from:
1. Registered workspaces in bd config
2. Projects with `.beads/beads.db` directories

The `databasePath` must be passed to all server actions for multi-workspace support.

## Architecture

```
app/page.tsx           # Main page with epic tree, filters, modal
actions/beads.ts       # Server actions for CRUD operations
actions/epics.ts       # Server actions for loading epics
lib/bd.ts              # bd CLI wrapper functions
lib/types.ts           # TypeScript types
components/            # UI components (shadcn/ui based)
```

## Testing Workspaces

The nayutal_app workspace uses: `~/Desktop/Projects/nayutal_app/.beads/beads.db`

To test bd commands against it:
```bash
bd --db ~/Desktop/Projects/nayutal_app/.beads/beads.db list --all
```
