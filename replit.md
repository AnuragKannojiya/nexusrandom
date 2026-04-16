# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### NexusRandom (`artifacts/nexus-random`)
- **Kind**: web (React + Vite)
- **Preview path**: `/nexus-random/`
- **Port**: 5000
- **Description**: Omegle-like random chat platform

**Features:**
- Real-time text and WebRTC video chat
- Socket.io-based matchmaking with queue system
- Anonymous stranger identities (e.g., CyberStorm_4821)
- Typing indicators
- Live online user count
- User reporting system
- Ban management
- Moderation dashboard at `/nexus-random/moderation`

### API Server (`artifacts/api-server`)
- **Kind**: api (Node.js + Express 5)
- **Port**: 8080
- **Paths**: `/api`, `/socket.io`
- **Routes**: stats, reports, bans, Socket.io matchmaking

**Important**: The frontend `previewPath` MUST use `/nexus-random/` (not `/`) because Replit's artifact workflow port detection doesn't work when the artifact is registered at the root path `/`. Using a subpath like `/nexus-random/` allows the proxy health check to properly detect the workflow.

## Database Schema

- `reports` - User-submitted reports with sessionId, reason, reporterHash
- `bans` - Active bans with ipHash, reason, expiresAt
- `session_logs` - Chat session history

## IP Hashing

IPs are hashed with salt `"nexusrandom_salt_2024"` using SHA-256. Stored as `ipHash` in the database.

## Stranger Names

Generated as `{Adjective}{Noun}_{4digits}` (e.g., `CyberStorm_4821`).
