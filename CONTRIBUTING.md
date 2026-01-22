# Contributing to Beads UI

Thanks for your interest in contributing to Beads UI! This document outlines how to get started.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/nmelo/bdui.git
   cd bdui
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start the development server**
   ```bash
   pnpm dev
   ```

4. **Initialize a test beads database** (optional)
   ```bash
   bd init
   bd create "Test Epic" --type epic
   ```

## Project Structure

```
app/                 # Next.js app router pages and API routes
actions/             # Server actions for database operations
components/          # React components
  ui/                # shadcn/ui base components
hooks/               # Custom React hooks
lib/                 # Utilities, types, database access
public/              # Static assets
scripts/             # Build and release scripts
```

## Making Changes

### Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use functional components with hooks
- Prefer server actions over API routes for mutations

### Commits

- Write clear, concise commit messages
- Use conventional commit format when applicable:
  - `feat:` new features
  - `fix:` bug fixes
  - `docs:` documentation changes
  - `refactor:` code refactoring
  - `chore:` maintenance tasks

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally with `pnpm dev`
5. Commit your changes
6. Push to your fork
7. Open a Pull Request

## Areas for Contribution

- **Bug fixes**: Check the issues tab for reported bugs
- **Features**: New filtering options, views, or integrations
- **Performance**: Optimization of database queries or rendering
- **Documentation**: Improve README, add examples, or write guides
- **Tests**: Add test coverage

## Questions?

Open an issue for questions or discussion about potential contributions.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
