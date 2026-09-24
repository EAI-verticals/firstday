# Vending Machine App

An application built on the Enterprise AI platform.

## Tech Stack

- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript (strict mode)
- **UI**: React 18+, Tailwind CSS, Shadcn/ui
- **Auth**: Auth.js with Microsoft Entra ID (CIAM)
- **Data**: Platform SDK → data service (typed resource storage)
- **AI**: Platform SDK → AI service (RAG chat, document classification)

## Platform Architecture

```
Browser → Next.js App → BFF Proxy (/api/eai/*) → EAI Platform API
```

Tokens are injected server-side by the BFF proxy. Never exposed to the browser.

## App Router Rule

For `src/app/**/route.ts` files, export only:

- HTTP methods such as `GET`, `POST`, `PUT`, and `PATCH`
- supported route config fields such as `dynamic`, `runtime`, and `revalidate`

Do not export helper functions, dependency interfaces, or test seams from `route.ts`. Put those in a sibling `handler.ts` or a module under `src/lib/`, then keep `route.ts` as a thin wrapper.

## Object Types

Defined in `src/eai.config/object-types.ts`. Each type maps to a platform resource with typed validation, actions, and relationship links.

**Field types**: text, number, boolean, date, select, json, file, relationship
**Link cardinality**: one-to-one, one-to-many, many-to-one, many-to-many
**Action roles**: tenant-viewer, tenant-builder, tenant-admin
**Side effects**: set_field, set_timestamp, set_user

## Data Access

```typescript
// React hook (client components)
import { useResources } from '@/hooks/useResources';
const { list, get, create, update, delete: remove } = useResources<MyData>('MyType');

// Platform SDK (server-side)
import { EAIPlatformClient } from '@enterpriseaigroup/platform-sdk';
const client = new EAIPlatformClient({ tenantId: 'my-tenant' });
await client.resources.create('MyType', { title: 'Hello' });
```

## EAI CLI Commands

| Command | Purpose |
|---------|---------|
| `eai dev` | Start local dev server |
| `eai tenant select` | Choose the active tenant for platform commands |
| `eai types validate` | Validate Object Types |
| `eai types seed` | Push types to platform |
| `eai types diff` | Compare local vs remote |
| `eai resources list <type>` | List resources |
| `eai chat stream <msg>` | Test AI chat |
| `eai env pull` | Sync cloud config |
| `eai deploy trigger` | Trigger deployment |
| `eai verify` | Platform connectivity check |
| `eai doctor` | Diagnose issues |

## App Delivery Checklist

| Step | Action | Verification |
|------|--------|-------------|
| 1 | Define object types in `src/eai.config/object-types.ts` | `eai types validate` passes |
| 2 | Set up tenant config in `src/eai.config/` | Config registered in index.ts |
| 3 | Create data access hooks in `src/hooks/` | Hooks use Platform SDK |
| 4 | Build UI pages in `src/app/(presentation)/` | Pages render with data |
| 5 | Configure AI chat/docs (if needed) | Chat streams, docs upload |
| 6 | Seed object types | `eai types seed` succeeds |
| 7 | Configure deployment | `deploy-demo.yml` has correct APP_NAME |
| 8 | Deploy | `eai deploy trigger` → app loads at `/vending-machine-app` |
| 9 | Verify | `eai verify` all checks pass |

## Environment Variables

See `.env.local` for required variables. Use `eai env pull` to sync from Azure App Config.

Key variables:
- `BASE_URL_PUBLIC_API` — Platform API gateway URL
- `WORKFLOW_*_ID` — Platform workflow IDs
- `ENTRA_*` — Microsoft Entra ID (CIAM) auth config
- `AUTH_SECRET` — Auth.js session encryption key

## Key Files

| File | Purpose |
|------|---------|
| `src/eai.config/object-types.ts` | Data model definitions |
| `src/eai.config/default.ts` | Tenant configuration |
| `src/auth.ts` | Auth.js configuration |
| `src/app/api/eai/[[...rest]]/route.ts` | BFF proxy (token injection) |
| `packages/platform-sdk/` | Local typed API client source until the SDK is promoted to a shared package |
| `.github/workflows/deploy-demo.yml` | Deployment workflow |

## Gofer Pipeline

Run `/eai` to start or continue the core pipeline: Gofer Start -> research ->
specify -> plan -> tasks -> implement -> validate. Gofer routes
internally through `.specify/commands/*.md`; validation is the terminal quality
gate. Before EAI readiness, app delivery continues directly, while clear non-app
work asks once before skipping EAI tenant/app setup. Checkpointing, branding, tests,
stakeholder communications, first-run setup, and diagnostics remain internal contracts.
Artifacts go to `.specify/specs/{feature}/`. When the user says `Get started with EAI`, including decorative emoji, load the public `eai` skill; for a new app conversation, show its Required First-Run Response before running preflight or asking setup questions.
