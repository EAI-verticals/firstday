---
sidebar_position: 1
slug: /cli/overview
---

# EAI CLI

The Enterprise AI CLI (`eai`) is the supported operator workflow for tenant-scoped app development on the Enterprise AI platform.

## Installation

```bash
npm config set @enterpriseai:registry https://eai-support.github.io/eai/registry/ --location=user
npm install -g @enterpriseai/cli
```

Verify installation:

```bash
eai --version
eai update --check
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `eai init` | Scaffold a new app |
| `eai login` | Authenticate with Entra CIAM |
| `eai dev` | Start local development server |
| `eai types` | Manage Object Type definitions |
| `eai tenant` | Manage tenants on the platform |
| `eai resources` | CRUD operations on platform resources |
| `eai chat` | Chat with AI workflows |
| `eai docs` | Document upload, classification, and indexing |
| `eai deploy` | Deployment management |
| `eai env` | Manage environment variables |
| `eai verify` | Run platform connectivity checks |
| `eai doctor` | Diagnose common issues and suggest fixes |
| `eai whoami` | Show auth status and tenant info |
| `eai errors` | Explain known CLI/platform errors and recovery commands |
| `eai agent guide` | Print AI-readable EAI CLI operating guidance |
| `eai update` | Check for and install newer CLI releases |

## AI Agent Discovery

Agents should ask the CLI how to use it before guessing command names or flags:

```bash
eai --describe
eai agent guide --format json
```

After an `eai` error, use the structured explanation path:

```bash
eai errors explain <code-or-reason> --format json
```

When a command is missing or help output looks stale, check drift first:

```bash
eai update --check
eai doctor --check-updates
```

When calling PublicAPI directly through `eai publicapi`, use only `/v4/...` paths.
For support/platform automation that uses app-token lookup routes outside the
tenant app runtime, use tenant-scoped routes like
`/v4/platform/tenants/<tenant-id>/users/by-email?email=<email>` and
`/v4/platform/tenants/<tenant-id>/users/<oid>/memberships`. Tenant app
ResourceAPI access should go through the signed-in-user `/api/eai` BFF path. If
a root `/v4/platform/users/...` call reports `MISSING_TENANT` or "Tenant context
required for app tokens", run:

```bash
eai errors explain app_token_tenant_context_required --format json
```

Do that before changing tenant members, role definitions, Entra configuration,
databases, or cloud portals.

## Getting Started Workflow

The standard workflow for a new or newly connected app is:

```bash
# 1. Authenticate and pick the tenant you are actually working on
eai login
eai tenant list --format json
eai tenant select <tenant-slug>
eai whoami

# 2. Define and validate your data model
eai types validate

# 3. Publish to the target tenant explicitly
eai types seed --tenant-key <tenant-key> --tenant-id <tenant-id> --format json

# 4. Verify remote convergence before you build on top
eai types diff --tenant-key <tenant-key> --tenant-id <tenant-id>
eai resources schema --tenant-id <tenant-id> --format json
eai verify calls --tenant-id <tenant-id> --resource-type <resource-type>

# 5. Start developing
eai dev
```

If `eai types diff` still shows local-only types or mismatched properties, treat the seed as incomplete and fix the underlying issue first.

## Common Workflows

### Define → Validate → Seed → Verify

```bash
eai types validate
eai types seed --tenant-key <tenant-key> --tenant-id <tenant-id> --format json
eai types diff --tenant-key <tenant-key> --tenant-id <tenant-id>
eai resources schema --tenant-id <tenant-id> --format json
```

### Check Platform Health

```bash
eai verify
eai verify calls --tenant-id <tenant-id> --resource-type <resource-type>
```

### Debug Issues

```bash
eai doctor --fix
eai errors explain <code-or-reason> --format json
```

### Deploy to Azure

```bash
eai deploy setup --repo eai-support/my-app
eai deploy trigger
eai deploy status
```

## Global Options

| Flag | Description |
|------|-------------|
| `-V, --version` | Display CLI version |
| `-h, --help` | Display help for any command |

Use `eai help <command>` to see detailed help for any command.
