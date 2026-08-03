# Contributing to XO Royale

Thanks for helping improve the table. Small, focused pull requests are the
easiest to review and safest to deploy.

## Before you start

- Search existing issues before opening a new one.
- Open a feature request before changing game rules, room protocol messages,
  identity, persistence, or deployment behavior.
- Never include real room data, Redis credentials, resume tokens, or local
  `.env` files in an issue or pull request.

## Development setup

```bash
npm ci
npm run dev
```

XO Royale uses Node.js 24. The Vite client runs on port `5173` and proxies API
and WebSocket traffic to the local room server on port `4242`.

## Quality gate

Run this before opening a pull request:

```bash
npm run check
npm audit --omit=dev
```

For protocol changes, start the local server and run:

```bash
npm run smoke
```

## Pull requests

- Explain the user-visible outcome and why the change is needed.
- Add or update tests for game-engine and WebSocket behavior.
- Include mobile and desktop evidence for visual changes.
- Keep unrelated formatting or dependency updates out of the same change.
- Preserve backward compatibility for active Redis rooms unless the migration
  or recreation behavior is documented explicitly.

## Code style

- Use two-space indentation and existing naming conventions.
- Keep the game engine server-authoritative.
- Treat all client-supplied identity and move data as untrusted.
- Prefer accessible names and native controls for interactive UI.
- Keep credentials server-side and out of public room payloads.
