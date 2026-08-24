# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS v4 + Shadcn/ui components

### Auth

Authentication is a **custom in-memory implementation** in `lib/auth.ts` — not production-ready. Users and sessions are stored in `Map` objects that reset on server restart. Passwords are stored in plaintext. Session identity is tracked via an HTTP-only cookie (`app_session`).

Server actions for sign-in, register, and sign-out live in `app/actions/auth.ts`. The root page (`app/page.tsx`) and dashboard layout (`app/dashboard/layout.tsx`) call `isAuthenticated()` / `getCurrentUser()` (server-only) to enforce access.

### Database Layer

The app connects to a Supabase PostgreSQL instance via the PostgREST REST API — no ORM. All DB access is in `lib/supabase/db.ts`:
- `getTables()` — introspects schema via the Supabase OpenAPI spec (`/rest/v1/`), result cached 30s
- `getTableRows(table, offset)` — paginated fetch, 50 rows per page
- `getTableCount(table)` — row count via `Prefer: count=exact` header

### Routing & Layout

```
/ → redirect to /dashboard or /login
/login → LoginForm (client component, handles sign-in/register toggle)
/dashboard → protected; layout fetches tables and renders sidebar
/dashboard/[table] → paginated table data viewer
```

The dashboard layout (`app/dashboard/layout.tsx`) is the main auth gate and data-fetching point for the sidebar.

## Environment Variables

Required for Supabase access:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

TypeScript build errors are suppressed in `next.config.mjs` (`ignoreBuildErrors: true`).
